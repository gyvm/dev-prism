import MarkdownIt from "markdown-it";

// Isolated from utils.ts so the browser (Explore) bundle, which only needs the
// pure helpers in utils.ts, does not pull in markdown-it.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

export function markdownToHtml(markdown: string): string {
  return md.render(markdown);
}
