/**
 * The shared "a number is missing" vocabulary for Explore's metric cards.
 *
 * Extracted from DoraComparisonCards, which was the only place that got this
 * right: every other card invented its own token ("N/A", a bare "—", or
 * "データなし(n=0)" in full accent color), so four cards in one viewport could
 * disagree about what an absent measurement looks like.
 *
 * The rule the whole screen now follows:
 *
 *   - The headline slot is a 22-28px display line. An absent value puts
 *     `NO_VALUE` there and nothing else — a sentence in that slot wraps and
 *     breaks the shared height of the cards next to it.
 *   - *Why* it is absent goes to the sub-line, in the reader's words
 *     ("マージ済みPRなし"), not in the query's ("n=0").
 *   - A measured zero is NOT absent. "0件" is an answer; it keeps its normal
 *     styling and its tone color.
 */

/** Headline placeholder for a metric that has no measurement to show. */
export const NO_VALUE = "—";

/** The headline / sub-line / tone split for a value that can be absent. */
export type Readout = Readonly<{
  /** Headline text. `NO_VALUE` when `muted`. */
  value: string;
  /** Sub-line under the headline: the denominator, or why there is none. */
  n: string | null;
  /**
   * True when `value` is a placeholder rather than a measurement. The card
   * keeps its category accent on the top border, but the headline drops to
   * neutral: an accent color is a verdict, and applying one to a number that
   * was never measured is the wrong claim in every direction.
   */
  muted: boolean;
}>;

export function measured(value: string, n: string | null): Readout {
  return { value, n, muted: false };
}

export function absent(n: string): Readout {
  return { value: NO_VALUE, n, muted: true };
}

/**
 * Why a DORA/cycle-time metric is missing whenever the period merged nothing.
 * Shared so the three DORA cards and the funnel give one answer to one
 * situation, instead of "データなし" here and "N/A" one card over.
 */
export const NO_MERGED_PRS = "マージ済みPRなし";
