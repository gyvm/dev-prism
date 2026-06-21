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
import { AI_REGISTRY } from "../../analyses/ai/registry.js";

export type RenderOptions = Readonly<{
  outputPath?: string;
  reportInput: ReportInput;
}>;

export type RenderResult = Readonly<{
  htmlPath: string;
}>;

function renderJsonSection(result: AnalysisResult): string {
  if (result.status !== "ok" || !result.renderer) {
    return "";
  }
  return renderAnalysis(result.renderer, result.data);
}

// The prompt body may still open with its own `## …` heading; render owns the
// section title now (ADR 0002 §5), so strip a single leading markdown H2 and
// apply the fixed AI_REGISTRY title instead.
function stripLeadingH2(markdown: string): string {
  // Strip a single leading H2 only — the `(?!#)` keeps a leading H3 intact.
  return markdown.replace(/^\s*##(?!#)[^\n]*\n+/, "");
}

function renderAiSection(result: AnalysisResult, title: string): string {
  if (result.status === "skipped") {
    return "";
  }
  const heading = `<h2 class="ai-section-title">${escapeHtml(title)}</h2>`;
  if (result.status === "ok") {
    const markdown = typeof result.data === "string" ? result.data : "";
    return `<section class="ai-markdown">${heading}${markdownToHtml(stripLeadingH2(markdown))}</section>`;
  }
  const reason = result.reason ?? `status: ${result.status}`;
  return `<section class="ai-markdown">${heading}<p class="empty">AI analysis unavailable: ${escapeHtml(reason)}</p></section>`;
}

// A report band: an intro card (eyebrow + render-owned title + lead-in) followed
// by its constituent analysis cards. The catalog (registries) declares what
// exists; THIS is the single source of section ORDER (ADR 0002 §4). Empty bands
// (all blocks absent — e.g. the AI-less DWH path) are dropped.
function renderBand(
  eyebrow: string,
  title: string,
  lead: string,
  blocks: readonly string[],
): string {
  const body = blocks.filter((html) => html !== "").join("\n");
  if (body === "") {
    return "";
  }
  const intro = `<section class="report-band"><p class="dev-prism-eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(lead)}</p></section>`;
  return `${intro}\n${body}`;
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
  const byId = new Map(results.map((result) => [result.id, result]));
  const compute = (id: string): string => {
    const result = byId.get(id);
    return result ? renderJsonSection(result) : "";
  };
  const ai = (id: string): string => {
    const result = byId.get(id);
    if (!result) return "";
    return renderAiSection(result, AI_REGISTRY[id]?.title ?? id);
  };

  // Section order lives here (ADR 0001 §1, ADR 0002 §4): 数字 → 理由 → 会話.
  const metricsBand = renderBand(
    "Metrics",
    "開発メトリクス",
    "今週の流れを数値で掴み、その数字に効いたPRまで降りていきます。先頭の数値はそのまま上司への報告にコピーできます。",
    [compute("dora-metrics"), compute("pr-timeline"), ai("flow-analyst")],
  );
  const summaryBand = renderBand(
    "Summary",
    "開発内容の要約",
    "今週は何が動いたか、拾っておきたい貢献、来週に持ち越す確認事項を振り返ります。",
    [
      ai("project-progress"),
      compute("dev-prism-summary"),
      ai("follow-up-prs"),
      ai("debated-prs"),
    ],
  );
  const reviewBand = renderBand(
    "Review",
    "PRレビュー",
    "レビューの偏りを見て、特定の人に負荷が寄っていないかを確認します。",
    [compute("review-correlation"), ai("review-balance")],
  );
  const sections = [metricsBand, summaryBand, reviewBand]
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
