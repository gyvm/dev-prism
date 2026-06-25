import { PROMPTS } from "../../prompts/generated.js";

// Explicit catalog of AI analyses (ADR 0002 §3). Replaces filesystem skill
// discovery: the set is fixed and built-in, not user-extensible. The map only
// declares WHAT exists; the report's section ORDER lives in render.tsx (ADR
// 0002 §4). `title` is the fixed section heading the renderer owns (ADR 0002 §5);
// `prompt` is the embedded body from src/prompts/<id>.md.

export type AiEntry = Readonly<{
  title: string;
  prompt: string;
}>;

function requirePrompt(id: string): string {
  const prompt = PROMPTS[id];
  if (prompt === undefined) {
    throw new Error(
      `prompt "${id}" missing from src/prompts/generated.ts — run \`npm run gen:prompts\``,
    );
  }
  return prompt;
}

export const AI_REGISTRY: Readonly<Record<string, AiEntry>> = {
  "flow-analyst": {
    title: "その数字に効いたPR",
    prompt: requirePrompt("flow-analyst"),
  },
  "project-progress": {
    title: "全体進捗",
    prompt: requirePrompt("project-progress"),
  },
  "follow-up-prs": {
    title: "フォローアップが必要なPR",
    prompt: requirePrompt("follow-up-prs"),
  },
  "review-balance": {
    title: "レビューバランス",
    prompt: requirePrompt("review-balance"),
  },
};
