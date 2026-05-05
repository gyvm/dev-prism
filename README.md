# gh-insights

GitHub の Pull Request を週次で集計し、定量メトリクスと AI 分析を組み合わせた静的 HTML レポートを生成する Node.js / TypeScript パイプライン。GitHub Actions で日次実行し、GitHub Pages に自動デプロイできます。

<!-- TODO: docs/images/index-overview.png — `dist/index.html`(または `dist/demo/index.html`)のインデックスページ全景を貼る -->

## 何ができるか

- 複数リポジトリ横断の PR データ収集 (GitHub GraphQL)
- DORA メトリクス / PR タイムライン / レビュー相関の定量分析
- Copilot SDK + Claude Code Skill 形式の AI 分析 (議論が起きた PR / フォローアップ PR / プロジェクト進捗)
- 週次 HTML レポート + 全期間インデックスページの生成
- GitHub Actions による週次自動更新 + GitHub Pages デプロイ

## 必要環境

- Node.js >= 22
- 認証: GitHub PAT または GitHub App のいずれか
- AI 分析を使う場合: GitHub Copilot のローカルセッション (`copilot` CLI でログイン) または `COPILOT_GITHUB_TOKEN`

## クイックスタート

### 1. fork & clone

このリポジトリを fork して、自分の手元に clone します。

```bash
git clone https://github.com/<your-org>/gh-insights.git
cd gh-insights
npm install
```

### 2. PAT を発行する

1. https://github.com/settings/personal-access-tokens/new を開く
2. **Token name** を設定 (例: `gh-insights`)
3. **Repository access** で対象リポジトリを選択
4. **Permissions > Repository permissions** で **Pull requests** を **Read-only** に設定
5. 生成された `github_pat_...` をコピー

### 3. `config.toml` を編集する

リポジトリルートの `config.toml` で対象リポジトリを書き換えます。

```toml
timezone = "Asia/Tokyo"

# 各エントリは "owner/name" または "owner/*"。
# "owner/*" は archived を除く owner 配下の全リポジトリに展開されます
# (トークンに権限があれば private も含む)。
repositories = [
  "your-org/your-repo",
  "your-org/another-repo",
  # "your-org/*",
]
```

詳しい設定項目は [設定 (`config.toml`)](#設定-configtoml) を参照。

### 4. 動作確認

まずは AI 分析を抜いて(Copilot セッション不要)動作確認します。

```bash
GITHUB_TOKEN=github_pat_... npm run report -- --skip-ai
```

成功すると以下が生成されます:

- `data/raw/<period>.json` — 取得した PR の生データ
- `data/analysis/<period>/*.{json,md}` — 各分析の出力
- `dist/reports/<period>.html` — 1 週分の HTML レポート
- `dist/index.html` — 全期間のインデックスページ

### 5. AI 分析込みで実行する

GitHub Copilot にローカルでログインしてから `--skip-ai` を外して実行します。

```bash
copilot                  # 初回のみ。プロンプトで `/login` してログイン
GITHUB_TOKEN=github_pat_... npm run report
```

### サンプルデータで試す

リポジトリには `data/demo/2026-05-03.json` というサンプル raw データが同梱されています。GitHub に問い合わせずにレポート生成を試したい場合に使えます。

```bash
npm run demo
# → dist/demo/reports/<period>.html と dist/demo/index.html が出る
```

## 設定 (`config.toml`)

| キー | 説明 |
|---|---|
| `timezone` | 週境界を計算するタイムゾーン (例: `Asia/Tokyo`) |
| `repositories` | 対象リポジトリの配列。各要素は `"owner/name"` または `"owner/*"` (ワイルドカードは archived を除く owner 配下の全リポジトリに展開) |
| `[caps]` | 1 PR あたりの取得上限 (コメント数、レビュースレッド数、ファイル数、本文長など)。GraphQL のページング負荷を抑える |
| `[actors].botLoginPatterns` | bot と見なす GitHub login の正規表現配列。大文字小文字は区別しない |
| `[ai].model` | AI 分析で使う Copilot SDK のモデル ID。省略時は SDK のデフォルト |
| `[analyses].disabled` | 無効化したい分析 ID の配列 |
| `[analyses].overrides` | 各分析の内部パラメータを上書き (例: `"dora-metrics" = { firstReviewThresholdHours = 24 }`) |

`[analyses]` を省略すると、`skills/` 配下の AI skill と `src/pipeline/stages/analyze.ts` の `COMPUTE_REGISTRY` に登録された compute 分析がすべて既定パラメータで実行されます。`disabled` と `overrides` は調整したいときだけ書きます。

利用可能な Copilot モデル ID は `copilot` CLI 内で `/model` を実行するか、Copilot SDK の `client.listModels()` で確認できます。

## 環境変数

### 認証 (どちらか一方)

**A. PAT (推奨)**

| 変数 | 説明 |
|---|---|
| `GITHUB_TOKEN` | Pull request の read-only 権限がある PAT |

**B. GitHub App**

| 変数 | 説明 |
|---|---|
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | PEM 形式の秘密鍵 (改行は実改行または `\n` エスケープ) |
| `GITHUB_APP_INSTALLATION_ID` | Installation ID (正の整数) |

### 任意

| 変数 | 既定値 | 説明 |
|---|---|---|
| `COPILOT_GITHUB_TOKEN` | (未設定) | AI 分析専用の PAT。設定すると `GITHUB_TOKEN` と認証を分離できる。未設定なら `copilot` CLI のローカルセッションを使う |
| `LOOKBACK_DAYS` | 90 | PR 取得のさかのぼり日数 |
| `FIRST_REVIEW_THRESHOLD_HOURS` | 48 | 「初回レビューが遅い」と判定する閾値 |

## CLI

| コマンド | 役割 |
|---|---|
| `npm run collect` | PR データ取得のみ。`data/raw/<period>.json` を書く |
| `npm run report` | fetch → analyze → render の全体パイプライン |
| `npm run demo` | 同梱サンプル raw データ (`data/demo/`) でレポート生成 |

`npm run report` の主なフラグ:

| フラグ | 説明 |
|---|---|
| `--config <path>` | `config.toml` の場所 |
| `--raw-dir <path>` | 生 PR データの出力先 |
| `--analysis-dir <path>` | 分析結果の出力先 |
| `--reports-dir <path>` | HTML レポートの出力先 |
| `--index <path>` | インデックス HTML の出力先 |
| `--skills <path>` | AI skill のルートディレクトリ |
| `--week YYYY-MM-DD` | 対象週に含まれる日付。指定週(月曜始まり)を集計 |
| `--use-raw <path>` | 既存の raw snapshot を再利用し fetch をスキップ。analyze + render のみ走る |
| `--skip-ai` | AI skill を全部 `skipped` 扱いにする (Copilot 不要) |

## 仕組み

```
[fetch]   src/collector/      → data/raw/<period>.json
[analyze] src/pipeline/stages → data/analysis/<period>/<id>.{json,md} + _summary.json
[render]  src/renderers/      → dist/reports/<period>.html + dist/index.html
```

- **fetch**: `src/collector/` が GitHub GraphQL API で PR を取得し、`config.toml` の `[caps]` で正規化して保存
- **analyze**: `src/pipeline/stages/analyze.ts` が以下 2 種類の分析を `Promise.all` で並列実行
  - **compute 分析** (`src/analyses/<id>/compute.ts`) — TypeScript で書く決定的な集計。`COMPUTE_REGISTRY` に renderer とセットで登録
  - **AI skill** (`skills/<id>/SKILL.md`) — Copilot SDK 経由でプロンプト分析を実行。`skills/` 配下を自動スキャンして発見
- **render**: `src/renderers/` の各 renderer (`metric-cards` / `gantt-chart` / `bipartite-graph`) が JSON を HTML に変換し、1 週分のレポートと全期間インデックスを出力

各分析は失敗してもパイプライン全体を止めず、結果は `data/analysis/<period>/_summary.json` に以下のいずれかのステータスで残ります。

| ステータス | 発生条件 | レンダリング |
|---|---|---|
| `ok` | 成功 | 通常表示 |
| `no-data` | 入力は妥当だが対象データなし (`NoDataError`) | プレースホルダ |
| `skipped` | `[analyses].disabled` か `--skip-ai` で無効化 | プレースホルダ |
| `error` | スキーマ違反や予期しない例外 | プレースホルダ + `_summary.json` に reason |

<!-- TODO: docs/images/report-page.png — 1 週分のレポートページ全体のフルページキャプチャを貼る (DORA カード / Gantt / レビュー相関 / AI セクションが順に並んでいるもの) -->

## 分析を追加する

<!-- TODO: docs/images/skill-section.png — AI skill 出力例の部分拡大 (例: `## 議論があったPR` 節)。skill 1 つ追加するとこういうセクションが増える、と直感的に伝わる切り抜き -->

新しい分析の観点を追加するには 2 つのルートがあります。**プロンプトで書ける分析なら AI skill が圧倒的に楽**です(コードを書かずに `SKILL.md` を 1 つ置くだけ)。決定的に集計したいときだけ compute 分析を書きます。

### A. AI skill を追加する (プロンプトベース)

1. `skills/<NN>_<id>/SKILL.md` を新規作成 (ディレクトリ名がそのまま分析 ID になる)。先頭の `NN_` プレフィックスで AI セクション内の表示順が決まる (`01_`, `02_`, ... 昇順)
2. YAML frontmatter の `name` はディレクトリ名と完全に一致させる (例: `name: 04_my-analysis`)。Copilot SDK はこの `name` でスキルを識別する
3. 本文に Markdown プロンプトを書く。**出力先頭の `## ...` セクション見出しはプロンプト本文にハードコードする** (例: `先頭は必ず "## 議論があったPR" にする`)
4. これだけで自動発見される (`skills/` を `discoverAiSkillIds()` がスキャンしてディレクトリ名でソート)

最小例:

```markdown
---
name: 04_my-analysis
description: 何を分析する skill かの 1 行説明
---

PR データを参照し、〜の観点で日本語のセクションを出力してください。

出力:
- 先頭は必ず `## 〜〜のサマリ` にする
- ...
```

既存実例: `skills/01_project-progress/SKILL.md`、`skills/02_follow-up-prs/SKILL.md`、`skills/03_debated-prs/SKILL.md`。

### B. Compute 分析を追加する (TypeScript ベース)

決定的な集計や数値計算で、AI に頼らず定量的に出したいケース。

1. `src/analyses/<id>/compute.ts` を作成し、`compute(ctx: AnalysisContext) => unknown` をエクスポート
2. `src/pipeline/stages/analyze.ts` の `COMPUTE_REGISTRY` に `{ compute, renderer }` を追加 (登録順がレポートの表示順になる)
3. 出力 JSON を既存 renderer (`metric-cards` / `gantt-chart` / `bipartite-graph`) のいずれかが扱える形にする。新しいビジュアルが必要なら `src/renderers/<name>.ts` を追加して `src/renderers/index.ts` に登録

既存実例: `src/analyses/dora-metrics/compute.ts`、`src/analyses/pr-timeline/compute.ts`、`src/analyses/review-correlation/compute.ts`。

データ不足のときは `pipeline/failure.ts` の `NoDataError` を投げると `no-data` ステータスにマップされ、レンダラ側でプレースホルダ表示されます。

## GitHub Actions による週次自動デプロイ

`.github/workflows/weekly.yml` が毎週月曜 00:00 UTC に走り、PR データを集めて `data/` をコミットし、HTML を GitHub Pages にデプロイします。CI ランナーには Copilot セッションが無いので **`--skip-ai` で実行**しています(AI 分析は `skipped` になります)。

### Secrets を設定

リポジトリの **Settings > Secrets and variables > Actions** で以下を追加:

- `GH_INSIGHTS_TOKEN` — クイックスタートで作った PAT
- もしくは `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID`

### Pages を有効化

1. **Settings > Pages**
2. **Source** で **GitHub Actions** を選択

ワークフロー実行後、`https://<owner>.github.io/<repo>/` でレポートが見られます。

## 開発

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsc
```

デバッグの定石: 一度 `npm run report` で `data/raw/<period>.json` を作っておき、以降は `npm run report -- --use-raw data/raw/<period>.json --skip-ai` で API を叩かず analyze + render だけを高速に回せます。

## Claude Code プラグインとして

このリポジトリは `.claude-plugin/plugin.json` を同梱しており、Claude Code のローカルプラグインとして配布できます。

```text
/plugin marketplace add /path/to/gh-insights
/plugin install gh-insights@local
```

## License

MIT License. 詳細は [LICENSE](./LICENSE) を参照してください。
