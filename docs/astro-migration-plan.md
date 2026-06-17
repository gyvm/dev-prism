# Astro + React islands 移行プラン（フロント基盤刷新）— rev2

ステータス: レビュー反映済み / ブランチ: `claude/astro-shell-migration`

## 0. レビューで判明した最重要の前提修正

**レポート系統は2つある。本移行は「新・DWH/凍結系統」を対象とする。**

| 系統 | エントリ | 出力 | index | CI |
|---|---|---|---|---|
| 旧 orchestrate | `npm run report`（`src/cli/report.ts`→`orchestrate`→`render.ts`） | `dist/reports/*.html` + `dist/index.html`（filesystem scan, **index.json なし**, footer なし） | なし | **現 weekly.yml はこちら** |
| **新 DWH/凍結（本移行の対象）** | `npm run report:dwh`（`src/cli/dwh-report.ts`→`frozen-report.ts`） | `reports/*.html` + `reports/index.json`（KPI/scope/`exploreHref` footer 付き） | あり | 未投入 |

- `explore-plan.md` は次ステップに「**Astro 化（2モード統合・SSG 一覧）**」を明記 → 本移行＝その実装。
- Explore（DuckDB-WASM）は新系統。ユーザーの3要望は全て新系統側。

**スコープ外（follow-up として文書化のみ）**: CI を旧→新へ切替、本番 parquet 配信、レポート履歴の永続化（`.gitignore` で実データ/`dist`/parquet は非コミット＝本番は毎回空 dist から。これは DWH 本番化の別課題）。本移行は**ローカルビルドで 2 モード統合を完成**させ、本番投入は別タスクとする。

**method D = `report:dwh` の再実行そのもの**（DWH=凍結データ、現行レンダラで再描画）。新規 rerender コマンドや `schemaVersion` は作らない（レビュー C3 撤回）。サイドバー更新は方式Z（nav.js 再デプロイ）で本文 rerender 不要。

## 1. ゴール（ユーザー3要望）

1. 左に**開閉サイドバー**で Explore ⇄ Reports 往復
2. Explore の**日付選択モダン化**＋プリセット（今週/過去1ヶ月/過去3ヶ月）
3. Explore の **repo/user を multiselect**

## 2. リサーチ確定（footgun）

- Astro `^6` / `@astrojs/react` `^5` / `react`,`react-dom` `^19` / `@types/react`,`@types/react-dom` `^19`。Node 24 OK。
- Astro は Vite7 内蔵 → **standalone `vite@^8` と `explore:dev`/`explore:build` は Explore 島完成後に削除**（レビュー M5: 削除を後ろ倒し）。`vitest@^3` 維持。
- **`vite.build.emptyOutDir: false` 必須**（でないと `astro build` が `dist/reports`・`dist/data` を消す）。クリーンビルドは手動 `rm -rf dist`。
- **base**: `base: import.meta.env.PROD ? '/<repo>' : '/'`（レビュー I4: dev URL を汚さない）。`site` も設定。
- **parquet fetch は `import.meta.env.BASE_URL` 基準**。publicDir(`./public`) は `outDir` 直下へコピー → parquet は **`dist/data/*`**（現 `dist/explore/data` から移動）。
- `optimizeDeps.exclude: ['@duckdb/duckdb-wasm']` を `astro.config` の `vite:` に移設。single-thread WASM は COOP/COEP 不要（現状維持）。
- **`dist/index.html` の所有権**（レビュー M2）: Astro `index.astro` が唯一の `dist/index.html` 生成者。旧 `buildIndexHtml` は本系統では使わない。
- nav.js は publicDir 経由 `dist/nav.js`（unhashed）。レポートから相対 `../nav.js`。nav.js は `document.currentScript.src` から site root を導出（深さ非依存, レビュー R2/M3）。
- tsconfig（レビュー I1）: `tsconfig.web.json` を Astro 生成 config ベースに（`jsx: react-jsx`/`jsxImportSource: react`、`.astro`/`.tsx` include、`astro/client` types）。`tsc --noEmit` を web/node 両方で緑に。

## 3. 再利用する既存コード（無改変）

- `render.ts` `renderReportHtml` / `renderers/index.ts` `renderAnalysis` / `page-styles.ts` `PAGE_STYLES`。
- `frozen-report.ts`：`buildFrozenReport`/`generateReports`/`upsertIndexEntry`/`renderIndexHtml`/`exploreHref` footer。**nav.js 注入はここ**（`</main>` 置換、footer と同じ手口）。
- `src/web/{duckdb-runner,explore,filters}.ts`：WASM 起動・scope・3レンダラ。**`scopeFromUrl`/`scopeFromForm` 等の純ロジックは framework-free `.ts` に残し**（レビュー I3: vitest 維持）、DOM/React だけ `.tsx` 島へ。
- distinct: `SELECT DISTINCT repo_key FROM repos ORDER BY repo_key` / `SELECT DISTINCT login FROM actors WHERE login IS NOT NULL ORDER BY login`（**ブラウザ内 WASM runner で**実行, レビュー I5）。

## 4. ディレクトリ目標

```
src/web/
  astro.config.mjs    -- root=src/web, outDir=../../dist, publicDir=./public, base(PROD分岐),
                          react(), vite{optimizeDeps.exclude, build.emptyOutDir:false}
  public/{data/*.parquet, nav.js}
  shell/{sidebar.ts(共有markup+挙動), nav-entry.ts(report用runtime mount)}
  layouts/Layout.astro            -- sidebar を SSR
  pages/{index.astro(index.json→SSG一覧), explore.astro(<Explore client:only="react"/>)}
  islands/Explore.tsx             -- WASM + react-day-picker + combobox（DOM/React のみ）
  lib/                            -- 島が import する framework-free ロジック（scope/url/queries/runner）
  (旧 index.html/main.ts は島完成後に撤去)
```

## 5. 実装ステップ（各末でコミット＋サブエージェントレビュー→修正）

### Step 1 — parquet 配置 + BASE_URL（島化の前に単独で）
- `explore-data.ts` の出力先と `createWasmRunner` の fetch を `dist/data`/`${BASE_URL}data/` 整合へ。`.gitignore`（`src/web/public/data/`・`dist/explore/`）を新レイアウトへ更新。
- 既存 vanilla Explore が新パスで動くことを先に確認（島化と分離してバイセクト容易に, レビュー I2）。
- commit: `refactor(web): serve parquet from base-relative /data for Astro layout`

### Step 2 — Astro scaffold（vite は残す）
- deps 追加、`astro.config.mjs`（§2 全反映）。scripts に `astro dev`/`astro build` 追加（`explore:dev/build` はまだ残す, M5）。tsconfig を Astro/React 用に（I1）。
- 受け入れ: `astro dev` で空ページ、`astro build` が `dist/reports`/`dist/data` を消さない（emptyOutDir:false 検証）。
- commit: `build(web): scaffold Astro 6 + React 19 (keep vanilla explore temporarily)`

### Step 3 — 共有サイドバー + Layout + nav.js（a11y/responsive 込み）
- `shell/sidebar.ts`（DESIGN.md トークン、localStorage、`position:fixed` オーバーレイ、`aria-expanded`/`role`、Esc で閉じる、フォーカス管理、narrow 画面対応, レビュー M4）。
- `layouts/Layout.astro`（SSR）。`shell/nav-entry.ts`→マイクロビルド(esbuild)→`public/nav.js`（currentScript から root 導出、links 絶対化）。
- 受け入れ: index/explore で開閉・キーボード操作。nav.js を任意 HTML に貼ると同じサイドバー。
- commit: `feat(web): shared accessible collapsible sidebar (SSR + runtime nav.js)`

### Step 4 — 凍結レポートへ nav.js 注入（方式Z）
- `frozen-report.ts` の footer 注入箇所に `<div id="app-nav"></div><script type="module" src="../nav.js"></script>` を追加。markup は共有 sidebar モジュール由来。
- 受け入れ: 生成レポートを base 付き配信で開く→サイドバーで一覧/Explore へ。オフライン単体では本文のみ描画（script 404 が本文を壊さないこと, M3）。
- commit: `feat(report): overlay sidebar on frozen DWH reports via runtime nav (method Z)`

### Step 5 — Explore を React 島化（その後 vite@8 削除）
- `lib/` に純ロジック退避（`scopeFromUrl`/`scopeFromForm`/queries/runner 型）。`islands/Explore.tsx` + `pages/explore.astro`（`client:only="react"`）。WASM 起動・URL 同期・stale guard・inline script 再実行を移植。
- 緑確認後に `vite@^8` と `explore:dev/build` 削除、vitest が `lib/` のテストで緑（I3）。
- 受け入れ: 既存と同じ集計・permalink・フィルタ更新。
- commit: `feat(web): port Explore to React client:only island; retire standalone Vite`

### Step 6 — モダン日付 + プリセット（要望2）
- `react-day-picker`（range）+ プリセット（今週/過去1ヶ月/過去3ヶ月）。`scope` 経由。
- commit: `feat(web): date-range picker with presets`

### Step 7 — repo/user multiselect（要望3）
- WASM runner で distinct 取得（parquet ロード後）→ combobox multiselect で free-text 置換。空データ時の空状態 UX（I5）。`Scope.repos/users` へ配線、bot トグル維持。
- commit: `feat(web): repo/user multiselect from distinct DWH values`

### Step 8 — 一覧 SSG + ローカルビルド配線
- `pages/index.astro`：`reports/index.json` から一覧 SSG（既存 `renderIndexHtml` 意匠＋サイドバー）。`dist/index.html` 所有権を Astro に一本化（M2）。
- ローカル全ビルド手順を確立: `rm -rf dist` → `dwh:build` → `explore:data` → `report:dwh --reports-dir dist/reports --index dist/reports/index.json`（index.json + reports を **dist/reports 直下**に。`../nav.js` 相対が site root に解決される前提を満たす） → `astro build`。base 付きで `dist/` を配信し Playwright で 2 モード往復を検証。
- `demo` は旧レンダラのまま据え置きを明記（M1）。
- commit: `feat(web): SSG reports gallery from index.json; local two-stage build`

### Step 9 — 仕上げ + follow-up 文書化
- 旧 `src/web/index.html`/`main.ts`/`filters.ts` 整理、`tsc --noEmit`(web/node)、`vitest run` 全緑。
- README/DESIGN.md/explore-plan.md/analytics-platform.md を実績へ更新。**スコープ外の follow-up（CI 切替・本番 parquet 配信・履歴永続化）を明記**。
- commit: `chore(web): cleanup legacy explore + docs; note prod-deploy follow-ups`

## 6. 検証
- `npm run typecheck`(node) + web tsc、`vitest run`、`astro build` 成功、`rm -rf dist`→ローカル全ビルド→base 付き配信→Playwright スクリーンショット（一覧/Explore/レポート/サイドバー往復）。
- 各ステップ後に code-review 系サブエージェントでレビュー→指摘修正→コミット。
