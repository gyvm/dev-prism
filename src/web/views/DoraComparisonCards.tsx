import type { DoraComparison, DoraDelta } from "../../analyses/dora-metrics/view-model.js";
import type { DoraMetrics } from "../../shared/types.js";
import { formatHours } from "../../renderers/utils.js";
import { type Readout, absent, measured, NO_MERGED_PRS } from "./readout.js";

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
  /** Secondary line under the headline. Carries the denominator, and for
   *  failure-rate/MTTR the "0 reverts" vs "no data" distinction those two need
   *  (docs/explore-screens.md データと数値の方針). It lives here rather than in
   *  `value` because `value` is a 28px display slot: a sentence in it wraps to
   *  two lines and breaks the four cards' shared height. */
  n: string | null;
  /** True when `value` is a placeholder ("—") rather than a measurement. The
   *  card keeps its category accent on the top border, but the headline drops
   *  to neutral: "Revert 0件" printed in danger red (or MTTR's success green)
   *  reads as a verdict on a number that was never measured. */
  muted: boolean;
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

function formatPercentPointAbs(abs: number): string {
  return `${abs.toFixed(1)}pt`;
}

/** Denominator for the failure-rate/MTTR cards: the merged-PR count both
 *  metrics are computed over (dora-metrics/query.ts `deploys`). */
function mergedCount(current: DoraMetrics): number {
  return current.deploymentFrequency;
}

/**
 * Lead time, failure rate and MTTR are all undefined for the same reason — the
 * period merged nothing — so all three say so in the same words. Previously
 * this card printed formatHours()'s raw "N/A" in full accent color while the
 * two beside it were already showing a muted "—", which made one empty period
 * look like three different situations.
 */
function leadTimeReadout(current: DoraMetrics): Readout {
  const merged = mergedCount(current);
  if (merged === 0) return absent(NO_MERGED_PRS);
  if (current.leadTimeForChangesHours === null) return absent(`計測不能 / n=${merged}`);
  return measured(formatHours(current.leadTimeForChangesHours), `n=${merged}`);
}

function changeFailureRateReadout(current: DoraMetrics): Readout {
  const merged = mergedCount(current);
  // null only ever means `deploys === 0` (dora-metrics/query.ts) — the same
  // empty period the lead-time card reports, hence the same wording.
  if (current.changeFailureRatePercent === null) return absent(NO_MERGED_PRS);
  if (current.changeFailureRatePercent === 0) return absent(`Revert 0件 / n=${merged}`);
  return measured(`${current.changeFailureRatePercent.toFixed(1)}%`, `n=${merged}`);
}

function mttrReadout(current: DoraMetrics): Readout {
  const merged = mergedCount(current);
  if (merged === 0) return absent(NO_MERGED_PRS);
  if (current.mttrHours === null) return absent(`Revert 0件 / n=${merged}`);
  return measured(formatHours(current.mttrHours), `n=${merged}`);
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
      muted: false,
      delta: buildDelta(d("deploymentFrequency"), "increase", formatCountAbs),
    },
    {
      tone: "lead-time",
      label: "変更のリードタイム",
      ...leadTimeReadout(current),
      // formatHours, not a local copy: the delta must round the same way as the
      // headline value directly above it.
      delta: buildDelta(d("leadTimeForChangesHours"), "decrease", formatHours),
    },
    {
      tone: "failure-rate",
      label: "変更失敗率",
      ...changeFailureRateReadout(current),
      delta: buildDelta(d("changeFailureRatePercent"), "decrease", formatPercentPointAbs),
    },
    {
      tone: "mttr",
      label: "MTTR",
      ...mttrReadout(current),
      delta: buildDelta(d("mttrHours"), "decrease", formatHours),
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
          <article
            key={card.tone}
            className={`metric-card metric-card-${card.tone}${card.muted ? " metric-card-muted" : ""}`}
          >
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
