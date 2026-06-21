import { renderToStaticMarkup } from "react-dom/server";

import type { DoraMetrics } from "../shared/types.js";
import { formatHours } from "./utils.js";

type CardTone = "deploy" | "lead-time" | "failure-rate" | "mttr";

type Card = Readonly<{
  label: string;
  value: string;
  description: string;
  tone: CardTone;
}>;

function cards(dora: DoraMetrics): readonly Card[] {
  return [
    {
      label: "マージ数",
      value: `${dora.deploymentFrequency}`,
      description:
        "対象週にマージされたPR数。リリース構成は組織ごとに異なるため、デプロイ頻度の代理としてマージ数を表示します。未マージPRは含めません。",
      tone: "deploy",
    },
    {
      label: "変更のリードタイム",
      value: formatHours(dora.leadTimeForChangesHours),
      description:
        "PR作成からマージまでの時間の中央値。未マージPRは含めません。",
      tone: "lead-time",
    },
    {
      label: "変更失敗率",
      value:
        dora.changeFailureRatePercent === null
          ? "N/A"
          : `${dora.changeFailureRatePercent.toFixed(1)}%`,
      description:
        "タイトルが Revert \"…\" で始まるPR（巻き戻し）の数 ÷ 週内マージPR数。ラベル運用に依存せず、Revertタイトルで失敗修正を判定しています。",
      tone: "failure-rate",
    },
    {
      label: "MTTR",
      value: formatHours(dora.mttrHours),
      description:
        "タイトルが Revert \"…\" で始まるPR（巻き戻し）の、作成からマージまでの平均時間。該当PRがない場合は N/A です。",
      tone: "mttr",
    },
  ];
}

/**
 * DORA metric cards. A shared SSR component: the Node CLI renders it into frozen
 * reports (via {@link renderMetricCards}) and Explore renders the same component
 * in the browser, so the two surfaces cannot drift. Tooltips are CSS-only hover
 * (no client JS) — see PAGE_STYLES `.metric-card-tooltip`.
 */
export function MetricCards({ dora }: { dora: DoraMetrics }) {
  return (
    <section>
      <h2>DORAメトリクス</h2>
      <div className="metric-grid">
        {cards(dora).map((card) => {
          const tooltipId = `metric-card-tooltip-${card.tone}`;
          return (
            <article
              key={card.tone}
              className={`metric-card metric-card-${card.tone}`}
              tabIndex={0}
              aria-describedby={tooltipId}
            >
              <span className="metric-label">{card.label}</span>
              <strong>{card.value}</strong>
              <p className="metric-card-tooltip" id={tooltipId} role="tooltip">
                {card.description}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** String entrypoint for the Node CLI report path (renderers/index.ts). */
export function renderMetricCards(data: unknown): string {
  return renderToStaticMarkup(<MetricCards dora={data as DoraMetrics} />);
}
