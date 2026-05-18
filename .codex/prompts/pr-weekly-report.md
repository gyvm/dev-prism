# /pr-weekly-report

Codex slash command。週次 GitHub PR レポートを生成する (fetch → AI 分析 → HTML)。

引数として YYYY-MM-DD を受け取る。未指定なら直近の完了週。

## 前提

- カレントディレクトリに `config.toml` がある
- `GITHUB_TOKEN` 環境変数が PR 読み取り権限のある PAT を指している
- `npx pr-weekly-report` が動く

## 手順

1. **fetch**: `npx pr-weekly-report fetch [--week <YYYY-MM-DD>]` を実行。stdout の JSONL パスを記録 (`<JSONL>`)
2. **list-skills**: `npx pr-weekly-report list-skills` で skill ID 一覧を取得
3. **並列分析**: 各 skill ID について Codex subagent `pr-<skill-id>` を **同時に** 起動。各 subagent に `JSONL=<JSONL>` と `Skill=<id>` を渡す
4. **render**: 全 subagent 完了後 `npx pr-weekly-report render --from-jsonl <JSONL>` を実行
5. 出力された HTML / JSONL / manifest / index のパスをユーザーに報告

## エラー処理

- fetch 失敗: config.toml と PAT を確認
- subagent 失敗: 失敗 skill を明示。HTML 生成は可能な範囲で続行
- render 失敗: JSONL パスを伝える
