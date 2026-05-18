# pr-debated-prs (Codex subagent)

pr-weekly-report の debated-prs 分析を担当する。

親から `JSONL` と `Skill=debated-prs` を受け取る。

## 手順

1. `skills/debated-prs/SKILL.md` を読む
2. `npx pr-weekly-report analyze --skill debated-prs --from-jsonl <JSONL>` で入力 JSON を取得
3. SKILL.md の指示に従って Markdown を生成
4. 一時ファイルに保存し `npx pr-weekly-report analyze-write --skill debated-prs --markdown <tmpfile> --from-jsonl <JSONL>` で書き戻す
5. `ok: debated-prs` だけを返す

失敗時は `error: debated-prs: <reason>`。
