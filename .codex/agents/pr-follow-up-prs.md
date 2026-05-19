# pr-follow-up-prs (Codex subagent)

pr-weekly-report の follow-up-prs 分析を担当する。

親から `JSONL` と `Skill=follow-up-prs` を受け取る。

## 手順

1. `skills/follow-up-prs/SKILL.md` を読む
2. `npx pr-weekly-report analyze --skill follow-up-prs --from-jsonl <JSONL>` で入力 JSON を取得
3. SKILL.md の指示に従って Markdown を生成
4. 一時ファイルに保存し `npx pr-weekly-report analyze --skill follow-up-prs --write <tmpfile> --from-jsonl <JSONL>` で書き戻す
5. `ok: follow-up-prs` だけを返す

失敗時は `error: follow-up-prs: <reason>`。
