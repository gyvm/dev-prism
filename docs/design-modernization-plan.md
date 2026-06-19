# Design Modernization Plan

Grilling で確定したスタックに基づく、デザイン刷新の実装計画。

## 確定スタック

| 層 | 採用 | 適用範囲 |
|---|---|---|
| 描画モデル | React SSR (`renderToStaticMarkup`) で凍結 | レポート（クライアントJSゼロ） |
| 見た目 | Tailwind v4 + daisyUI（DESIGN.md をカスタムテーマ化） | レポート + Explore 共通 |
| 挙動 | React Aria Components（無装飾）→ daisyUI で着せる | Explore の難所のみ（DateRangePicker / ComboBox） |
| チャート | visx（静的SVG・凍結OK・Explore でハイドレート） | 両方 |
| 不採用 | shadcn/ui | daisyUI とスタイル衝突するため |

### 不変条件（grilling で合意済み）

1. **凍結レポートは自己完結（CSS を各ファイルにインライン）。** 共有外部CSSにリンクすると過去レポートまで見た目が変わり「新旧混在を許容」が成立しなくなるため。
2. **共有する表示コンポーネントは isomorphic。** `node:fs` / `window` / duckdb を直接触らない。データは props。Explore の duckdb 取得層は表示層から分離する。
3. **DESIGN.md の方針を維持**（GitHub Inspired・紫禁止・影より境界線・高密度）。daisyUI のデフォルトテーマは使わず、DESIGN.md のパレットをカスタムテーマとして定義する。

## 現状（baseline）

- typecheck: green / tests: 325 passed。
- レポート描画: `src/pipeline/stages/render.ts` の `renderReportHtml` が renderer 文字列 + `PAGE_STYLES`（`src/renderers/page-styles.ts`）を連結 → 自己完結HTMLを `frozen-report.ts` が焼く。
- renderer: `Renderer = (data) => string`（`metric-cards` 59行 / `gantt-chart` 365行 / `bipartite-graph` 256行）。各々テスト有り（文字列出力をアサート）。
- Explore: Astro + React島（`PeriodPicker`=react-day-picker / `MultiSelect`=手書き）。Tailwind 未導入。

## フェーズ計画（各フェーズは green で着地：typecheck + tests + 目視）

### Phase 0 — ✅ 完了（実装済み）

実績と判明事項:
- Tailwind 4.3.1 + daisyUI 5.5.23 を **`@tailwindcss/postcss`** で導入（`src/web/postcss.config.mjs`）。`@tailwindcss/vite` は Astro 6 の rolldown-vite と非互換（`Missing field tsconfigPaths` / withastro/astro#16542）のため不採用。
- `@vitejs/plugin-react@5.2.0` が vite@8 を引き Astro(要 vite7) の dev を破壊（`@vite/client` 等が 500）→ `package.json` に `"overrides": { "vite": "^7" }` を追加して解決。
- 共有 `src/ui/theme.css`（`ghinsights` カスタムテーマ・`themes:false`）を Layout.astro で import。CLI spike と Vite/PostCSS の両出力で `ghinsights`/`#0891b2` を確認＝**単一情報源が両ビルド横断で機能**。
- **regression と修正**: preflight が Explore コントロールのネイティブchromeを剥がした。原因は `<Explore client:only="react">` で島が全クライアント描画され、`explore.astro` の **scoped `<style>` が島に届かないデッドコード**だったこと（UA デフォルトに依存していた）。→ `is:global` 化で設計済みの `.explore-*` styling が初めて適用され、見た目が改善。Phase 3 で React Aria + daisyUI に置換予定。
- 検証: `web:build` ✓ / `typecheck` ✓ / dev クリーン（500 解消）/ ギャラリー・Explore スクショで非regression（Explore はむしろ改善）。

#### （元の計画）Phase 0 — ツール基盤（Astro シェルのみ・最小リスク）
- `@tailwindcss/vite` を Astro に導入（Tailwind v4 は CSS-first config）。
- daisyUI を Tailwind プラグインとして読み込み（`@plugin "daisyui"`）。
- DESIGN.md のパレットを daisyUI カスタムテーマとして定義（`--bg-default` 等のトークンを daisyUI セマンティック変数へマップ）。
- サイドバー/ギャラリーを daisyUI で軽く確認（破壊変更なし）。
- 検証: `npm run web:build` 成功 + ギャラリーのスクショ。

### Phase 1 — ✅ 完了（実装・レビュー済み）

実績:
- `tsconfig.json` に `jsx: react-jsx` / `jsxImportSource` / `lib: DOM` / `src/**/*.tsx` を追加。
- `metric-cards.ts → .tsx`: 共有 `<MetricCards>` React コンポーネント + 文字列ラッパ `renderMetricCards`（`renderers/index.ts` 経由で CLI が利用、`web/explore.ts` も同じ関数を利用）。
- `pipeline/stages/render.ts → .tsx`: `renderToStaticMarkup` による React SSR ドキュメント（`<ReportHeader>`/`<ReportDocument>`）。`PAGE_STYLES` とセクション本体（gantt/bipartite=文字列renderer、AI markdown）は `dangerouslySetInnerHTML` で内包。チャートは Phase 4(visx) まで文字列のまま。
- **スコープ判断**: 複雑な SVG チャート（計600行）は Phase 4 で visx 化するので Phase 1 では JSX 化せず二度手間を回避。テスト改修も metric-cards だけに激減（実際は既存テストが無改修で通過）。
- 検証: typecheck ✓ / 全テスト 325 ✓（baseline 同一）/ 凍結 demo レポートを React SSR で再生成しスクショで見た目等価を確認（self-contained 維持、charset 正常、文字化け無し）。
- **実装レビュー反映**: ①目視用 `demo --skip-ai` がコミット済み demo を劣化上書き→revert。②`theme.css` ヘッダコメントの虚偽（vite/cli/report.css 参照）を現状に合わせ修正。XSS 信頼モデルは従来と不変、と確認済み。

#### （元の計画）Phase 1 — レポートの React SSR 化
- `Renderer = (data) => string` を `(data) => ReactElement` に変更。`renderers/index.ts` と `render.ts` を `renderToStaticMarkup` ベースへ。
- `metric-cards` / `gantt-chart` / `bipartite-graph` を JSX 化（SVG はそのまま JSX マークアップへ）。**既存の PAGE_STYLES はインラインのまま維持し、見た目は等価に保つ。**
- renderer テストを `renderToStaticMarkup(<Component/>)` でのアサートへ更新。
- 検証: `npm run demo -- --skip-ai` で凍結HTMLが従来と等価に出る + tests green + スクショ差分なし。

### Phase 2 — ✅ 完了（再スコープ：lean トークン共有）

**再スコープ判断**: PAGE_STYLES を精読した結果、(1) bespoke チャートCSS（timeline/bipartite、全体の約70%）は `:root` デザイントークンに依存し daisyUI 不能、(2) daisyUI のフル component 層 + preflight を凍結レポートに入れるとチャート破壊リスク（Phase 0 の Explore regression と同型）+80KB 肥大、(3) レポート chrome は既に DESIGN.md 準拠で綺麗。→ **レポートは「Tailwind utilities-only + 共有 DESIGN トークン（preflight 無し・daisyUI component 無し・4.7KB）」に留め、真の視覚刷新は Phase 4(visx) が担う**。daisyUI component は Explore（Phase 3）で活用。

実績:
- `src/ui/report.css`（utilities-only / preflight 無し / DESIGN トークンを `@theme` 化）。
- `scripts/build-report-css.mjs` → `src/renderers/report-css.generated.ts`（コミット、4.7KB）。`npm run build:report-css` で再生成。
- `render.tsx` が `REPORT_CSS`→`PAGE_STYLES` の順で各凍結ファイルに inline（PAGE_STYLES は unlayered で優先）。
- 検証: typecheck ✓ / 全テスト 325 ✓ / 一時demo をスクショ（self-contained・0 link tag・12.6KB gzip・視覚 regression 無し）。

#### （元の計画）Phase 2 — レポートの Tailwind/daisyUI 化（自己完結インラインCSS）
- レポート用 Tailwind CSS を `src/renderers/**` を走査してビルドする工程（`build:report-css`）を追加。`render.ts` がコンパイル済みCSSを読み込み、`PAGE_STYLES` を置換して**各凍結ファイルにインライン**。
- レポートの装飾を daisyUI 化: DORAカード→`stat`、セクション→`card`、メタ/テーブル/バッジ。DESIGN.md テーマ準拠。
- 検証: demo の凍結HTMLが自己完結のまま + 目視でモダン化 + tests green。

### Phase 3 — 共有コンポーネント抽出 + Explore 刷新 + React Aria
- 表示コンポーネントを共有ロケーション（例 `src/ui/`）へ抽出し、CLI 描画と Explore 島の両方から import。Explore の duckdb 取得層を分離。
- `PeriodPicker` を React Aria `DateRangePicker` に置換（古臭さの解消）。`MultiSelect` を React Aria `ComboBox`/`ListBox` に置換（手書き a11y を廃棄）。daisyUI で着せる。
- 検証: `npm run web:build` + Explore のスクショ（日付/複数選択）+ tests green。

### Phase 4 — visx チャート
- `gantt-chart` / `bipartite-graph` の内部を visx プリミティブ（@visx/scale, shape, axis, group）へ載せ替え。d3 配管を削減。bespoke レイアウトは維持。
- 検証: demo 凍結HTML + Explore でのハイドレート + tests green。

### 最終 — コードレビュー + 修正
- `/code-review` 相当の通読レビュー（バグ/簡約/一貫性）→ 指摘対応。

## Plan review 反映（改訂）

Plan エージェントのレビューで判明した重大点と改訂：

- **レポートはクライアントJSゼロではない。** `gantt-chart.ts` / `bipartite-graph.ts` は hover/tooltip/filter の inline `<script>` IIFE を出力し、`Explore.tsx` の `activateScripts()` が `innerHTML` 後に再実行している。→ **Phase 1 はこの IIFE を書き換えず `dangerouslySetInnerHTML` で温存**（挙動と Explore 再実行を不変に保つ）。挙動の本格書き換えは **Phase 4（visx）で DOM 構造変更と一緒に**行う。stack 表の「クライアントJSゼロ」は「ハイドレーションしない」の意で、hover 用の小さな inline script は残る。
- **renderer テストは厳密文字列一致**（gantt だけで45 `toContain`、属性順・無空白・エスケープ依存）。`renderToStaticMarkup` は属性順・空白・エスケープ（`'`→`&#x27;`）が変わり大半が崩れる。→ **Phase 1 で DOM-query/セマンティックhook ベース（data-属性 / role / テキスト）へ一度だけ移行**し、Phase 2 の className 差し替え・Phase 4 の visx で再churn しない設計にする。受け入れゲートは「スクショ差分ゼロ」。
- **Phase 1+2 は同じ3 renderer を二度触る。** 二度塗りコストは認める。Phase 1 は PAGE_STYLES の className を verbatim 維持、テストは安定hookで書く → Phase 2 の className 差し替えがテストを壊さないようにして吸収。
- **Tailwind JIT が動的クラスをパージする。** `metric-card-${tone}` / `segment ${state}` の interpolation はリテラル抽出されず purge される。→ **動的クラスは静的lookupマップ化**（全リテラルがソースに出る）。bipartite の CSS変数駆動 inline style は **Tailwind 化せず inline custom CSS のまま**残す（utility で表現不能）。
- **テーマの単一情報源 = `src/ui/theme.css`。** daisyUI カスタムテーマ（`@theme` + `@plugin "daisyui"`、デフォルトテーマ無効・紫排除）を1ファイルに置き、**Astro(Vite) と CLI の両 Tailwind 起動が同じファイルを食う**。Phase 0 で確立。
- **tsconfig 前提**: root `tsconfig.json` は `src/web` 除外・`lib` に DOM 無し・`jsx` 未設定。renderer は root プロジェクト配下なので、Phase 1 で `"jsx": "react-jsx"` 追加 + `tsx` が renderer の JSX を透過することを検証。
- **markdown 注入**は `dangerouslySetInnerHTML` 化が必要。`.ai-markdown` タイポグラフィを daisyUI 移行後も維持（daisyUI typography/prose は別プラグイン、採否を Phase 2 で判断）。
- **ギャラリー index** は2系統: `render.ts:buildIndexHtml`（FSスキャン・dead の可能性）と `frozen-report.ts:renderIndexHtml`（index.json 由来・本番）。本番側の inline 色を DESIGN.md トークンに整合させる（Phase 2 に追加）。dead なら削除。
- **Phase 3 の duckdb 分離は概ね完了済み**。`explore.ts:buildExploreHtml` は `runner` を引数で受ける純関数、`duckdb-runner.ts` が唯一の duckdb importer。→ Phase 3 の主眼は「Explore が `renderToStaticMarkup→innerHTML+activateScripts` を維持するか、React子ツリーとして描くか」の決定に絞る。

### Phase -1（spike・最優先）— CSS パイプライン検証

phase 着手前に、最もリスキーな前提を1スパイクで証明する：

1. `src/ui/theme.css` に DESIGN.md パレットを daisyUI v5 カスタムテーマ（`@theme`+`@plugin "daisyui"`）で記述。デフォルトテーマ無効・紫無し。
2. **standalone `tailwindcss` CLI**（Vite プラグインでない方）で、静的 daisyUI クラス（`stat`/`card`）と動的 interpolation クラス（`metric-card-${tone}`）を両方含む fixture `.tsx` を走査 → 出力CSSを単一自己完結 HTML にインライン。
3. 確認: (a) daisyUI コンポーネントCSSが出る (b) テーマトークンが解決する (c) 動的クラスが purge される（=safelist/静的マップが要る証明）(d) インラインCSSサイズが各凍結ファイル複製に耐える。
4. 同じ `theme.css` を Astro Vite Tailwind プラグインに通し Explore が同一に描けることを確認（単一情報源が両build横断で機能する証明）。

合格すれば Phase 0/2/最終が de-risk される。

**Spike 結果（実施済み・合格）:** Tailwind 4.3.1 + daisyUI 5.5.23。`@tailwindcss/cli` で `src/ui/theme.css`（DESIGN.md→daisyUI カスタムテーマ `ghinsights`）を実ビルド。(a) `.stat/.card/.badge` 出力 (b) トークン解決・紫排除 (c) 動的クラス `metric-card-${tone}` は purge → **静的lookupマップ必須** (d) 81KB raw / **12.5KB gzip** 自己完結。**重要な発見**: `@plugin "daisyui"` は既定で light/dark ビルトインテーマ（ピンク/紫を含む）も吐くため `themes: false` で無効化必須。`src/ui/theme.css` に反映済み。

## 実施結果サマリ（最終）

- ✅ **Phase 0**: Tailwind v4 + daisyUI（PostCSS 経由）、共有テーマ `ghinsights`、vite^7 override、Explore preflight regression を `is:global` で解消。
- ✅ **Phase 1**: レポート React SSR 化、`MetricCards` 共有コンポーネント化、見た目等価。
- ✅ **Phase 2（再スコープ→最終的に撤回）**: 当初 report に lean Tailwind utilities 層を配線したが、最終レビューで「レンダラは Tailwind utility を1つも使っておらず、Tailwind が `.ts` 内のCSSプロパティ名を誤検出して ~5KB のゴミ utility を生成 + 生成物 drift」が判明。→ **report-CSS 層は撤去**し、レポートは綺麗な `PAGE_STYLES` のまま。結論: レポート chrome は既に DESIGN.md 準拠で、Tailwind 層は時期尚早。共有トークンは Explore（`theme.css`）で実現済み。レポートが実際に utility/daisyUI を要する将来段階で再導入する。
- ✅ **Phase 3**: Explore の日時選択を React Aria `DateRangePicker` に置換（**ユーザー最重要ペイン「古臭い日時選択」を解消**）。2ヶ月レンジカレンダー、編集可能セグメント、`I18nProvider locale="ja-JP"` で日本語ローカライズ、DESIGN.md スタイル。react-day-picker 削除。共有コンポーネント抽出は `MetricCards`（Phase 1）+ duckdb 取得層は元々分離済みで達成。MultiSelect は機能十分のため手書きを維持。
- ⏹️ **Phase 4（visx）= ドロップ**: gantt(365行)/bipartite(256行) は **div ベースの bespoke チャート + 独自インタラクティブ `<script>`** で、標準SVGチャート用の visx は**不適合**。visx 化は大規模書き換え+回帰リスクで利得が薄く、チャートは既に機能・見た目とも良好。よってドロップ（チャート刷新が必要なら visx ではなく別アプローチで別途スコープ）。
- ✅ **最終コードレビュー**: BLOCKER 0。SHOULD-FIX 2件（report-CSS の drift + ゴミ utility）→ report-CSS 層撤去で解消。NIT（I18nProvider）→ 対応。その他クリア。

**検証状態**: root/web typecheck clean、全 325 tests green、`web:build` green、凍結レポート self-contained 維持（64KB、0 link tag）、Explore 日付ピッカーを目視確認（ja-JP）。

**未コミット**: 全変更は作業ツリーに保持。ユーザー指示があればコミット。

## リスクと対処

- **Tailwind を Node SSR 経路へ通す**: Astro(Vite) 経路とは別に、CLI 経路用のCSSビルドが要る。Phase 2 で `tailwindcss` CLI を `src/renderers/**` 対象に走らせ、出力CSS文字列をインライン。Context7 で Tailwind v4 / daisyUI v5 の最新セットアップを確認してから実装。
- **renderer テストの破壊**: 文字列アサート → コンポーネントレンダリングへ。Phase 1 で一括更新。
- **凍結アーカイブの不変性**: CSS は常にインライン。外部リンク化しない。
- **isomorphic 違反**: 共有コンポーネントから node/browser 専用APIを排除。Phase 3 で取得層分離を徹底。
- **デモ目視の必須化**: DESIGN.md の運用ルール通り、PR Timeline / Review Correlation / DORA の変更時はブラウザ確認。
</content>
</invoke>
