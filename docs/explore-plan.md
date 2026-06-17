# Explore 実装計画（ライブ集計フロント）

目標: ブラウザ内 DuckDB-WASM で DWH を直接クエリする **Explore モード**を実装し、
ローカルで起動・動作確認できる状態にする。最初の集計項目は **既存レポートと同じ**
（DORA / review-correlation / PR timeline）。対象データは `gyvm/*`。

## 中核アイデア: 既存ロジックの完全再利用（parity by construction）

`DwhQueryRunner` は `{ all(sql, params) }` だけのインターフェース。これを **DuckDB-WASM 実装**で満たせば、
既存の `queryDora` / `queryReviewCorrelation` / `queryPrTimeline`（および `buildDashboardSql`）を
**ブラウザでそのまま実行**でき、出力 view-model も同一。さらに既存レンダラ
（`renderMetricCards` / `renderBipartiteGraph` / `renderGanttChart`、いずれも HTML 文字列を返す純関数）へ
そのまま渡せる。→ native(Reports) と WASM(Explore) が**同じ SQL・同じ TS・同じレンダラ**を共有（設計 D1/D4）。

```
filter bar → scope → 既存 query 関数(WASM runner) → 既存 view-model → 既存レンダラ → innerHTML
```

## 技術選定と根拠

- **Vite + vanilla TypeScript**（React 無し）。理由: 既存レンダラが HTML 文字列を返すため
  `innerHTML` 注入が最も摩擦が少なく、起動・Playwright 検証までの最短路。フィルタ UI は
  date/select/checkbox のみで vanilla で十分。設計の「Astro + React island」は将来の 2 モード統合・
  deep-link 時に被せる（Explore 単体は Vite SPA で設計上「同等」と明記済み）。
- **DuckDB-WASM**: `@duckdb/duckdb-wasm`、**single-thread worker**（SharedArrayBuffer 不要 →
  COOP/COEP 不要）。dev は jsDelivr バンドル（wasm 自前ホスト不要）、worker は blob+importScripts で
  cross-origin 回避。
- **Parquet 供給**: DWH の `*.parquet` を `src/web/public/data/` に配置し、`registerFileURL(HTTP)` +
  `CREATE VIEW <table> AS SELECT * FROM read_parquet(...)` で `openDwh` と同じテーブル群を再現
  （存在しないテーブルは空 CREATE TABLE = スキーマ準拠、`openDwh` と同じ不在耐性）。
- **スタイル**: 既存レポートの `PAGE_STYLES`（render.ts）を export して `<style>` に流用 →
  レンダラの class が効き、見た目はレポートと同一。

## ファイル構成

```
src/web/
  index.html              -- Vite エントリ。フィルタバー + 結果コンテナ
  main.ts                 -- ブートストラップ（DuckDB-WASM 起動 → runner 構築 → 描画ループ）
  duckdb-runner.ts        -- DwhQueryRunner の WASM 実装（registerFileURL + view 構築 + all()）
  explore.ts              -- scope(URL/controls) → 既存 query 関数 → 既存レンダラ → DOM
  public/data/            -- DWH parquet（gitignore。スクリプトで配置）
vite.config.ts            -- root=src/web、build target=esnext
tsconfig.web.json         -- DOM lib、bundler resolution（ブラウザ用）
package.json scripts:
  explore:data            -- 指定 DWH dir の parquet を src/web/public/data へコピー
  explore:dev             -- vite（dev サーバ起動）
  explore:build           -- vite build
```

## ステップ（各ステップ: 実装 → コミット → レビュー → 修正）

1. **足場**: vite + @duckdb/duckdb-wasm 追加、`vite.config.ts` / `tsconfig.web.json`、`src/web/index.html`、
   `explore:data` / `explore:dev` スクリプト、`render.ts` の `PAGE_STYLES` を export。
   検証: `explore:dev` が 200 を返し空ページが出る（Playwright で title/コンテナ確認）。
2. **WASM runner**: `duckdb-runner.ts`（バンドル選択 → worker → instantiate → registerFileURL →
   全 DWH テーブルの view/空テーブル作成 → `all(sql,params)`）。検証: 単純 `SELECT count(*) FROM pull_requests` が返る。
3. **描画 1（DORA）**: scope（URL）→ `queryDora` → `renderMetricCards` → DOM。Playwright で KPI カード描画確認。
4. **描画 2（review-correlation / timeline）**: `queryReviewCorrelation`→`renderBipartiteGraph`、
   `queryPrTimeline`→`renderGanttChart`。
5. **フィルタバー + URL 同期**: from/to/grain/repos/users/bots を `scope-url` で URL に反映、変更で再クエリ（再フェッチ不要）。
6. **起動・E2E 検証**: `gyvm/*` を収集 → DWH → `explore:data` → `explore:dev` → Playwright で
   実データの KPI/timeline 描画をスクリーンショット確認。
7. **仕上げ**: ローディング/エラー表示、空データ時の文言、README/docs 追記。

## 検証戦略

- ロジック層（runner 構築の SQL、scope 解釈）は可能な範囲で vitest。
- ブラウザ描画は **Playwright(MCP)** で headless 検証: ページ遷移 → 結果セレクタ待ち →
  KPI/グラフが非空であることを assert + スクリーンショット。これが「起動」の合否判定。

## 計画レビュー反映（修正）

レビューで判明した実ブロッカー/誤りを反映:

1. **PAGE_STYLES の取り出し**: `render.ts` は冒頭で `node:fs`/`node:path` を import する Node 専用モジュール。
   値を import するとブラウザバンドルが壊れる。→ `PAGE_STYLES` を**依存ゼロの leaf**
   `src/renderers/page-styles.ts` に分離し、`render.ts` は再 import。Explore は leaf を import。
2. **markdown-it 巻き込み**: 3 レンダラは `utils.ts` を import し、`utils.ts` は冒頭で `markdown-it` を
   import・インスタンス化する。→ `escapeHtml`/`formatHours` 等の純ヘルパは `utils.ts` に残し、
   `markdownToHtml`（markdown-it 使用）を `src/renderers/markdown.ts` へ分離。Explore は markdown を引かない。
3. **`DwhQueryRunner` は Node 専用 `query.ts` 由来**（`@duckdb/node-api`/`node:fs` を引く）。→ ランナー型を
   **依存ゼロの `src/warehouse/runner.ts`** に hoist し、`params?: Record<string, unknown>`（node-api 非依存）に一般化。
   native(`openDwh`)・query 関数・WASM ランナーがこれを共有。WASM 側は `import type` のみ。
4. **params は誰も使わない**: 全 query 関数は `runner.all<T>(sql)` の 1 引数呼び。scope 値は SQL リテラルに
   エスケープ済み。→ WASM ランナーは `all(sql)` だけ実装（`params` は型互換のため受けて無視）。
5. **Arrow→plain-JS 変換**（最重要の正確性）: DuckDB-WASM の `conn.query` は Arrow Table を返す。
   ランナーは各行を plain object 化（Utf8→string, Int64→bigint/Number, Float64→number）。
   特に `CAST(TIMESTAMP AS VARCHAR)` が native と同じ `"YYYY-MM-DD HH:MM:SS"` 文字列で取れることを検証
   （pr-timeline/trend の `toIso`、DORA の epoch_ms 差が parity 維持の前提）。
6. **parquet 供給は `registerFileBuffer`**（fetch で全体取得 → バイト登録）を v1 採用。HTTP range/CORS/httpfs を回避
   （`gyvm/*` は小規模）。SQL は登録名に対して `read_parquet('<table>.parquet')`。
7. **`.js`→`.ts` 解決**: Vite は標準で解決できる想定。失敗時のみ resolve プラグインをフォールバック追加。
8. **activity-trend はレンダラが存在しない**（`renderers/index.ts` は metric-cards/gantt/bipartite のみ）。
   → Explore v1 のダッシュボードは **DORA / review-correlation / pr-timeline の 3 つ**に限定（= レポートと同一）。
   件数推移は将来レンダラ追加時に。
9. **DWH 生成の前提ステップ追加**: `explore:data` の前に「`gyvm/*` を収集 → DWH ビルド」を明示
   （`GITHUB_TOKEN=$(gh auth token)` + `dwh:build --config <gyvm config> --dwh-dir <dir>`）。

## リスクと対策

- **Vite の `.js`→`.ts` 解決**: 既存コードは NodeNext 流に `./x.js` で import。Vite が解決できない場合は
  `resolve` プラグイン（`.js` 指定子を `.ts` にフォールバック）を `vite.config.ts` に追加。
- **DuckDB-WASM worker の cross-origin**: blob + importScripts パターンで回避。だめなら wasm を `public/` へ自前ホスト。
- **parquet の HTTP range**: dev サーバ（Vite）は range 対応。本番配信先も range 必須（既知制約）。
- **markdown-it 依存**: 使うのは AI セクションのみ。Explore は dora/review/timeline レンダラだけ使うので不要。
- **大規模 DWH**: 初期は `gyvm/*` 小規模で十分。列プルーニング/パーティションは将来。
