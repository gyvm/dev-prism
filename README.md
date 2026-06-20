# pr-weekly-report

GitHub の Pull Request を集計し、定量メトリクス (DORA / レビュー相関 / PR タイムライン) と
AI 分析を組み合わせた静的ダッシュボード (Explore + Reports ギャラリー) を生成します。

デモページ:
https://gyvm.github.io/pr-weekly-report/demo/reports/2026-05-03.html

<details>
<summary>全体のスクリーンショット</summary>

![pr-weekly-report demo screenshot](docs/images/pr_weekly_report_dist_demo_reports_2026-05-03.html.png)

</details>

## 仕組み

3 つの関心事に分かれています。導入パターンの違いは「どこで実行し、どこに配信するか」だけで、
中身のパイプラインは共通です。

| レイヤ | 実体 | 補足 |
|---|---|---|
| **データ** | `data/dwh/` の DuckDB parquet (DWH) | 真実の源。`updated_at` から収集カーソルを自己復元する増分収集 |
| **サイト** | Astro 6 + React islands → `dist/` | Reports ギャラリーは SSG、Explore は DuckDB-WASM で parquet をライブクエリ |
| **AI 分析** | GitHub Copilot SDK + `skills/` の prompt | 任意。トークン未設定なら自動で `--skip-ai` にフォールバック |

## 導入パターン早見表

| パターン | 実行環境 | 配信先 | 向いているケース |
|---|---|---|---|
| **A. ローカル** | 手元の Node | ローカルの `dist/` を開く | まず試す / 単発で見たい |
| **B. GitHub Actions + ホスティング** | GitHub-hosted runner | GitHub Pages / Cloudflare 等 | **推奨。** 週次自動化を最小手間で回したい |
| **C. セルフホスト (Docker)** | 自前サーバ / インスタンス | nginx 等で自前配信 | GHES 社内配信 / Pages を使えない / データを外に出せない |

> **迷ったら B。** GitHub Actions はホスト型 cron・無料の Pages 配信・`GITHUB_API_URL`
> 自動注入・secret 管理をタダで提供します。C はそれらを全部自前で背負う代わりに、
> インターネット非公開やオンプレ配信が可能になります。

---

## 認証 (全パターン共通)

このツールは用途の異なる 2 つの Fine-grained PAT を使います (GitHub App でも可、後述)。

| 環境変数 | 用途 |
|---|---|
| `GITHUB_TOKEN` | PR データ取得 (GraphQL) |
| `COPILOT_GITHUB_TOKEN` | AI 分析 (Copilot SDK)。任意 |

本来は 1 つにまとめたいところですが、組織所有 (organization-owned) の Fine-grained PAT では
`Copilot Requests` 権限が UI に出ない既知の制約
([github/copilot-cli#223](https://github.com/github/copilot-cli/issues/223)) があるため、現状は分けています。

### `GITHUB_TOKEN` (PR 取得用)

1. https://github.com/settings/personal-access-tokens/new を開く
2. **Token name** を設定 (例: `pr-weekly-report-fetch`)
3. **Repository access** で対象リポジトリを選択
4. **Permissions > Repository permissions** で **Pull requests** を **Read-only** に設定
5. 生成された `github_pat_...` をコピー

### `COPILOT_GITHUB_TOKEN` (AI 分析用・任意)

1. https://github.com/settings/personal-access-tokens/new を開く
2. **Token name** を設定 (例: `pr-weekly-report-copilot`)
3. **Resource owner** は自分のユーザーアカウントを選択
4. **Repository access** は **Public Repositories (read-only)** で十分
5. **Permissions > Account permissions** で **Copilot Requests** を **Read-only** に設定
6. 生成された `github_pat_...` をコピー

> ローカルで `copilot` CLI のセッションを使って動作確認するだけなら `COPILOT_GITHUB_TOKEN` は
> 省略可能です (パターン A の手順参照)。CI 等の非対話環境で AI 分析を回す場合は必須です。

### GitHub App 認証 (代替)

`GITHUB_TOKEN` の代わりに GitHub App の 3 点セットでも認証できます。多数の組織・リポジトリを
跨ぐ場合に有効です。3 つ揃っていれば installation token を自動発行します。

| 環境変数 | 説明 |
|---|---|
| `GITHUB_APP_ID` | App ID |
| `GITHUB_APP_PRIVATE_KEY` | App の秘密鍵 (PEM) |
| `GITHUB_APP_INSTALLATION_ID` | インストール ID |

---

## パターン A: ローカル

### 1. clone & install

```bash
git clone https://github.com/<your-org>/pr-weekly-report.git
cd pr-weekly-report
npm install
```

### 2. `config.toml` を編集

```toml
[general]
timezone = "Asia/Tokyo"

# 各エントリは "owner/name" または "owner/*"。
# "owner/*" は archived を除く owner 配下の全リポジトリに展開されます
# (トークンに権限があれば private も含む)。
[repositories]
include = [
  "your-org/your-repo",
  # "your-org/*",
]
```

詳しい設定項目は [設定 (`config.toml`)](#設定-configtoml) を参照。

### 3. 動作確認 (AI 抜き)

まずは AI 分析を抜いて (Copilot セッション不要) 動かします。

```bash
GITHUB_TOKEN=github_pat_... npm run report -- --skip-ai
```

成功すると以下が生成されます:

- `data/raw/<period>.json` — 取得した PR の生データ
- `data/analysis/<period>/*.{json,md}` — 各分析の出力
- `dist/reports/<period>.html` — 1 週分の HTML レポート
- `dist/index.html` — 全期間のインデックスページ

### 4. AI 分析込みで実行

GitHub Copilot にローカルでログインしてから `--skip-ai` を外します。

```bash
GITHUB_TOKEN=github_pat_... \
COPILOT_GITHUB_TOKEN=github_pat_... \
npm run report
```

### サンプルデータで試す

GitHub に問い合わせず試したい場合は同梱サンプル (`data/demo/2026-05-03.json`) を使えます。

```bash
npm run demo
```

### Explore も含めたローカル全ビルド

DWH ベースのフルスタック (Explore + ギャラリー) をローカルで組む場合:

```bash
rm -rf dist
GITHUB_TOKEN="$(gh auth token)" npx tsx src/cli/dwh-build.ts --config config.toml --dwh-dir /tmp/dwh
npm run explore:data -- --dwh-dir /tmp/dwh                                  # parquet → dist/data
npm run report:dwh -- --dwh-dir /tmp/dwh --reports-dir dist/reports --from 2026-04-01 --to 2026-05-18
npm run web:build                                                           # 一覧 SSG + Explore 島 + nav.js → dist/
```

開発サーバは `npm run web:dev` (`http://localhost:4321/`)。

---

## パターン B: GitHub Actions + ホスティング (推奨)

エンジン本体を **2 つの GitHub Action** として参照し、利用側 (consumer) リポジトリは
**設定と蓄積データだけ**を持ちます。

| Action | 種類 | 役割 |
|---|---|---|
| `your-org/pr-weekly-report@v1` | Docker コンテナ | PR 収集 → `data/dwh` (parquet) を増分更新 |
| `your-org/pr-weekly-report/site@v1` | composite | `data/dwh` から Explore + Reports サイトを `dist/` にビルド |

### テンプレートから始める (最短)

すぐ使えるテンプレートを [`template/`](template/) に用意しています — `config.toml` +
ワークフロー (collect → commit `data/dwh` → site build → Pages deploy) + README。

1. `template/` を新しいリポジトリにコピー (または GitHub の "template repository" にして *Use this template*)
2. `.github/workflows/dashboard.yml` の `__OWNER__/__REPO__` を参照するエンジンに置換:
   ```bash
   sed -i '' 's#__OWNER__/__REPO__#your-org/pr-weekly-report#g' .github/workflows/dashboard.yml
   # Linux (GNU sed) は空バックアップ引数不要: sed -i 's#...#...#g' ...
   ```
3. `config.toml` の `[repositories].include` を対象リポジトリに設定
4. **Settings > Secrets and variables > Actions** で `GH_INSIGHTS_TOKEN` を追加
   (read-only PAT。GitHub は `GITHUB_TOKEN` という名前の secret を禁じているため、
   ワークフロー側で `GITHUB_TOKEN` env にマップしています)
5. **Settings > Pages > Source** を **GitHub Actions** に
6. **Actions > PR Dashboard > Run workflow** で初回実行 (初回は `from` で過去分を backfill 可)

ダッシュボードは `https://<owner>.github.io/<repo>/` に公開されます。

### ホスティング先別の `base`

サイトビルド Action の `base` (Astro base path) をホスティングに合わせます。

| ホスティング | `base` |
|---|---|
| GitHub Pages (project page) | `/<repo>/` |
| 独自ドメイン / Cloudflare Pages | `/` |

Cloudflare 等に出す場合は、Pages deploy ステップの代わりにビルド済み `dist/` を
その static host に向けてください。

### 各 Action の要点

**データ収集 Action**
- **入力**: `config` (既定 `config.toml`) / `dwh-dir` (既定 `data/dwh`) / `from` (任意・過去分 backfill)
- **認証**: `GITHUB_TOKEN` を **step の `env:` で必ず渡す** (コンテナ Action は secret を自動注入しない)。
  GHES では `GITHUB_API_URL` / `GITHUB_GRAPHQL_URL` がランナーから自動で渡る
- 生成物の所有者をエントリポイントが workspace のユーザーに戻すため、後段の `git commit` /
  次回 `checkout` は権限エラーにならない
- **レート制限時**: 取得済み分を書き込んで success (exit 0) で終了し、stderr に reset 時刻を出す。
  次回実行で DWH カーソルが自動的に続きから再開する

**サイトビルド Action**
- **入力**: `dwh-dir` / `base` / `output-dir` (既定 `dist`) / `reports-config` (任意・指定すると
  frozen reports で gallery を生成) / `site` (任意・canonical URL)
- composite なので `${{ github.action_path }}` (= エンジンの checkout) で `npm ci` + astro ビルドを
  実行し `dist/` を consumer ワークスペースへ出力。Explore はランタイムで `/data/*.parquet` を読むため、
  データ更新とサイトビルドのカデンスを分けられる

### AI 分析を CI で回す

`COPILOT_GITHUB_TOKEN` secret を設定していれば AI 分析も CI 上で実行されます。未設定の場合は
自動的に `--skip-ai` にフォールバックし、AI 分析セクションは `skipped` になります。

> **GHCR プリビルドイメージについて**: v1 リリース (`.github/workflows/release.yml` が tag push で
> GHCR に publish) 後は、`action.yml` の `image: 'Dockerfile'` を
> `image: 'docker://ghcr.io/your-org/pr-weekly-report:1'` に切り替えると、consumer 側の毎 run の
> イメージビルドが消えて高速化します (現状は未リリースのため毎 run ビルド)。

---

## パターン C: セルフホスト (Docker)

Pages を使わず、収集からサイト配信まで自前サーバ / インスタンスで完結させる構成です。
**新しいアプリコードは不要**で、既存の収集イメージ + Node ビルド + 静的配信を組み合わせます。

> **トレードオフ**: GitHub Actions が無料で提供するホスト型 cron・Pages 配信・`GITHUB_API_URL`
> 自動注入・secret 管理を自前で背負います。TLS・死活監視・更新も自分持ちです。社内 GHES での
> インターネット非公開配信や、データを自社インフラから出したくない場合に選んでください。
> それ以外はパターン B を推奨します。

役割は 3 つに分かれます:

1. **収集** — 既存の `Dockerfile` (収集専用) を回し、`data/dwh` の parquet を更新
2. **サイトビルド** — `node:24` でリポジトリを bind-mount し `explore:data` → `report:dwh` →
   astro build。サイト用イメージは無いので Node イメージを使う
3. **配信** — nginx 等で `dist/` (parquet を含む) を配信

### docker-compose 例

```yaml
# docker-compose.yml — リポジトリを clone した中で使う
services:
  # 1. PR 収集 → data/dwh (parquet) を増分更新。cron から `run` する想定。
  collect:
    build: .                       # 収集専用イメージ (Dockerfile)
    environment:
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    volumes:
      - ./:/work
    working_dir: /work
    command: ["config.toml", "data/dwh"]   # 引数: <config> <dwh-dir> [<from>]

  # 2. DWH → dist/ をビルド。base は root 配信なら "/"。
  build:
    image: node:24-slim
    working_dir: /work
    volumes:
      - ./:/work
    environment:
      ASTRO_BASE: "/"
      ASTRO_SITE: "https://reports.example.com"   # canonical/OG 用 (任意)
    command:
      - bash
      - -c
      - |
        npm ci
        npm run explore:data -- --dwh-dir data/dwh
        npm run report:dwh -- --dwh-dir data/dwh --reports-dir dist/reports \
          --from 2026-04-01 --to "$(date -u +%F)"   # gallery 用 frozen reports (任意)
        npm run build:nav
        ./node_modules/.bin/astro build --root src/web   # web:build は base を固定するため astro 直叩き

  # 3. dist/ を配信。Explore はランタイムで /data/*.parquet を読むため dist/data も含めて配る。
  web:
    image: nginx:alpine
    volumes:
      - ./dist:/usr/share/nginx/html:ro
    ports:
      - "8080:80"
```

実行:

```bash
export GITHUB_TOKEN=github_pat_...
docker compose run --rm collect      # 収集 (data/dwh 更新)
docker compose run --rm build        # サイトビルド (dist/ 生成)
docker compose up -d web             # http://localhost:8080/ で配信
```

### スケジューリング

compose 単体に cron は無いため、ホスト cron 等で収集 + ビルドを定期実行します。

```cron
# 毎週月曜 00:00 に収集 → ビルド (web は up したまま新しい dist/ を配信)
0 0 * * 1  cd /path/to/pr-weekly-report && GITHUB_TOKEN=github_pat_... \
  docker compose run --rm collect && docker compose run --rm build
```

### 注意点

- **base の固定**: `npm run web:build` は base を `/pr-weekly-report` にハードコードしているため、
  セルフホスト (root 配信) では `ASTRO_BASE=/` を渡して `astro build` を直接叩く (上記 compose の通り)。
  サブパス配信なら `ASTRO_BASE=/subpath/` を合わせる
- **parquet の配信**: Explore はブラウザから `/<base>data/*.parquet` を読む。`explore:data` が
  `dist/data/` に置くので、`dist/` ごと配信していれば追加設定は不要
- **GHES**: `GITHUB_API_URL` / `GITHUB_GRAPHQL_URL` を `collect` の `environment` に明示する
  (Actions と違い自動注入されない)
- **レート制限 / 再開**: 収集はレート制限時に取得済み分を書いて exit 0 する。次回 `collect` 実行で
  DWH カーソルが自動的に続きから再開する (`data/dwh` ボリュームを永続化しておくこと)

---

## 設定 (`config.toml`)

設定はすべて TOML テーブル (`[セクション名]`) に属し、トップレベルに裸の key=value は置きません。
`[repositories]` のみ必須で、他テーブルは省略可。省略時はコード側のデフォルトが適用されます。

| セクション | キー | 説明 |
|---|---|---|
| `[general]` | `timezone` | 週境界を計算するタイムゾーン (例: `Asia/Tokyo`)。省略時は `UTC` |
| `[repositories]` | `include` | 対象リポジトリの配列。各要素は `"owner/name"` または `"owner/*"` (ワイルドカードは archived を除く owner 配下の全リポジトリに展開) |
| `[limits]` | `maxPrs` / `maxCommentsPerPr` / `maxReviewThreadsPerPr` / `maxFilesPerPr` / `maxCommitsPerPr` / `maxBodyLength` | 1 PR あたりの取得上限。GraphQL のページング負荷を抑える |
| `[bots]` | `patterns` | bot と見なす GitHub login の正規表現配列。大文字小文字は区別しない |
| `[ai]` | `model` | AI 分析で使う Copilot SDK のモデル ID。省略時は SDK のデフォルト |

`skills/` 配下の AI skill と `src/pipeline/stages/analyze.ts` の `COMPUTE_REGISTRY` に登録された
compute 分析は常に既定パラメータで実行されます。

利用可能な Copilot モデル ID は `copilot` CLI 内で `/model` を実行するか、Copilot SDK の
`client.listModels()` で確認できます。

## 環境変数

| 変数 | 説明 |
|---|---|
| `GITHUB_TOKEN` | Pull request の read-only 権限がある PAT |
| `COPILOT_GITHUB_TOKEN` | AI 分析専用の PAT (任意) |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` | GitHub App 認証 (PAT の代替。3 点セットで有効) |
| `LOOKBACK_DAYS` | 初回フルロードで遡る日数 (既定 `30`)。これより古い履歴は `dwh:build --from` で取得する |
| `GITHUB_GRAPHQL_URL` / `GITHUB_API_URL` | GitHub Enterprise Server 用。未設定なら github.com。GitHub Actions ランナーでは自動設定される |
| `ASTRO_BASE` / `ASTRO_SITE` | サイトの base path / canonical URL。セルフホストや独自ドメインで使う |

## CLI

| コマンド | 役割 |
|---|---|
| `npm run collect` | PR データ取得のみ。`data/raw/<period>.json` を書く |
| `npm run report` | fetch → analyze → render の全体パイプライン (orchestrate 系) |
| `npm run dwh:build -- [--config <path>] [--dwh-dir <dir>] [--from YYYY-MM-DD]` | PR を収集して DWH (parquet) を増分構築。`--from` で過去分を backfill |
| `npm run report:dwh -- [--reports-config <path>] [--from <d> --to <d>] [--dwh-dir <dir>] [--reports-dir <dir>]` | DWH から frozen reports + `index.json` を生成 |
| `npm run explore:data -- --dwh-dir <dir>` | DWH の parquet を `src/web/public/data` (→ `dist/data`) へ配置 |
| `npm run demo` | 同梱サンプル raw データ (`data/demo/`) でレポート生成 |

### 増分収集と backfill (`dwh:build`)

`dwh:build` の収集カーソルはコミット済み DWH の `updated_at` から自己復元する (別途の状態ファイル不要):

- **増分 (既定)**: 各 repo の `max(updated_at)` 以降のみ取得。初回は `LOOKBACK_DAYS` (既定 30 日) まで遡る。
- **backfill (`--from YYYY-MM-DD`)**: 各 repo の `min(updated_at)` を読み、**未カバーの古い範囲
  `[from, min]` だけ**取得する。指定日が既に収集済みの repo は skip。取り込みは PR 単位の冪等 upsert なので、範囲が重複しても安全。
- GitHub のレート制限に達したら、取得済み分を書き込んで停止し、リセット時刻と再実行を案内する
  (カーソルが次回自動で続きから再開する)。

### `npm run report` の主なフラグ

| フラグ | 説明 |
|---|---|
| `--config <path>` | `config.toml` の場所 |
| `--raw-dir <path>` | 生 PR データの出力先 |
| `--analysis-dir <path>` | 分析結果の出力先 |
| `--reports-dir <path>` | HTML レポートの出力先 |
| `--index <path>` | インデックス HTML の出力先 |
| `--skills <path>` | AI skill のルートディレクトリ |
| `--week YYYY-MM-DD` | 対象週に含まれる日付。指定週 (月曜始まり) を集計 |
| `--use-raw <path>` | 既存の raw snapshot を再利用し fetch をスキップ。analyze + render のみ走る |
| `--skip-ai` | AI skill を全部 `skipped` 扱いにする (Copilot 不要) |

## skill を追加して分析項目を追加する

1. `skills/<NN>_<id>/SKILL.md` を新規作成 (ディレクトリ名がそのまま分析 ID になる)。先頭の `NN_`
   プレフィックスで AI セクション内の表示順が決まる (`01_`, `02_`, ... 昇順)
2. YAML frontmatter の `name` はディレクトリ名と完全に一致させる (例: `name: 04_my-analysis`)。
   Copilot SDK はこの `name` でスキルを識別する
3. 本文に Markdown プロンプトを書く。**出力先頭の `## ...` セクション見出しはプロンプト本文に
   ハードコードする** (例: `先頭は必ず "## 議論があったPR" にする`)
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

## Web (Explore + Reports ギャラリー)

フロントは **Astro 6 + React islands** (`src/web`)。2 つのモードを共有の開閉サイドバーで行き来できます。

- **Reports ギャラリー** (`/`): `report:dwh` が出力する `dist/reports/index.json` から **ビルド時に SSG**。
  各カードは凍結レポート (`/reports/<id>.html`) へリンク。
- **Explore** (`/explore`): `client:only` の React 島。ブラウザ内 **DuckDB-WASM** が `dist/data/*.parquet`
  を直接クエリし、レポートと**同一のレンダラ・SQL**で DORA / レビュー相関 / PR タイムラインをライブ集計。
  期間プリセット (今週/過去1ヶ月/3ヶ月/1年) + カレンダー、repo/user の multiselect で絞り込み。
- **サイドバー**: アプリ面 (一覧/Explore) は Astro が SSR。凍結レポートには閲覧時に `nav.js` が
  オーバーレイ描画する (本文は自己完結のまま・常に最新ナビ)。

### スクリプト

| コマンド | 役割 |
|---|---|
| `npm run web:dev` | Astro 開発サーバ (base `/`、`http://localhost:4321/`) |
| `npm run web:build` | `nav.js` ビルド + `astro build` (本番 base `/pr-weekly-report`)。**base は固定**なので、別 base で焼くときは `ASTRO_BASE=... astro build --root src/web` を直接叩く |
| `npm run explore:data -- --dwh-dir <dir>` | DWH の parquet を `src/web/public/data` へ配置 |
| `npm run report:dwh -- --dwh-dir <dir> --reports-dir dist/reports --from <d> --to <d>` | 凍結レポート + `index.json` を生成 (`--index` は付けない: 一覧 HTML は Astro が生成) |

> **描画の更新 (デザイン変更)** は `report:dwh` を再実行すれば凍結レポートを現行レンダラで再生成できます
> (データ凍結 / 描画オンデマンド再生成)。サイドバーの更新は `nav.js` の再デプロイのみで反映され、
> レポート再生成は不要です。
