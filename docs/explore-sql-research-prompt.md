# 調査依頼プロンプト: Explore 新要素のデータ取得 SQL 設計

> このファイルの内容を、区切り線以下からそのまま他の AI に貼り付けて使う。
> リポジトリへのアクセスなしで回答できるよう、スキーマ・規約・既存 SQL 例を全て同梱している。
> 画面仕様の原本は `docs/explore-screens.md`。

---

あなたは DuckDB SQL とソフトウェアデリバリーメトリクス(DORA 等)に詳しいデータエンジニアです。
GitHub PR 分析ツール「dev-prism」の Explore ダッシュボードに追加する画面要素について、
データ取得 SQL を設計してください。

## プロジェクト背景

- dev-prism は GitHub の PR データを収集し、DuckDB のデータウェアハウス(parquet)に正規化して、
  週次の凍結 HTML レポートとブラウザ上の Explore ダッシュボードを生成する
- Explore は **DuckDB-WASM** がブラウザ内で parquet をライブクエリする。サーバーはない
- 集計 SQL は凍結レポートと Explore で**同一関数を共有**する(数値の parity 保証)。
  SQL は TypeScript の `buildXxxSql(scope: Scope): string` 関数がテンプレート文字列として生成する
- Explore に配布される parquet はテーブル単位の allowlist 制。現在配布されているのは
  `activities, pull_requests, pr_reviews, pr_review_threads, pr_review_comments, pr_commits, actors, repos`。
  これ以外(例: `pr_review_requests`, `pr_files`, `pr_labels`)を使う設計にする場合は
  「allowlist への追加が必要」と明記すること

## 技術規約(既存コードのパターンに従うこと)

### Scope とフィルタヘルパー

全クエリは共通の `Scope` を受ける:

```ts
type Scope = {
  from: Date | null;          // 期間下限(inclusive, UTC)。null = 無制限
  to: Date | null;            // 期間上限(inclusive, UTC)
  repos: string[];            // repo_key ("owner/name")。空 = 全リポジトリ
  users: string[];            // actor login。空 = 全員
  includeBots: boolean;       // false のとき bot アクターの行を除外
  grain: "day" | "week" | "month";  // トレンドのバケット幅(date_trunc)
  thresholds: Record<string, number>; // クエリ時パラメータ(閾値など)
};
```

SQL 片は以下のヘルパーで合成する(回答内では結果の SQL に `${repoFilter}` のような
プレースホルダ表記を使ってよい):

```ts
inListFilter("r.repo_key", scope.repos)      // → ` AND r.repo_key IN ('a/b', ...)` or ""
timeRangeFilter("pr.merged_at", scope)       // → ` AND pr.merged_at >= TIMESTAMP '...' AND ... <= ...` or ""
botFilter("author.is_bot", scope)            // → ` AND NOT author.is_bot` or ""
eitherInListFilter(colA, colB, scope.users)  // → ` AND (colA IN (...) OR colB IN (...))`
```

### 既存 SQL の実例(DORA メトリクス)— スタイルの参考

```sql
WITH merged AS (
  SELECT pr.pr_id AS pr_id,
         (epoch_ms(pr.merged_at) - epoch_ms(pr.created_at)) / 3600000.0 AS lead_hours,
         pr.title LIKE 'Revert "%' AS is_failure
  FROM pull_requests pr
  JOIN repos r ON r.repo_id = pr.repo_id
  LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
  WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}
)
SELECT count(*) AS deploys,
       median(lead_hours) AS p50_lead,
       count(*) FILTER (WHERE is_failure) AS failure_count,
       avg(lead_hours) FILTER (WHERE is_failure) AS mttr
FROM merged
```

規約のポイント:

- 時間差は `(epoch_ms(a) - epoch_ms(b)) / 3600000.0` の小数時間で統一
- 中央値は `median()`、条件付き集計は `FILTER (WHERE ...)`
- トレンドは `date_trunc('${scope.grain}', col)` でバケット化
- `now()` 等の非決定的関数は避け、「現在時刻」が要る場合はアプリから
  `TIMESTAMP '...'` リテラルとして注入する前提で `${nowTs}` プレースホルダを使う
- DuckDB 1.x 構文。WASM で動くこと(標準関数のみ、拡張なし)

## データスキーマ(Explore 配布分)

`(n)` = nullable。

- **pull_requests**: pr_id, pr_key, repo_id, number, title(n), url(n),
  author_actor_id(n), merged_by_actor_id(n), is_bot_author, state(n),
  is_draft(n), created_at, updated_at, ready_for_review_at(n),
  **first_review_at(n)**, **first_approve_at(n)**, merged_at(n), closed_at(n),
  additions(n), deletions(n), changed_files(n)
  - `first_review_at` / `first_approve_at` は**収集時に事前計算された列**で、
    bot レビューを含む全レビューが対象(bot 除外での再計算はこの列ではできない)
- **pr_reviews**: review_id, pr_id, author_actor_id(n), state
  (APPROVED / CHANGES_REQUESTED / COMMENTED / DISMISSED / PENDING), submitted_at(n), updated_at
- **pr_review_threads**: thread_id, pr_id, path, line(n), is_resolved(n), is_outdated(n), resolved_by_actor_id(n)
- **pr_review_comments**: comment_id, pr_id, thread_id(n), review_id(n), author_actor_id(n), created_at, path, url(n)
- **pr_commits**: pr_id, oid, committed_at, authored_at(n), author_actor_id(n)
- **activities**(イベントログ): event_id, event_type, occurred_at, repo_id, pr_id,
  actor_id(n), **target_actor_id(n)**(レビュー依頼先など), review_state(n)
  - event_type: `pr_opened`, `pr_ready_for_review`, **`review_requested`**,
    `review_submitted`, `comment_created`, `review_comment_created`,
    `commit_pushed`, `pr_merged`, `pr_closed`
- **actors**: actor_id, actor_type, login(n), display_name(n), **is_bot**, team(n)
- **repos**: repo_id, repo_key("owner/name"), owner, name

未配布(使うなら allowlist 追加を提案): pr_review_requests(現在オープンな依頼のスナップショット),
pr_files, pr_labels, activity_actors, bodies。

## 設計対象の要素

各要素について「意味定義」を満たす SQL を設計すること。番号は `docs/explore-screens.md` に対応。

### 1-1b. DORA 前期間比較(フロー)

- 意味: 上記 DORA SQL と同じ4指標を「同じ長さの直前期間」でも算出し、差分を出す
- 論点: ①現期間・前期間を1クエリで返す(期間タグ付き UNION / CASE)か、scope を変えて
  同じ SQL を2回実行するか。parity(既存 buildDoraSql を変更しない)と WASM での実行コストを
  考慮して推奨案を選ぶこと ②前期間の境界計算(from/to から導出)は SQL 側か TS 側か

### 1-2. サイクルタイムファネル(フロー)

- 意味: マージ済み PR を対象に、4ステージそれぞれの p50 時間と母数 n:
  1. コミット→オープン: `min(pr_commits の authored_at または committed_at)` → `pr.created_at`
  2. オープン→レビュー: `pr.created_at` → `pr.first_review_at`
  3. レビュー→アプルーブ: `pr.first_review_at` → `pr.first_approve_at`
  4. アプルーブ→マージ: `pr.first_approve_at` → `pr.merged_at`
- 各ステージの母数はそのステージの両端が非 NULL の PR のみ(合計値は表示しない設計なので
  ステージごとに母数が違ってよい)
- 論点: ①rebase 等で first commit が created_at より後になる負値の扱い(0 クリップ or 除外)
  ②draft PR は オープン起点を `ready_for_review_at` に置き換えるべきか
  ③bot トグル OFF(bot 除外)のとき、事前計算列 first_review_at / first_approve_at は
  bot レビューを含んでしまう。`pr_reviews` × `actors.is_bot` からの再計算 CTE で置き換える
  設計を示すこと(この論点は 1-3, 2-1, 2-3 にも共通)

### 1-3. リードタイムの推移(フロー)

- 意味: `date_trunc(grain, merged_at)` のバケットごとに、1-2 と同じ4ステージの p50 の折れ線
- 出力: bucket × stage_1_p50 .. stage_4_p50(+各 n)

### 2-1. レビューなしマージ(レビュー)

- 意味: 期間内マージ PR のうち「レビューが1件もないままマージされた」ものの率と件数(+分母 n)
- bot トグル OFF では人間レビューのみでレビュー有無を判定する(上記の再計算論点)
- 論点: 事前計算列 `first_review_at IS NULL` 方式と `NOT EXISTS (pr_reviews ...)` 方式の比較と推奨

### 2-3. サイズ × レビュー着手の散布図(レビュー)

- 意味: 期間内マージ PR を1行1点で: X = オープン→初回レビュー時間、Y = additions + deletions、
  クリック遷移用に number / title / url / repo_key も返す
- 論点: ①レビューなし PR(X が NULL)を散布図から除外するか別枠表示か
  ②点数上限(WASM 描画負荷)を設けるならどう選抜するか

### 2-5. レビュアー別リードタイム(レビュー)

- 意味: レビュアーごとの「依頼→初回レビューまで」の代表時間の横棒グラフ
- データ: `activities` の `review_requested`(occurred_at, target_actor_id = 依頼先)と、
  同一 PR で依頼より後の同一アクターの `review_submitted`(または pr_reviews.submitted_at)を突合
- 論点: ①同一 PR × 同一レビュアーへの再依頼(re-request)の扱い(最初の依頼のみ / 依頼ごと)
  ②依頼なしで自発的にレビューした場合は含めない、でよいか ③代表値は平均か p50 か
  (仕様書は平均だが、外れ値耐性から p50 を推す場合は根拠を添えて提案してよい)
  ④未応答(依頼済みでレビューが来ていない)の扱い — 除外か、打ち切りとして注記か

### 4-1〜4-3. 滞留ページ(オープン PR のスナップショット)

共通: 対象は `merged_at IS NULL AND closed_at IS NULL` のオープン PR。
**期間フィルタ(timeRangeFilter)は適用しない**。repo / user / bot フィルタは適用する。
「現在時刻」は `${nowTs}` プレースホルダで注入する。

- **4-1 滞留サマリ**: オープン PR 数 / レビュー待ち数 / 最古 PR の経過日数 の3値
- **4-2 エイジングテーブル**: 1行1 PR で
  title, url, repo_key, author login, 状態, ボール保持者, 経過時間(created_at 起点), updated_at。
  状態の導出規則(優先順に評価):
  1. `is_draft` → ドラフト
  2. `first_approve_at IS NOT NULL` → アプルーブ済み未マージ
  3. 最新レビューの state が CHANGES_REQUESTED → 変更依頼中
  4. それ以外 → レビュー待ち
  ボール保持者: レビュー待ち → `review_requested` の target_actor_id(複数可、login の配列/連結)、
  変更依頼中・アプルーブ済み・ドラフト → author
- **4-3 経過時間ヒストグラム**: 経過時間帯(例: <1日 / 1–3日 / 3–7日 / 7–14日 / 14日+)ごとの件数
- 論点: ①「レビュー待ち数」の定義 — 4-2 の状態導出で「レビュー待ち」になる件数と一致させる
  ②状態導出で「変更依頼後に新しいコミットが積まれたら再レビュー待ちに戻す」まで踏み込むか
  (踏み込む場合の pr_commits との突合 SQL も示すこと)③依頼先が解消済み
  (レビュー提出済み)の依頼を除くには activities だけで足りるか、pr_review_requests
  (現在の依頼スナップショット、要 allowlist 追加)を使うべきか

## 回答フォーマット

要素ごとに以下を出力すること:

1. **SQL**: そのまま `buildXxxSql(scope)` のテンプレート文字列にできる形。
   フィルタは `${repoFilter}` `${mergedTime}` `${botFilter}` `${nowTs}` 等のプレースホルダ表記
2. **出力行の型**: TypeScript の type(BIGINT は `bigint | number` とする)
3. **意味上の決定**: NULL・エッジケースの扱いを箇条書きで(なぜそう決めたか1行ずつ)
4. **論点への回答**: 上記の各論点に対する推奨と根拠

最後に全体を通して:

- allowlist への追加が必要になったテーブルの一覧(不要なら「なし」)
- 凍結レポートとの parity 上の注意(既存 SQL・事前計算列に変更が必要な箇所)
- DuckDB-WASM でのパフォーマンス注意(スキャン量が大きくなるクエリ、CTE の共有可否)
