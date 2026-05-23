---
description: 週次 GitHub PR レポートを生成する (fetch → AI 分析 → HTML)
argument-hint: "[YYYY-MM-DD]"
allowed-tools: Bash, Task
---

# /pr-weekly-report

`$ARGUMENTS` に渡された日付 (YYYY-MM-DD) を含む週、または未指定なら直近の完了週を対象に、PR データを集めて AI 分析を行い、静的 HTML レポートを生成する。

## 前提

- `GITHUB_TOKEN` 環境変数が PR 読み取り権限のある PAT を指していること
- `pr-weekly-report` CLI が `npx pr-weekly-report` で動くこと (本リポジトリ内なら `npm install` 済みであること)
- 対象リポジトリは `--repositories "owner/name"` で渡す。省略時はカレントの git remote (origin) から自動推定される。複数や org 全体を見たい場合は `"owner/*"` やスペース区切りで指定する

## 手順

以下を **順番に** 実行する。途中で失敗したら停止してユーザーに報告する。

### 1. データ取得 (fetch)

`$ARGUMENTS` が空でなければ `--week $ARGUMENTS` を付ける。対象リポジトリを明示したい場合は `--repositories "owner/*"` を併せて付ける (省略時は git remote から推定)。

```bash
WEEK_ARG=""
if [ -n "$ARGUMENTS" ]; then WEEK_ARG="--week $ARGUMENTS"; fi
npx pr-weekly-report fetch $WEEK_ARG
```

stdout の末尾に出力された JSONL パスを覚えておく (以下 `<JSONL>`)。

### 2. AI 分析対象 skill の発見

```bash
npx pr-weekly-report list-skills
```

出力された skill ID 一覧 (1行1 ID) を取得する。

### 3. 各 skill を subagent で並列分析

skill ID ごとに、対応する subagent (`pr-<skill-id>`) を **1 つのメッセージ内で同時に** Task ツールで発火する。並列に Task を呼ぶことが重要 (順次呼ばない)。

各 subagent に渡すプロンプト:

```
JSONL: <JSONL>
Skill: <skill-id>

このスキルの分析を担当してください。subagent の指示に従って実行し、完了したら "ok: <skill-id>" だけ返してください。
```

全 subagent の完了を待つ。

### 4. HTML レンダリング

```bash
npx pr-weekly-report render --from-jsonl <JSONL>
```

stdout に出力された HTML パス・JSONL パス・manifest パス・index パスをユーザーに報告する。

## 出力

- `dist/reports/<period>.html` — 当該週のレポート
- `dist/reports/<period>.jsonl` — 生データ (取得 PR + 分析結果)
- `dist/reports/reports.json` — 全週マニフェスト
- `dist/index.html` — 一覧ページ

## エラーハンドリング

- fetch 失敗: 対象リポジトリ (`--repositories` または git remote) と `GITHUB_TOKEN` の確認をユーザーに促す
- subagent 失敗: どの skill が失敗したかを明示してユーザーに報告。他の skill 分析と HTML は可能な範囲で続行
- render 失敗: JSONL が壊れている可能性。`<JSONL>` パスをユーザーに伝える
