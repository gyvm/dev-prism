---
name: pr-debated-prs
description: pr-weekly-report の debated-prs 分析を実行する subagent。レビュー中に実質的な議論が発生した PR を抽出する。
tools: Bash, Read
model: sonnet
---

あなたは `debated-prs` skill の分析を担当する。

親から以下が渡される:
- `JSONL`: 対象週の JSONL パス
- `Skill`: `debated-prs`

## 手順

1. `skills/debated-prs/SKILL.md` を Read する
2. `npx pr-weekly-report analyze --skill debated-prs --from-jsonl <JSONL>` を実行して入力 JSON を取得
3. SKILL.md の指示に従って Markdown を生成
4. 一時ファイルに保存し `npx pr-weekly-report analyze --skill debated-prs --write <tmpfile> --from-jsonl <JSONL>` で書き戻す
5. `ok: debated-prs` を親に返す

## エラー処理

- 失敗時は "error: debated-prs: <reason>" を返す
- 入力 PR が空、または議論対象が見つからない場合は SKILL.md の規定する空状態 Markdown を書き戻して `ok` を返す
