import type { DoraComparison, DoraDelta } from "../../analyses/dora-metrics/view-model.js";
import type { DoraMetrics } from "../../shared/types.js";
import { formatHours } from "../../renderers/utils.js";

// DORA cards with previous-period comparison (1-1b). A new component, not an
// extension of renderers/metric-cards.tsx: that component is shared with the
// frozen report (SSR, no delta), so it stays untouched (docs/explore-screens.md
// "設計上の決定事項"). This one reuses its class names (.metric-grid,
// .metric-card, the four `metric-card-<tone>` accent colors) so both paths
// still read as the same visual language, and adds delta/`n` rows that live
// only in EXPLORE_STYLES.

type CardTone = "deploy" | "lead-time" | "failure-rate" | "mttr";
type DeltaTone = "good" | "bad" | "neutral";

type CardDelta = Readonly<{ arrow: string; text: string; tone: DeltaTone }>;

type Card = Readonly<{
  tone: CardTone;
  label: string;
  value: string;
  /** Secondary "n=X" line. Only used where the headline value does not already
   *  spell the denominator out (failure-rate/MTTR bake `n` into `value` itself
   *  because the two also need to distinguish "no data" from "n merges, 0
   *  reverts" — see docs/explore-screens.md データと数値の方針). */
  n: string | null;
  delta: CardDelta | null;
}>;

/**
 * `value > 0` reads as an increase, `value < 0` as a decrease. Whether that is
 * good or bad depends on the metric: more deploys is good, less lead time /
 * failure rate / MTTR is good. Direction is reported regardless — only the
 * color (`tone`) encodes good/bad.
 */
function buildDelta(
  value: number | null,
  goodDirection: "increase" | "decrease",
  formatAbs: (abs: number) => string,
): CardDelta | null {
  if (value === null) return null;
  const arrow = value > 0 ? "↗" : value < 0 ? "↘" : "→";
  const increased = value > 0;
  const isGoodDirection = goodDirection === "increase" ? increased : !increased;
  const tone: DeltaTone = value === 0 ? "neutral" : isGoodDirection ? "good" : "bad";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return { arrow, text: `${sign}${formatAbs(Math.abs(value))}`, tone };
}

function formatCountAbs(abs: number): string {
  return `${abs}件`;
}

function formatHoursAbs(abs: number): string {
  if (abs < 1) return `${Math.round(abs * 60)}分`;
  return `${Math.round(abs * 10) / 10}h`;
}

function formatPercentPointAbs(abs: number): string {
  return `${abs.toFixed(1)}pt`;
}

/** Denominator for the failure-rate/MTTR cards: the merged-PR count both
 *  metrics are computed over (dora-metrics/query.ts `deploys`). */
function mergedCount(current: DoraMetrics): number {
  return current.deploymentFrequency;
}

function formatChangeFailureRate(current: DoraMetrics): string {
  if (current.changeFailureRatePercent === null) return "データなし";
  if (current.changeFailureRatePercent === 0) {
    return `Revert 0件(n=${mergedCount(current)})`;
  }
  return `${current.changeFailureRatePercent.toFixed(1)}%(n=${mergedCount(current)})`;
}

function formatMttr(current: DoraMetrics): string {
  if (mergedCount(current) === 0) return "データなし";
  if (current.mttrHours === null) return `Revert 0件(n=${mergedCount(current)})`;
  return formatHours(current.mttrHours);
}

function buildCards(comparison: DoraComparison): readonly Card[] {
  const { current, delta } = comparison;
  const d = (key: keyof DoraDelta) => (delta === null ? null : delta[key]);

  return [
    {
      tone: "deploy",
      label: "マージ数",
      value: `${current.deploymentFrequency}件`,
      n: null,
      delta: buildDelta(d("deploymentFrequency"), "increase", formatCountAbs),
    },
    {
      tone: "lead-time",
      label: "変更のリードタイム",
      value: formatHours(current.leadTimeForChangesHours),
      n: mergedCount(current) > 0 ? `n=${mergedCount(current)}` : null,
      delta: buildDelta(d("leadTimeForChangesHours"), "decrease", formatHoursAbs),
    },
    {
      tone: "failure-rate",
      label: "変更失敗率",
      value: formatChangeFailureRate(current),
      n: null,
      delta: buildDelta(d("changeFailureRatePercent"), "decrease", formatPercentPointAbs),
    },
    {
      tone: "mttr",
      label: "MTTR",
      value: formatMttr(current),
      n: null,
      delta: buildDelta(d("mttrHours"), "decrease", formatHoursAbs),
    },
  ];
}

export default function DoraComparisonCards({ comparison }: { comparison: DoraComparison }) {
  const cards = buildCards(comparison);

  return (
    <section>
      <h2>DORAメトリクス</h2>
      <div className="metric-grid">
        {cards.map((card) => (
          <article key={card.tone} className={`metric-card metric-card-${card.tone}`}>
            <span className="metric-label">{card.label}</span>
            <strong>{card.value}</strong>
            {card.n && <span className="metric-card-n">{card.n}</span>}
            {card.delta && (
              <p className={`metric-card-delta metric-card-delta-${card.delta.tone}`}>
                <span aria-hidden="true">{card.delta.arrow}</span> {card.delta.text}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
