# Analytics Platform 設計

PR データを「事前にバケット集計した固定レポート」から、**DWH に貯めてブラウザ内
(DuckDB-WASM)で動的に集計・探索できるプラットフォーム**へ拡張するための設計。

- 配布モデルは現状維持(各組織が fork、`config.toml` + PAT、GitHub Actions 週次)
- 探索はクライアント完全内製の DuckDB-WASM(常駐サーバー・認証基盤なし)
- 成果物は「静的ファイルの塊」なので、Pages / Cloudflare / Docker どこへでも置ける

## 全体像

```
既存スナップショット JSON  data/<period>.json   ← 事実上の raw 層(再構築の土台。既存)
        │  build(冪等な単一変換)
DWH (Parquet, star schema)                      ← 今回作る唯一のスキーマ
        │  HTTP range(必要な列 / row group だけ取得)
DuckDB-WASM + フロント                            ← 期間・粒度・repo・人・bot を実行時に切替
        │  静的バンドル(dist/)
deploy adapter → Pages / Cloudflare / Docker / …
```

設計の中心は **「いつ集計するか」の転換**。現状はパイプラインが週次バケットへ事前に
畳むが、新方式は**原子的なイベント(生のタイムスタンプ付き)を貯め、集計はクエリ時に
SQL で行う**。これにより「集計期間 / 表示期間を動的に変える」が実質無料になる。

3 層 ETL(raw / staging / core)は過剰。収集器が既に正規化済みスナップショットを
出力しており、これが immutable な raw 層として機能するため、**新規に作るのは DWH
スキーマ 1 枚と、snapshot → DWH の build だけ**。表示要件が変わってもスナップショット
から build を流し直せばよく、GitHub へ取り直しに行く必要はない。

## DWH スキーマ

Kimball 風スター。**件数・推移系はロング型ファクト `activities` から実行時集計**、
**所要時間系のみ `pull_requests` に前計算**、**重いテキストは `bodies` に隔離**する。

識別子は安定な自然キーを採用する。

- `repo_id`   = `"owner/name"`
- `pr_id`     = `"owner/name#number"`
- `actor_id`  = GitHub login(`null` の場合は `"__unknown__"` に正規化)

### facts

```sql
-- ロング型イベントファクト(occurred_at を持つ時間軸アクティビティのみ)
-- 件数・推移系はすべてこのテーブルから date_trunc で巻き取る
CREATE TABLE activities (
  event_id     VARCHAR  NOT NULL,   -- 決定論的サロゲート(下記「event_id の生成」)
  event_type   VARCHAR  NOT NULL,   -- イベント種別(カタログ参照)
  occurred_at  TIMESTAMP NOT NULL,  -- 集計粒度は date_trunc でクエリ時に決める
  repo_id      VARCHAR  NOT NULL,
  actor_id     VARCHAR  NOT NULL,   -- そのイベントの主体(author / reviewer / committer)
  pr_id        VARCHAR  NOT NULL,   -- 対象 PR
  value_num    DOUBLE,              -- 汎用メジャー(件数=1 / additions など)
  attributes   JSON                 -- type 固有の追加属性(まず JSON、後で昇格)
);

-- PR エンティティ(所要時間系を前計算。self-join を避けるための唯一の例外)
CREATE TABLE pull_requests (
  pr_id                     VARCHAR  NOT NULL,
  repo_id                   VARCHAR  NOT NULL,
  number                    INTEGER  NOT NULL,
  title                     VARCHAR,
  url                       VARCHAR,
  author_id                 VARCHAR  NOT NULL,
  is_bot_author             BOOLEAN  NOT NULL,
  state                     VARCHAR,             -- OPEN / MERGED / CLOSED
  is_draft                  BOOLEAN,
  created_at                TIMESTAMP NOT NULL,
  ready_for_review_at       TIMESTAMP,
  first_review_at           TIMESTAMP,
  first_approve_at          TIMESTAMP,
  merged_at                 TIMESTAMP,
  closed_at                 TIMESTAMP,
  additions                 BIGINT,
  deletions                 BIGINT,
  changed_files             INTEGER,
  -- 前計算したライフサイクル時間(時間単位)
  lead_time_hours           DOUBLE,              -- created → merged
  time_to_first_review_hrs  DOUBLE,              -- ready_for_review(無ければ created) → first_review
  time_to_merge_after_review_hrs DOUBLE          -- first_review → merged
);

-- 時間軸を持たない関連は activities に混ぜずブリッジ表に分離
CREATE TABLE pr_files (
  pr_id        VARCHAR NOT NULL,
  path         VARCHAR NOT NULL,
  additions    BIGINT,
  deletions    BIGINT,
  change_type  VARCHAR              -- ADDED / MODIFIED / DELETED / RENAMED …
);

CREATE TABLE pr_labels (
  pr_id   VARCHAR NOT NULL,
  label   VARCHAR NOT NULL
);
```

### dims

```sql
CREATE TABLE people (
  actor_id  VARCHAR NOT NULL,   -- = login
  login     VARCHAR,
  is_bot    BOOLEAN NOT NULL,   -- config [bots] patterns で判定
  team      VARCHAR             -- 任意。将来 org チーム連携で埋める
);

CREATE TABLE repos (
  repo_id     VARCHAR NOT NULL, -- = "owner/name"
  owner       VARCHAR NOT NULL,
  name        VARCHAR NOT NULL,
  visibility  VARCHAR           -- PUBLIC / PRIVATE(取得できれば)
);
```

`periods` ディメンションは**持たない**。週/日/月の区切りは `date_trunc` で実行時に
決めるため、データに焼き込まない。

### 集計に絡めないテキスト

```sql
CREATE TABLE bodies (
  subject_id    VARCHAR NOT NULL,  -- pr_id / event_id(コメント・レビュー)
  subject_kind  VARCHAR NOT NULL,  -- pr_body / issue_comment / review_body / thread_comment
  text          VARCHAR,
  text_len      INTEGER            -- 派生だけ activities 側に複製してもよい
);
```

`activities` / エンティティ表は痩せたまま保てるので集計スキャンが常に軽い。本文は
必要なとき(検索・AI 入力)だけ join する。

## event_type カタログ

既存スナップショットのフィールドを、`activities` の行へ次のようにマッピングする。
**時間軸を持つものだけ** が `activities` に入る(files/labels はブリッジ表へ)。

| event_type           | 由来(snapshot)                    | occurred_at         | actor_id        | value_num | attributes                                              |
|----------------------|-------------------------------------|---------------------|-----------------|-----------|---------------------------------------------------------|
| `pr_opened`          | PR `createdAt`                      | createdAt           | author          | 1         | `{ is_draft }`                                          |
| `pr_ready_for_review`| timelineEvents `ready_for_review`   | createdAt           | author          | 1         | `{}`                                                    |
| `review_requested`   | timelineEvents `review_requested` / reviewRequests | createdAt | author     | 1         | `{ requested_reviewer }`                               |
| `review_submitted`   | reviews[]                           | submittedAt         | review.author   | 1         | `{ state }` (APPROVED/CHANGES_REQUESTED/COMMENTED/DISMISSED) |
| `comment_created`    | comments[](issue comment)           | createdAt           | comment.author  | 1         | `{ url }`                                               |
| `thread_comment`     | reviewThreads[].comments[]          | createdAt           | comment.author  | 1         | `{ path, line, thread_resolved, thread_outdated }`     |
| `commit_pushed`      | commits[]                           | committedDate       | commit.author   | 1         | `{ oid, authored_at, message_headline_len }`           |
| `pr_merged`          | PR `mergedAt`(非 null)             | mergedAt            | author          | 1         | `{ additions, deletions }`                              |
| `pr_closed`          | PR `closedAt`(merged でない)       | closedAt            | author          | 1         | `{}`                                                    |
| `ai_finding`         | AI 分析結果                          | period.start        | `__ai__`        | 1         | `{ category, severity, analysis_id }`(本文は bodies) |

新指標が欲しくなったら **新しい `event_type` を足すか、既存行へのクエリを書くだけ**で、
スキーマ移行は不要。これが「画面に出すデータが今後変わる」への耐性。

### attributes の方針

- **まず JSON で開始**(UI 変更に最強)。DuckDB の JSON 関数は速いので集計でも実用的。
  例:`json_extract_string(attributes, '$.state') = 'APPROVED'`
- **頻出属性は後から型付き列へ昇格**(例:`review_submitted.state` を `review_state`
  カラムに格上げ)。raw から build を流し直すだけで移行できる。

### event_id の生成

冪等な再ビルドと増分 upsert のため、決定論的に生成する。

```
event_id = sha1(pr_id || '|' || event_type || '|' || occurred_at || '|' || actor_id || '|' || discriminator)
```

`discriminator` は同一 (pr, type, time, actor) が複数あり得る場合の区別子
(commit は `oid`、thread_comment は `url`)。これで同じスナップショットからは常に
同じ行が出る。

## build:snapshot → DWH

```
src/warehouse/
  schema.sql            -- 上記 DDL
  build.ts              -- snapshot(s) → Parquet 一式
  events.ts             -- NormalizedPullRequest → activities 行へ展開
  entities.ts           -- pull_requests / pr_files / pr_labels / people / repos
  bodies.ts             -- テキスト隔離
```

- 入力:`data/*.json`(1 期間 = 1 ファイル)。複数期間を一括で読む。
- 出力:`dist/data/*.parquet`(テーブルごと。`activities` は `occurred_at` の
  月でパーティション = `activities/year=YYYY/month=MM/*.parquet`)。
- **増分 upsert**:収集器が PR を `updatedAt` カーソルで増分取得 → 該当 `pr_id` の
  行を全 type 分まとめて差し替え(PR 単位で冪等に再生成)。`event_id` が決定論的なので
  重複は自然に解消する。
- Parquet 設定:row group は数万行、`bodies` は別ファイルに分離してホットパスから外す。

DuckDB-WASM 側はパーティション + 列プルーニング + HTTP range で**必要分だけ**取得する。

## 既存分析を SQL ビューで再定義

compute 系のロジックを SQL に移すことで、**UI の期間・粒度変更に自動追従**する。
以下は方針を示す例(厳密な定義は既存 `src/analyses/*` の実装に合わせて調整)。

### PR 数・推移(動的粒度)

```sql
-- :grain は 'day' | 'week' | 'month'、:from/:to は表示期間、:repos/:bots はフィルタ
SELECT date_trunc(:grain, occurred_at) AS bucket,
       count(*) AS pr_opened
FROM   activities
WHERE  event_type = 'pr_opened'
  AND  occurred_at BETWEEN :from AND :to
  AND  (:repos IS NULL OR repo_id IN :repos)
GROUP  BY bucket
ORDER  BY bucket;
```

### DORA(deployment frequency / lead time / CFR / MTTR)

```sql
-- deployment frequency ≒ 期間内マージ数 / 期間
SELECT date_trunc(:grain, merged_at) AS bucket, count(*) AS deploys
FROM   pull_requests
WHERE  merged_at BETWEEN :from AND :to
GROUP  BY bucket;

-- lead time for changes(前計算列をそのまま分位集計)
SELECT median(lead_time_hours) AS p50_lead_hours,
       quantile_cont(lead_time_hours, 0.90) AS p90_lead_hours
FROM   pull_requests
WHERE  merged_at BETWEEN :from AND :to;
```

CFR / MTTR は障害・revert の定義に依存するため、既存 `dora-metrics/internal` の
判定基準を SQL 条件へ移植する。

### review correlation(author × reviewer の二部グラフ)

```sql
SELECT pr.author_id AS author,
       a.actor_id   AS reviewer,
       count(*)     AS cnt
FROM   activities a
JOIN   pull_requests pr USING (pr_id)
WHERE  a.event_type = 'review_submitted'
  AND  a.occurred_at BETWEEN :from AND :to
  AND  a.actor_id <> pr.author_id
GROUP  BY author, reviewer;
```

`people.is_bot` で人/ボットの色分けは join で付与する。

### PR timeline(状態区間)

`implementing / wait_review / fixing / wait_merge` の区間は、1 PR 内の
`commit_pushed` / `pr_ready_for_review` / `review_submitted(state)` / `merged_at`
の時系列から境界を引く。既存 `pr-timeline/internal/boundaries.ts` のロジックを
ウィンドウ関数(`lag`/`lead`)を使った SQL かクライアント側 TS のどちらかで再実装する
(複雑な状態機械なので、初期は TS のまま `activities` を入力にしてもよい)。

## フロント(静的だがインタラクティブ)

```
src/web/            -- DuckDB-WASM を読み込む SPA(静的バンドル)
  db.ts             -- DuckDB-WASM 初期化、Parquet 登録、クエリ実行
  controls.ts       -- 期間 / 粒度(日週月)/ repo / 人・チーム / bot 含む除く
  dashboards/       -- 既定ダッシュボード(推移・DORA・レビュー相関・timeline)
  sql-console.ts    -- ad-hoc SQL コンソール(パワーユーザー向け)
```

- セレクタ変更 → SQL パラメータ差し替え → DuckDB-WASM 再実行 → 即反映。
- チャートは静的ホスト相性のよい **Observable Plot / Vega-Lite / ECharts** から選定。
- **シングルスレッド WASM** を既定にする(この規模なら十分高速で、`SharedArrayBuffer`
  =COOP/COEP 依存を避けられる)。マルチスレッドは将来の保険。

### 性能の前提

このツールの規模(PR 本体は多くて数万、子イベントを足して数百万行)では、典型的な
group-by はシングルスレッドでも **数十〜数百 ms** で返る。性能で効くのはエンジン速度
より **Parquet レイアウト**(パーティション + 列プルーニング + row group サイズ)と
**本文テキストの隔離**。

## デプロイ(どこへでも)

成果物 `dist/`(HTML + WASM + `data/*.parquet`)は**純粋な静的ファイル**。デプロイ先は
薄いアダプタ(ファイルを置くだけ)で、**コアはデプロイ先を一切知らない**。

| 先              | 方法                          | COOP/COEP ヘッダ | 注意                                   |
|-----------------|-------------------------------|------------------|----------------------------------------|
| GitHub Pages    | 既存 Actions で `dist/` を公開| 設定不可         | シングルスレッド WASM 前提なら問題なし |
| Cloudflare Pages| `wrangler pages deploy dist`  | `_headers` で可  | private は Cloudflare Access で保護     |
| Docker (nginx)  | `dist/` を配信する image      | nginx conf で可  | VPS 等に自前ホスト                      |
| S3 / Netlify 等 | 同上(静的配信)              | 各機能で可       | Range リクエスト対応が必要              |

唯一デプロイ先で差が出るのは **COOP/COEP ヘッダ**(マルチスレッド WASM を使う場合のみ)。
既定のシングルスレッド構成ならどこでも同一に動く。Range リクエスト対応は Parquet の
部分取得に必要なので、ホスト選定時に確認する。

### データ公開範囲(マルチ org の注意)

静的ホスティングは「置いた場所のアクセス制御」がそのまま露出範囲になる。private repo
の PR データを公開 Pages に置くと誰でも読めるため、private 運用では Cloudflare Access
等で保護したデプロイ経路を用意する。

## 段階的移行計画

1. **PoC**:`src/warehouse/build.ts` で既存 `data/demo/2026-05-03.json` を新スキーマの
   Parquet に変換 → DuckDB-WASM で「粒度を切り替えて PR 数推移を表示」までの最小動線。
   ブラウザ内集計の速度と操作感を確認する。
2. **スキーマ確定**:`activities` / `pull_requests` / dims / `bodies` を DDL 化、
   event_type マッピングを実装(`events.ts` / `entities.ts`)。
3. **増分収集**:収集器に `updatedAt` カーソルを導入、PR 単位の冪等 upsert。
4. **分析の SQL 化**:DORA → review-correlation → timeline の順に SQL ビュー/クエリへ
   移植(timeline は当面 TS のままでも可)。
5. **フロント**:既定ダッシュボード + セレクタ + SQL コンソール。
6. **デプロイアダプタ**:Pages → Cloudflare → Docker。COOP/COEP は必要時のみ。

既存の静的レポート(`src/report` / `src/pipeline`)は移行中は並走させ、新フロントが
機能等価になった段階で置き換える。
