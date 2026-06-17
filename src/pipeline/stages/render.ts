import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { renderAnalysis } from "../../renderers/index.js";
import { escapeHtml } from "../../renderers/utils.js";
import { markdownToHtml } from "../../renderers/markdown.js";
import { PAGE_STYLES } from "../../renderers/page-styles.js";
import type { ReportInput } from "../../report/types.js";
import type { Period } from "../period.js";
import type { AnalysisResult } from "../types.js";

export type RenderOptions = Readonly<{
  outputPath?: string;
  reportInput: ReportInput;
}>;

export type RenderResult = Readonly<{
  htmlPath: string;
}>;

function renderMarkdownSection(result: AnalysisResult): string {
  if (result.status === "ok") {
    const markdown = typeof result.data === "string" ? result.data : "";
    return `<section class="ai-markdown">${markdownToHtml(markdown)}</section>`;
  }
  const reason = result.reason ?? `status: ${result.status}`;
  return `<section>
        <h2>${escapeHtml(result.id)}</h2>
        <p class="empty">AI analysis unavailable: ${escapeHtml(reason)}</p>
      </section>`;
}

function renderJsonSection(result: AnalysisResult): string {
  if (result.status !== "ok" || !result.renderer) {
    return "";
  }
  return renderAnalysis(result.renderer, result.data);
}

function isUtcDayBoundary(value: string): boolean {
  const date = new Date(value);
  const isStartOfDay =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  const isEndOfDay =
    date.getUTCHours() === 23 &&
    date.getUTCMinutes() === 59 &&
    date.getUTCSeconds() === 59 &&
    date.getUTCMilliseconds() === 999;
  return isStartOfDay || isEndOfDay;
}

function formatDateInTimezone(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatWeekDate(value: string, timezone: string): string {
  const displayTimezone = isUtcDayBoundary(value) ? "UTC" : timezone;
  return formatDateInTimezone(value, displayTimezone);
}

function formatDateTimeInTimezone(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(value));
}

function renderReportMeta(reportInput: ReportInput): string {
  const weekStart = formatWeekDate(reportInput.week.start, reportInput.timezone);
  const weekEnd = formatWeekDate(reportInput.week.end, reportInput.timezone);
  const generated = formatDateTimeInTimezone(reportInput.generatedAt, reportInput.timezone);

  return `<dl class="report-meta" aria-label="レポート情報">
        <div class="report-meta-item report-meta-period">
          <dt>対象期間</dt>
          <dd>${escapeHtml(weekStart)} - ${escapeHtml(weekEnd)}</dd>
        </div>
        <div class="report-meta-item">
          <dt>タイムゾーン</dt>
          <dd>${escapeHtml(reportInput.timezone)}</dd>
        </div>
        <div class="report-meta-item">
          <dt>生成日時</dt>
          <dd>${escapeHtml(generated)}</dd>
        </div>
      </dl>`;
}


export function renderReportHtml(
  period: Period,
  reportInput: ReportInput,
  results: readonly AnalysisResult[],
): string {
  const sections = results
    .map((result) =>
      result.format === "markdown"
        ? renderMarkdownSection(result)
        : renderJsonSection(result),
    )
    .filter((html) => html !== "")
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub PR 週次レポート - ${escapeHtml(period.id)}</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <main>
    <header>
      <h1>GitHub PR 週次レポート</h1>
      ${renderReportMeta(reportInput)}
    </header>
    ${sections}
  </main>
</body>
</html>
`;
}

export async function renderStage(
  period: Period,
  reportInput: ReportInput,
  results: readonly AnalysisResult[],
  options: RenderOptions = { reportInput },
): Promise<RenderResult> {
  const htmlPath = resolve(
    options.outputPath ?? join("dist", "reports", `${period.id}.html`),
  );
  const html = renderReportHtml(period, reportInput, results);
  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html, "utf-8");
  return { htmlPath };
}

export async function buildIndexHtml(
  reportsDir: string,
  outputPath: string,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(reportsDir);
  } catch {
    entries = [];
  }
  const reports = entries
    .filter((name) => name.endsWith(".html"))
    .sort()
    .reverse();

  const items = reports
    .map((name) => {
      const id = name.replace(/\.html$/, "");
      return `      <li><a href="reports/${escapeHtml(name)}">${escapeHtml(id)}</a></li>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>GitHub PR 週次レポート一覧</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #172026; }
    h1 { font-size: 24px; }
    ul { list-style: none; padding: 0; }
    li { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    a { color: #246bfe; text-decoration: none; font-size: 16px; }
    a:hover { text-decoration: underline; }
    .empty { color: #64707d; }
  </style>
</head>
<body>
  <h1>GitHub PR 週次レポート一覧</h1>
  ${reports.length === 0 ? '<p class="empty">レポートはまだありません。</p>' : `<ul>\n${items}\n    </ul>`}
</body>
</html>
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf-8");
}
