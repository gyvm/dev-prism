# Explore ビュー分割・表示層分離 計画

Explore を「標準的なインサイトを積み増せる静的サイト」へ育てるための計画。

## 決定（議論で確定）

### D1. 表示層の共有をやめる

凍結レポートと Explore で**レンダラ（表示）を共有しない**。共有は上位2層のみ:

| 層 | 共有 | 理由 |
|---|---|---|
| SQL / query 関数 | ✅ 維持 | 数値の parity。これが `explore-plan.md` の中核価値 |
| view-model 型 | ✅ 維持 | 同上 |
| DESIGN.md トークン値 | ✅ 維持 | 見た目の一貫性の担保 |
| **レンダラ（表示）** | ❌ **分離** | 下記 |

**分離の理由**: 凍結レポートは自己完結（バンドラなし・React ランタイムなし）という制約を持ち、
それがレンダラの出力形式を「HTML 文字列 + インライン `<script>`」に固定している。
結果 Explore は React があるのに `innerHTML` + `activateScripts` を強いられていた
（= より貧しい方の制約に合わせさせられていた）。

**捨てるのはピクセルの一致だけ**で、数値の parity は完全に維持される。

**却下した代替案（ラッパー方式）**: 共有する純粋表示コンポーネント + Explore 専用の
インタラクティブラッパーに分ける案。動作中の `gantt-chart.ts`(365行) /
`bipartite-graph.ts`(256行) から表示の核を抽出するリファクタが必要で、
属性順・空白に依存した `toContain` アサート45個を巻き込む。
利得（実装の一本化）に対してリスクが高いため却下。新規実装の方が安全。

### D2. 凍結レポートには一切触らない

`src/renderers/*` は凍結レポート専用に降格。**現状のまま維持**する。
これにより「ガントの hover に入っている aux 情報をどうするか」の判断も不要になる
（凍結側は今のまま hover 付きで動き続ける）。

### D3. runner はモジュールスコープのシングルトン

ページ遷移をまたいで DuckDB-WASM を再ブートさせないため、`WasmRunner` を
コンポーネントスコープ（現 `Explore.tsx` の `runnerRef`）からモジュールスコープへ移す。

Astro の `<ClientRouter />` 下では同一 JS realm が維持される:

> "Bundled module scripts, which are the default scripts in Astro, are only ever
> executed once. After initial execution they will be ignored, even if the script
> exists on the new page." / "This works because `window` is preserved."
> — https://docs.astro.build/en/guides/view-transitions/

島は再マウントされてよい（React state は捨てる）。高価なリソースだけがライフサイクルから外れる。
`transition:persist` には依存しない（公式ドキュメントに `client:only` への言及が皆無で確度が低いため）。

**フルリロード・直リンク時は再ブートする。これは許容。**

## 目標アーキテクチャ

```
src/analyses/*/query.ts   共有。SQL + view-model                    ← 変更なし
src/renderers/*           凍結レポート専用に降格                    ← 触らない
src/web/views/*           新規。Explore 専用 React コンポーネント   ← ここに積む
```

新しいインサイトを足す = レジストリに1行足して React コンポーネントを1つ書く。

```ts
const VIEWS = {
  flow:     { label: "フロー",   query: ..., Component: FlowView },
  review:   { label: "レビュー", query: ..., Component: ReviewView },
  timeline: { label: "PR個別",   query: ..., Component: TimelineView },
};
```

## ステップ

各ステップは green で着地（typecheck + tests + `web:build` + 目視）。

### Step 1 — ビューのレジストリ化 + シングルトン runner + ClientRouter

- `src/web/views/registry.ts` を新設。`explore.ts:buildExploreHtml`（3分析を1つの
  HTML に結合）をビュー単位に分解
- `duckdb-runner.ts` にモジュールスコープのシングルトンを追加。**失敗時は必ずキャッシュを
  リセットする**（`cached ??= create()` は reject した Promise も保持し、以降永久に
  失敗し続けるため）
- `Layout.astro` に `<ClientRouter />`、ビューごとの Astro ページで実 URL パス
- **この段階では gantt / bipartite は既存の文字列レンダラのまま**1ビューに収める
  （`innerHTML` + `activateScripts` は Step 4 まで残す）
- フィルタはクエリパラメータで保持されるので、ビュー間リンクは現在のクエリ文字列を引き継ぐこと

### Step 2 — トークンの境界を引き直す

現状トークンが3箇所に散っている:

| # | 場所 | 例 |
|---|---|---|
| ① | `page-styles.ts` の `:root` | `--fg-muted: #586574` |
| ② | `theme.css` の `@theme` | `--color-fg-muted: #586574`（同値・別名） |
| ③ | `explore.astro` のベタ書き | `color: #586574`（トークン非経由・**ドリフト済み**） |

- DESIGN.md の値を単一の情報源から ①② へ生成する
- ③ のベタ書きをトークン参照に置換
- **`PAGE_STYLES` の Explore からの除去は Step 4**（それまで文字列レンダラが依存するため）

**虚偽コメントの是正**（実装と食い違っている記述が3箇所）:

- `theme.css`: 「timeline rails, role colors, chart CSS vars を theme variable として保持」
  → `@theme` は5トークンのみで、それらは**含まれていない**
- `astro.config.mjs`: 「theme.css は Node CLI レポート経路が消費する同一トークン源なので
  ドリフトしない」→ Phase 2 撤回により CLI 経路は `PAGE_STYLES` を使う
- `page-styles.ts`: 「Shared report/Explore CSS」→ Step 4 完了後は report 専用

### Step 3 — 新しいインサイトを React で足す

Explore 専用コンポーネントの型を作る。最小コストの勝ち筋から:

- **件数推移（activity-trend）** — `queryActivityTrend` は実装済みでレンダラだけが無い。
  現状 Explore からも呼ばれておらず実質デッドコード

以降の候補（データは揃っているが未使用）:

| 追加 | 使うカラム |
|---|---|
| PR サイズ分布 | `additions` / `deletions` / `changed_files`（`changed_files` は完全未使用） |
| 通過率ファネル | `ready_for_review_at` / `first_review_at` / `first_approve_at` の null 率 |
| レビュー依頼→着手 | `activities.target_actor_id`（`review_requested`） |
| スレッド解決率 | `pr_review_threads.is_resolved` / `resolved_by_actor_id` |

**注意**: レビュー系の新規指標は「AI レビューを計測対象にするか」の方針決定に依存する
（実測で `first_approve_at` の null 率 100%、レビューの 97% が AI）。
本計画では**フロー系（bot 方針から独立）を先行**させ、レビュー系の新規指標は方針決定後に回す。
Step 1 の `review` ビューは既存 `review-correlation` の移設のみで、新規指標は含まない。

### Step 4 — gantt / bipartite を React 化し、`innerHTML` を削除

- Explore 用の React 実装を新規に書く（凍結側の文字列レンダラは残す）
- `activateScripts` と `innerHTML` を削除
- `explore.astro` から `PAGE_STYLES` を除去 → **各経路スタイルシート1枚**が完成
- `page-styles.ts` のコメントを report 専用に更新

**現存するリークの解消**（Step 4 の主目的のひとつ）:

`gantt-chart.ts` のインライン IIFE は
`document.body.appendChild(tooltip)`(126行) と
`window.addEventListener('scroll'|'blur', ...)`(239-240行) を実行するが、解除するコードが無い。
IIFE なので再実行のたびに**新しいクロージャで window リスナが2つ増える**
（同一参照でないため `removeEventListener` 自体が不可能な書かれ方）。
`run()` はフィルタ変更のたびに呼ばれるため、**現時点で既に蓄積している**。
機能的に壊れない（孤児 tooltip を hide するだけ）ので気づかれていない。

## 検証

- 各ステップ: `npm run typecheck` / `npx vitest run` / `npm run web:build`
- ブラウザ目視: ビュー切替でブートが1回のみであること
- DESIGN.md のワークフロー通り、チャート変更時はスクリーンショット確認

## 実施結果

**ベースライン**: typecheck clean / 51ファイル 394テスト green。
**着地**: typecheck clean（web 込み）/ 52ファイル 412テスト green / `web:build` green。

### Step 1 — ✅ 完了

`src/web/views/registry.ts` + ビューごとの Astro ページ（`pages/explore/[view].astro`）、
`getWasmRunner()` のモジュールスコープ singleton、`Layout.astro` に `<ClientRouter />`。
`/explore/` は既定ビューへ meta refresh（クエリを引き継ぐ）。

**実測での検証**（Playwright）: `/explore/flow/` でブート後、review → timeline と
2回遷移しても `performance.getEntriesByType("resource")` 上の parquet は 8件・wasm は
1件のまま。`window.__realmMarker` が遷移後も生存＝同一 JS realm 維持を直接確認。
タブリンクはクエリ文字列を引き継ぐ（capture フェーズで href を書き換え）。

### Step 2 — ✅ 完了（一部を意図的に繰り延べ）

`src/ui/tokens.ts` が唯一のパレット情報源に。`renderRootCss()` の出力が
旧 `:root` ブロックと**バイト単位で一致**することを確認済み（凍結レポートの出力不変）。
`explore-styles.ts` のベタ書き hex はトークン参照に置換。

`src/ui/tokens.test.ts`（18件）が theme.css との乖離を検出する。ビルド手順を増やさずに
ドリフトを止める狙い（Tailwind の CSS-first config は TS を import できないため、
theme.css のリテラルは残さざるを得ない）。

虚偽コメント3件（theme.css / astro.config.mjs / page-styles.ts）を実態に合わせて修正。

**「各経路スタイルシート1枚」は取り下げ**（当初 Step 4 に含めると書いたが撤回）。

理由は計測による。Explore が読み込む PAGE_STYLES 14,969 bytes のうち、Explore では
決してマッチしないルール（`.report-*` `.dev-prism-*` `.ai-markdown`）は 32行・3,022 bytes
= 20.2%。gzip 後は 1KB 弱で、**7.1MB の WASM ブートに対してノイズ**。
一方コストは実在する: React チャートが同じクラス名を再利用しており、それらのルールは
レポート専用 chrome と行単位で入り組んでいる（`section` / `h2` / `.section-head` /
`.empty` は両方が使う）。カスケード順を保ったまま割るには断片モジュールの
連結順に依存する構造になり、得られるものに見合わない。

**代わりに結合をテストで固定した**（`src/web/views/shared-styles.test.ts`）。
分割が本当に欲しかったのは「PAGE_STYLES が不透明な塊で、どのルールが Explore の
生命線か分からない」という保守上の危険の解消であり、それはテストで達成できる:

- 各 view コンポーネントが使う `className` を走査し、PAGE_STYLES か EXPLORE_STYLES の
  どちらかが定義していることを検証する
- Explore が依存する PAGE_STYLES 側のクラス19個を列挙し、消えたら落ちるようにする

**このテストは導入直後に実バグを検出した**: `legend-closed-unmerged` はどの
スタイルシートにも定義が無い死んだクラスだった（既存の `gantt-chart.ts:343` にも
存在する先行条件）。Explore 側からは除去、凍結レポート側は D2 に従い据え置き。

### Step 3 — ✅ 完了

`src/web/views/TrendChart.tsx`。デッドコードだった `queryActivityTrend` が初めて描画される。

**配色は検証済み**（目視ではなく `dataviz` の validator で計算）。当初案の4系列1枚は
**FAIL** — シアン↔緑が normal-vision で ΔE 12.5（基準15未満）。よって
**2系列×2枚に分割**した（フロー: 作成/マージ、レビュー: レビュー/コメント）。
どちらも全チェック PASS。PR 件数とコメント件数は桁が違うため、軸を分ける判断は
色覚とスケールの両面から正当化される。**hex を変える際は必ず再検証すること。**

凡例 + 行末の直接ラベルで二重符号化。ラベルは衝突時に13px 押し下げる
（系列が終盤で収束すると重なって判読不能になる。スクリーンショットで発見）。

### Step 4 — ✅ 完了

`GanttChart.tsx` / `BipartiteGraph.tsx` を新規実装。`LegacyHtml` を削除し、
`innerHTML` + `activateScripts` は消滅。`src/renderers/*` は無変更（D2 を遵守）。

**リーク解消を実測で確認**: 旧実装は `run()` のたびに window リスナが2つ増え、
tooltip が `document.body` に孤児として残っていた。新実装で6回再実行しても
`document.body` 上の `.timeline-tooltip` は **0件**。tooltip は `createPortal` で
React のライフサイクルに載せ、リスナは `useEffect` のクリーンアップで解除する。

## 副次的な発見

**`src/web` はルートの型検査から分離されている。** そのため `typecheck:web` を
`typecheck` から呼ぶようにし、`@astrojs/check` を devDependency に追加して
`web:check`（astro check）も実行可能にした。既存の型エラー2件（astro.config.mjs の
Vite プラグイン `apply` の型）も解消済み。

## 今後の作業（積み残しではなく、新規の追加）

計画した4ステップは完了済み。以下は「インサイトを増やす」側の話で、着手は任意。

1. **チャート語彙の残り** — 分布（ヒストグラム）、ファネル、順位付き横棒、テーブル。
   語彙を7種に抑える方針（`docs/` の議論による）。追加時は必ず `dataviz` の
   validator で配色を検証すること
2. **未使用カラムを使う指標** — `changed_files`（PRサイズ）、`activities.target_actor_id`
   （レビュー依頼→着手）、`pr_review_threads.is_resolved`（解決率）、`actors.team`（チーム別）
3. **レビュー系の新規指標** — bot 方針の決定待ち。フロー系は独立して進められる
