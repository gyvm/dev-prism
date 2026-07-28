# Explore 新画面要素のデータ取得 SQL 設計

Explore ダッシュボード（DuckDB-WASM がブラウザ内で parquet をライブクエリ）に追加する画面要素の
**データ取得 SQL 設計と実装メモ**。集計ロジックは凍結レポート（DuckDB-native）と Explore で
**同一の `buildXxxSql(scope)` を共有**し数値 parity を保証する（設計 D4）。

> **注**: 本文中の「実装」ファイルパスは設計時のリファレンス実装
> （[PR #22](https://github.com/gyvm/dev-prism/pull/22)、マージせずクローズ）を指す。
> 実装時は本ドキュメントの SQL・型定義を正とし、必要なら PR #22 のコードを参照する。

- 実装: `src/analyses/{cycle-time,review-metrics,aging}/query.ts`、`dora-metrics/query.ts`(追記)、
  共有部品 `src/analyses/cycle-time/stage-sql.ts`、束ね `src/analyses/explore-queries.ts`。
- フィルタヘルパー: `src/analyses/scope-sql.ts`（`inListFilter` / `eitherInListFilter` /
  `timeRangeFilter` / `botFilter`）。ユーザーフィルタは各テーブルの actor-login 列に対する
  `inListFilter` で表現する（専用ヘルパーは無い）。
- 時間差は `(epoch_ms(a) - epoch_ms(b)) / 3600000.0` の小数時間、中央値は `median()`、条件付き集計は
  `FILTER (WHERE ...)`、トレンドは `date_trunc('${grain}', col)`。count は行型で `bigint | number` →
  `Number()`、timestamp は `CAST(... AS VARCHAR)` → `toIso()`。

> 調査の裏付け（外部記事）: LinearB のサイクルタイム段階定義（coding→pickup→review→approve→merge、
> draft は ready 化で起点差し替え）、time-to-first-response 研究（人間の初回応答が PR latency の
> 約65%を説明、bot はほぼ無関係）、CHAOSS / Linux Foundation はレビュー応答時間に median を推奨、
> aging バケットの定番区切り（<1d / 1–3d / 3–7d / 7–14d / 14d+）。

---

## 共有部品: `cycle-time/stage-sql.ts`

4段階の定義を 1-2 / 1-3 / 2-3 で共有する。

- **オープン起点** `OPEN_START = COALESCE(pr.ready_for_review_at, pr.created_at)`。draft を経た PR は
  「レビュー可能になった瞬間」を起点にでき、非 draft では `ready_for_review_at` が NULL なので
  `created_at` に一致する（`boundaries.ts` の `readyForReviewAt` と整合）。
- **初コミット CTE** `first_commit`: `min(COALESCE(authored_at, committed_at))`。rebase で早まりうる
  `authored_at` を優先。
- **人間レビュー再計算 CTE** `human_review`: `min(submitted_at)` と
  `min(submitted_at) FILTER (state='APPROVED')` を **`NOT is_bot` 条件付き**で算出。
  `reviewExprs(scope)` が `scope.includeBots` を見て「事前計算列（bot 込み・高速）」か
  「再計算 CTE（bot 除外）」かを切り替える。

**parity 上の決定打**: `entities.ts` は `first_review_at = min(pr_reviews.submitted_at)`、
`first_approve_at = min(submitted_at WHERE state='APPROVED')` として列を作る。よって再計算 CTE は
事前計算列＋`NOT is_bot` 述語と**定義上完全一致**し、bot がいなければ両者は厳密に等しい。
→ includeBots で経路を分けても parity リスクはゼロ。列の計算規則が将来変わったら CTE も同時に直すこと
（`stage-sql.ts` 冒頭コメントに明記済み）。

---

## 1-1b. DORA 前期間比較

**新規 SQL なし**。`buildDoraSql` を変更せず、`queryDoraComparison`（`dora-metrics/query.ts`）が
現/前期間で2回実行して差分を返す。

- 論点①（1クエリ vs 2回実行）→ **2回実行**。`buildDoraSql` を一切変えず parity を維持でき、DORA は
  小さな集約1行なので WASM で2回スキャンしても無視できる。UNION+期間タグは共有ビルダー改変が必要で不利。
- 論点②（前期間境界）→ **TS 側**。`scope.ts` の `previousScope(scope)`（`to = from-1ms`,
  `from = to - 期間長`）。from/to が片側でも null なら比較不可 → `previous`/`delta` を null。

```ts
type DoraDelta = { deploymentFrequency: number|null; leadTimeForChangesHours: number|null;
                   changeFailureRatePercent: number|null; mttrHours: number|null };
type DoraComparison = { current: DoraMetrics; previous: DoraMetrics | null; delta: DoraDelta | null };
```

意味上の決定: 被除数が null のメトリクスの delta は null（比較不能）/ 期間片側 null は比較全体を null
（「同じ長さの直前期間」が定義できない）/ delta は絶対差（%変化は UI 側）。

---

## 1-2. サイクルタイムファネル

マージ済み PR を対象に4段階の p50 と母数 n を **1段階=1行**で返す（`buildCycleFunnelSql`）。

```sql
WITH first_commit AS (
  SELECT pr_id, min(COALESCE(authored_at, committed_at)) AS commit_at FROM pr_commits GROUP BY pr_id
)${humanReviewCte}
, staged AS (
  SELECT (epoch_ms(${openStart}) - epoch_ms(fc.commit_at)) / 3600000.0        AS s1,  -- commit→open
         (epoch_ms(${firstReview}) - epoch_ms(${openStart})) / 3600000.0      AS s2,  -- open→review
         (epoch_ms(${firstApprove}) - epoch_ms(${firstReview})) / 3600000.0   AS s3,  -- review→approve
         (epoch_ms(pr.merged_at) - epoch_ms(${firstApprove})) / 3600000.0     AS s4   -- approve→merge
  FROM pull_requests pr
  JOIN repos r ON r.repo_id = pr.repo_id
  LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
  LEFT JOIN first_commit fc ON fc.pr_id = pr.pr_id
  ${humanReviewJoin}
  WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
)
SELECT 1 AS stage, 'commit_to_open' AS stage_key,
       median(s1) FILTER (WHERE s1 >= 0) AS p50_hours, count(s1) FILTER (WHERE s1 >= 0) AS n FROM staged
UNION ALL SELECT 2, 'open_to_review',    median(s2) FILTER (WHERE s2 >= 0), count(s2) FILTER (WHERE s2 >= 0) FROM staged
UNION ALL SELECT 3, 'review_to_approve', median(s3) FILTER (WHERE s3 >= 0), count(s3) FILTER (WHERE s3 >= 0) FROM staged
UNION ALL SELECT 4, 'approve_to_merge',  median(s4) FILTER (WHERE s4 >= 0), count(s4) FILTER (WHERE s4 >= 0) FROM staged
ORDER BY stage
```

```ts
type CycleFunnelStage = { stage: number; key: "commit_to_open"|"open_to_review"|"review_to_approve"|"approve_to_merge";
                          p50Hours: number|null; n: number };
type CycleFunnel = { stages: CycleFunnelStage[] /* 長さ4 */ };
```

意味上の決定:
- 段階ごとに両端が非 NULL の行のみを母数に（`count(sN)` は NULL を数えない）→ 段階別 n。
- `first_commit` は **LEFT JOIN**。pr_commits が無い PR（squash 直マージ等）は s1 だけ NULL で s1 の母数から
  自然に落ち、s2–s4 には影響しない（各段階が独立に母数を持つ）。
- 負値（rebase 等で初コミットが created_at より後）は **除外**（`>= 0` FILTER）。0 クリップは中央値を
  0 側へ歪めるため、少数のデータ品質ノイズは除外が素直。

論点回答: ①負値=除外 / ②draft=`OPEN_START` で ready へ差し替え / ③bot OFF=`human_review` CTE で再計算。

---

## 1-3. リードタイムの推移

`date_trunc(grain, merged_at)` バケットごとに 1-2 と同じ4段階の p50（+各 n）をワイド出力
（`buildLeadTrendSql`）。1-2 と同一の段階式・負値除外を使うので parity。

```ts
type LeadTrendBucket = { bucket: string /*UTC ISO*/;
  stages: { p50Hours: number|null; n: number }[] /* 長さ4, index=stage-1 */ };
type LeadTrend = { grain: Grain; buckets: LeadTrendBucket[] };
```

意味上の決定: バケットは `merged_at` 基準（完了時点に計上、activity-trend と同思想）/ 段階×バケットごとに
独立 n（疎なバケットは p50=null）。

---

## 2-1. レビューなしマージ

期間内マージ PR のうち「レビュー1件もないままマージ」の件数・分母・率（`buildReviewlessMergesSql`）。

```sql
SELECT count(*) AS merged_n,
       count(*) FILTER (WHERE ${reviewless}) AS reviewless_n
FROM pull_requests pr
JOIN repos r ON r.repo_id = pr.repo_id
LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
```

`${reviewless}`:
- includeBots=true → `pr.first_review_at IS NULL`（JOIN 不要）
- includeBots=false → `NOT EXISTS (SELECT 1 FROM pr_reviews rv JOIN actors rvw ON rvw.actor_id=rv.author_actor_id
  WHERE rv.pr_id=pr.pr_id AND rv.submitted_at IS NOT NULL AND NOT rvw.is_bot)`

```ts
type ReviewlessMerges = { mergedCount: number; reviewlessCount: number; rate: number|null /* 分母0でnull */ };
```

論点回答: 事前計算列方式と `NOT EXISTS` 方式 → **includeBots で使い分け**。bot 込みは事前計算列が
「全レビューの min(submitted_at)」なので `IS NULL` が厳密に「レビュー皆無」を表し join を省ける。
bot 除外は列が bot を含むため `NOT EXISTS` 再計算が必須。bot がいなければ両者一致で parity 安全。
「レビュー」= `submitted_at` 非 NULL の pr_reviews 行（PENDING は自然に除外、COMMENTED/CHANGES_REQUESTED も
1件とみなす＝first_review_at の定義と一致）。

---

## 2-3. サイズ × レビュー着手の散布図

期間内マージ PR を1点=1行（X=オープン→初回レビュー時間、Y=additions+deletions、遷移用に
number/title/url/repo_key）（`buildSizePickupScatterSql`）。

```sql
WITH ${humanReviewCte}scatter AS (
  SELECT pr.number, pr.title, pr.url, r.repo_key,
         (epoch_ms(${firstReview}) - epoch_ms(${openStart})) / 3600000.0 AS pickup_hours,
         COALESCE(pr.additions,0) + COALESCE(pr.deletions,0) AS size_lines, pr.merged_at
  FROM pull_requests pr
  JOIN repos r ON r.repo_id = pr.repo_id
  LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
  ${humanReviewJoin}
  WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
    AND ${firstReview} IS NOT NULL AND (epoch_ms(${firstReview}) - epoch_ms(${openStart})) >= 0
)
SELECT number, title, url, repo_key, pickup_hours, size_lines, count(*) OVER () AS total_matched
FROM scatter ORDER BY merged_at DESC LIMIT ${scatterMaxPoints}
```

```ts
type SizePickupPoint = { number:number; title:string|null; url:string|null; repoKey:string;
                         pickupHours:number; sizeLines:number };
type SizePickupScatter = { points: SizePickupPoint[]; totalMatched: number; truncated: boolean };
```

論点回答:
- ①レビューなし PR（X=NULL）→ **散布図から除外**（X 軸位置が無いため）。件数は 2-1 が担う。
- ②点数上限 → 既定 2000（`scope.thresholds.scatterMaxPoints`）。選抜は **`merged_at DESC`（最新優先）**。
  size 上位偏重はバイアス。`count(*) OVER ()` で上限適用前の総数を返し、`truncated` を UI 表示。
- pickup 負値も除外（1-2 と整合）。

---

## 2-5. レビュアー別リードタイム

レビュアーごと「依頼→初回レビュー」の代表時間（`buildReviewerLeadSql`）。`activities` の
`review_requested`(target_actor_id) と、依頼より後の同一アクターの `review_submitted` を突合。

```sql
WITH requests AS (          -- (pr, reviewer) ごと最初の依頼
  SELECT a.pr_id, a.target_actor_id AS reviewer_id, min(a.occurred_at) AS requested_at
  FROM activities a JOIN repos r ON r.repo_id = a.repo_id
  WHERE a.event_type='review_requested' AND a.target_actor_id IS NOT NULL${repoFilter}${reqTime}
  GROUP BY a.pr_id, a.target_actor_id
),
submits AS (
  SELECT a.pr_id, a.actor_id AS reviewer_id, a.occurred_at AS submitted_at
  FROM activities a WHERE a.event_type='review_submitted' AND a.actor_id IS NOT NULL
),
first_response AS (
  SELECT req.reviewer_id, req.pr_id, req.requested_at, min(s.submitted_at) AS responded_at
  FROM requests req
  LEFT JOIN submits s ON s.pr_id=req.pr_id AND s.reviewer_id=req.reviewer_id AND s.submitted_at >= req.requested_at
  GROUP BY req.reviewer_id, req.pr_id, req.requested_at
)
SELECT rvw.login AS reviewer,
       median((epoch_ms(responded_at)-epoch_ms(requested_at))/3600000.0) FILTER (WHERE responded_at IS NOT NULL) AS p50_hours,
       count(*) FILTER (WHERE responded_at IS NOT NULL) AS responded_n,
       count(*) FILTER (WHERE responded_at IS NULL)     AS pending_n
FROM first_response fr JOIN actors rvw ON rvw.actor_id = fr.reviewer_id
WHERE rvw.login IS NOT NULL${reviewerBots}${reviewerUsers}
GROUP BY rvw.login ORDER BY p50_hours DESC NULLS LAST, reviewer ASC
```

```ts
type ReviewerLead = { reviewer:string; p50Hours:number|null; respondedCount:number; pendingCount:number };
type ReviewerLeadTimes = { reviewers: ReviewerLead[] };
```

論点回答:
- ①再依頼 → **最初の依頼のみ**（`min(occurred_at)`）。二重計上を避ける。
- ②依頼なしの自発レビュー → **含めない**（requests に無く join されない）。
- ③代表値 → **p50（median）**（仕様は平均だが、CHAOSS/Linux Foundation は median 推奨、外れ値1件で平均が跳ねる）。
- ④未応答 → **除外＋注記**。p50 からは外し `pending_n` を打ち切りとして返す。

---

## 4-1〜4-3. 滞留ページ（オープン PR スナップショット）

共通: 対象 `merged_at IS NULL AND closed_at IS NULL`。**時間フィルタは適用しない**（backlog は「現時点」）。
repo/user/bot は適用。「現在時刻」は `${nowTs}` = ラッパーが `scopeTimestamp(scope.to ?? now)` で作った
`TIMESTAMP '...'` リテラルを注入する。ビルダー署名は例外的に `buildAgingXxxSql(scope, nowTs)`（純粋・決定的）。

共有 CTE（`aging/query.ts`）:
- `latest_review`: `arg_max(state, submitted_at)` と `max(submitted_at)`（最新レビュー state と時刻）。
- `last_commit`: `max(committed_at)`（変更依頼後の再プッシュ検出用）。
- `ball_holders`: `pr_review_requests` の現在依頼先を `string_agg(DISTINCT login ORDER BY login)`。

状態導出（優先順）と awaiting_review 述語は共有:
```sql
CASE
  WHEN coalesce(pr.is_draft,false) THEN 'draft'
  WHEN pr.first_approve_at IS NOT NULL THEN 'approved'
  WHEN coalesce(lr.state='CHANGES_REQUESTED' AND (lc.at IS NULL OR lc.at<=lr.submitted_at), false) THEN 'changes_requested'
  ELSE 'awaiting_review'
END
```

- **4-2 エイジングテーブル** (`buildAgingTableSql`): 1行1 PR。number/title/url/repo_key/author/status/
  ball_holder（awaiting_review は依頼先 `bh.holders`、他は author）/age_hours/created_at/updated_at。`age_hours DESC`。
- **4-1 サマリ** (`buildAgingSummarySql`): open 数 / awaiting_review 数（4-2 の ELSE 分岐と**同一述語**）/
  最古 PR 経過日数（`max(age)/24`、open 0 件で null）。
- **4-3 ヒストグラム** (`buildAgingHistogramSql`): `<1d / 1-3d / 3-7d / 7-14d / 14d+`（境界 24/72/168/336h）。
  ラッパーで5バケットを固定順に整列（0 件も補完）。

```ts
type AgingStatus = "draft"|"approved"|"changes_requested"|"awaiting_review";
type AgingPr = { number:number; title:string|null; url:string|null; repoKey:string; author:string|null;
                 status:AgingStatus; ballHolder:string|null; ageHours:number; createdAt:string; updatedAt:string };
type AgingSummary = { openCount:number; awaitingReviewCount:number; oldestAgeDays:number|null };
type AgingHistogramBucket = { bucket:string; count:number };
```

論点回答:
- ①「レビュー待ち数」→ 4-2 の `awaiting_review` 件数に一致（4-1 が同一述語を再利用）。
- ②「変更依頼後に新コミットが積まれたら再レビュー待ちに戻す」→ **踏み込む（既定 ON）**。
  `last_commit` が `latest_review.submitted_at` より新しければ `changes_requested` を `awaiting_review` に上書き
  （ボールが author からレビュアーへ戻る）。
- ③依頼先の解消判定 → **`pr_review_requests`（現在の依頼スナップショット、allowlist 追加）を採用**。
  GitHub のレビュー再依頼で残る/消える状態を正確に反映する。activities だけの近似
  （依頼済みかつ以後 review_submitted 無し）も可能だが精度が落ちるため不採用。

---

## 全体まとめ

### allowlist 追加
- **`pr_review_requests`** を `src/warehouse/schema.ts` の `exploreDwhTableNames` に追加（4-2 ボール保持者 /
  4-1 の依頼解消精度）。actor 参照のみで本文を含まないため公開範囲として安全。`schema.test.ts` の期待値も更新。
  他要素（1-1b/1-2/1-3/2-1/2-3/2-5/4-3）は既存 allowlist で充足。

### 凍結レポートとの parity
- **1-1b** は `buildDoraSql` を変更しない（2回実行）。`previousScope` は `scope.ts` へ移設し
  `dev-prism-summary` と共用。
- **bot 再計算（1-2/1-3/2-1/2-3）** は事前計算列＝`min(pr_reviews.submitted_at)` 定義と一致するため
  **既存列・collector の改変は不要**。parity テストは includeBots 両値で確認。
- 段階定義は新規共有 `stage-sql.ts`。レポート/Explore 双方が同一 import を使う限り parity は構造的に保証。

### DuckDB-WASM パフォーマンス
- 1-2/1-3 の `first_commit`（pr_commits 全走査 → pr_id で min）が最重量。各 SQL は独立実行で **CTE は
  クエリ間共有不可**（`runner.all()` を別々に呼ぶ）ため、1-2 と 1-3 で first_commit は各々再計算する。
- 2-5 は activities を2度スキャン（requests / submits）だが event_type 述語で軽い。
- 散布図(2-3)は `LIMIT`（既定2000）で描画側を保護。滞留系(4-x)は open PR のみで母数が小さい。
- 使用関数（`median` / `arg_max` / `string_agg` / `count(*) OVER ()` / `date_trunc` / `epoch_ms`）は
  すべて DuckDB 標準で WASM 可。
