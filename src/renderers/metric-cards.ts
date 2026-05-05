import type { DoraMetrics } from "../shared/types.js";
import { escapeHtml, formatHours } from "./utils.js";

export function renderMetricCards(data: unknown): string {
  const dora = data as DoraMetrics;
  const cards: Array<{
    label: string;
    value: string;
    description: string;
    tone: "deploy" | "lead-time" | "failure-rate" | "mttr";
  }> = [
    {
      label: "デプロイ頻度",
      value: `${dora.deploymentFrequency}`,
      description: "対象週にマージされたPR数。未マージPRは含めません。",
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
        "hotfix / revert / incident ラベル付きでマージされたPR数 ÷ 週内マージPR数。障害を直接計測せず、ラベルで失敗修正を判定しています。",
      tone: "failure-rate",
    },
    {
      label: "MTTR",
      value: formatHours(dora.mttrHours),
      description:
        "hotfix / revert / incident ラベル付きでマージされたPRの、作成からマージまでの平均時間。該当PRがない場合は N/A です。",
      tone: "mttr",
    },
  ];

  return `<section>
    <h2>DORAメトリクス</h2>
    <div class="metric-grid">
      ${cards
        .map((card) => {
          const tooltipId = `metric-card-tooltip-${card.tone}`;
          return `<article class="metric-card metric-card-${card.tone}" tabindex="0" aria-describedby="${tooltipId}">
            <span class="metric-label">${escapeHtml(card.label)}</span>
            <strong>${escapeHtml(card.value)}</strong>
            <p class="metric-card-tooltip" id="${tooltipId}" role="tooltip">${escapeHtml(card.description)}</p>
          </article>`;
        })
        .join("")}
    </div>
  </section>`;
}
