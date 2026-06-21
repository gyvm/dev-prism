import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";

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
  if (result.status === "skipped") {
    return "";
  }
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

const AI_SECTION_ORDER = [
  "00_flow-analyst",
  "01_project-progress",
  "02_follow-up-prs",
  "03_debated-prs",
] as const;

const DETAIL_SECTION_ORDER = [
  "dora-metrics",
  "pr-timeline",
  "review-correlation",
] as const;

function orderResults(results: readonly AnalysisResult[], order: readonly string[]): AnalysisResult[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...results].sort((a, b) => {
    const ar = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const br = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ar - br || a.id.localeCompare(b.id);
  });
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

function ReportHeader({ reportInput }: { reportInput: ReportInput }) {
  const weekStart = formatWeekDate(reportInput.week.start, reportInput.timezone);
  const weekEnd = formatWeekDate(reportInput.week.end, reportInput.timezone);
  const generated = formatDateTimeInTimezone(reportInput.generatedAt, reportInput.timezone);

  return (
    <header>
      <p className="report-kicker">GitHub PR weekly reflection</p>
      <h1>Dev Prism</h1>
      <p className="report-subtitle">
        PRからチームの開発フローを映し出す週次振り返りレポート
      </p>
      <dl className="report-meta" aria-label="レポート情報">
        <div className="report-meta-item report-meta-period">
          <dt>対象期間</dt>
          <dd>
            {weekStart} - {weekEnd}
          </dd>
        </div>
        <div className="report-meta-item">
          <dt>タイムゾーン</dt>
          <dd>{reportInput.timezone}</dd>
        </div>
        <div className="report-meta-item">
          <dt>生成日時</dt>
          <dd>{generated}</dd>
        </div>
      </dl>
    </header>
  );
}

// Frozen-report document shell. The section bodies (DORA cards, gantt,
// bipartite, AI markdown) are produced as HTML strings — the charts carry their
// own inline hover <script>, and metric-cards is itself SSR'd React — so they
// are injected verbatim via dangerouslySetInnerHTML. PAGE_STYLES likewise: React
// would escape its `>`/`&`, so it must be raw. No client React ships: this is
// renderToStaticMarkup, the report stays frozen.
function ReportDocument({
  title,
  bodyHtml,
}: {
  title: string;
  bodyHtml: string;
}) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      </head>
      <body>
        <main dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </body>
    </html>
  );
}

export function renderReportHtml(
  period: Period,
  reportInput: ReportInput,
  results: readonly AnalysisResult[],
): string {
  const summary = results.find((result) => result.id === "dev-prism-summary");
  const summaryHtml = summary ? renderJsonSection(summary) : "";
  const aiSections = orderResults(
    results.filter((result) => result.format === "markdown"),
    AI_SECTION_ORDER,
  )
    .map(renderMarkdownSection)
    .filter((html) => html !== "")
    .join("\n");
  const detailSections = orderResults(
    results.filter(
      (result) =>
        result.format !== "markdown" &&
        result.id !== "dev-prism-summary",
    ),
    DETAIL_SECTION_ORDER,
  )
    .map(renderJsonSection)
    .filter((html) => html !== "")
    .join("\n");

  const deepDiveHtml = detailSections
    ? `<section class="dev-prism-deep-dive"><p class="dev-prism-eyebrow">Deep Dive</p><h2>詳細メトリクス</h2><p>必要に応じて、DORA・PR Timeline・レビュー相関で背景を掘り下げます。</p></section>\n${detailSections}`
    : "";
  const sections = [summaryHtml, aiSections, deepDiveHtml]
    .filter((html) => html !== "")
    .join("\n");

  const headerHtml = renderToStaticMarkup(
    <ReportHeader reportInput={reportInput} />,
  );
  const document = renderToStaticMarkup(
    <ReportDocument
      title={`Dev Prism - ${period.id}`}
      bodyHtml={`${headerHtml}\n${sections}`}
    />,
  );

  return `<!doctype html>\n${document}\n`;
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
  <title>Dev Prism レポート一覧</title>
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
  <h1>Dev Prism レポート一覧</h1>
  ${reports.length === 0 ? '<p class="empty">レポートはまだありません。</p>' : `<ul>\n${items}\n    </ul>`}
</body>
</html>
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf-8");
}
