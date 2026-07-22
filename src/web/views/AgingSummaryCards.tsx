import type { CSSProperties } from "react";

import type { AgingSummary } from "../../analyses/aging/view-model.js";

// 4-1: three headline numbers for the open-PR backlog. Reuses MetricCards'
// `.metric-card`/`.metric-grid` classes (src/renderers/metric-cards.tsx,
// PAGE_STYLES) rather than inventing new ones, so the aging page reads as the
// same visual language as the DORA cards on the flow page.

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type Card = Readonly<{
  key: string;
  tone: string;
  label: string;
  value: string;
  description: string;
}>;

function formatOldestAge(days: number | null): string {
  if (days === null) return "—";
  return `${Math.round(days * 10) / 10}日`;
}

function cards(summary: AgingSummary): readonly Card[] {
  return [
    {
      key: "open",
      tone: "var(--accent-cyan)",
      label: "オープン PR 数",
      value: `${summary.openCount}`,
      description: "現在オープン中のPR数。マージ・クローズ済みは含みません。",
    },
    {
      key: "awaiting-review",
      tone: "var(--attention)",
      label: "レビュー待ち数",
      value: `${summary.awaitingReviewCount}`,
      description:
        "ドラフト・変更依頼中・アプルーブ済みのいずれでもない、レビュー着手待ちのPR数。",
    },
    {
      key: "oldest",
      tone: "var(--danger)",
      label: "最古 PR の経過日数",
      value: formatOldestAge(summary.oldestAgeDays),
      description:
        "オープンPRのうち作成からの経過時間が最も長いものの日数。放置の上限を示します。",
    },
  ];
}

export default function AgingSummaryCards({ summary }: { summary: AgingSummary }) {
  return (
    <section>
      <h2>滞留サマリ</h2>
      <div className="metric-grid">
        {cards(summary).map((card) => {
          const tooltipId = `aging-summary-tooltip-${card.key}`;
          const style: StyleWithVars = { "--metric-tone": card.tone };
          return (
            <article
              key={card.key}
              className="metric-card"
              style={style}
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
