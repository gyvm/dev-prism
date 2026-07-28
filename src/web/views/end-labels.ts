// Placement for the direct series labels at the right edge of a line chart.
//
// TrendChart and LeadTrendChart both attach a label to each line's last value.
// Converging series (every stage at ~0h, the common case for a healthy repo)
// give every label the same ideal y, so they need de-collision — and once
// pushed apart, the stack has to stay inside the plot or it lands on top of
// the x-axis tick labels drawn below it.

export type EndLabelCandidate<T> = Readonly<{ item: T; idealY: number }>;

export type PlacedEndLabel<T> = Readonly<{ item: T; labelY: number }>;

/** Vertical distance between two stacked labels. Matches the 11px
 *  `.trend-endlabel` font size plus a little breathing room. */
const MIN_GAP = 13;

/**
 * Places labels near their ideal y without overlapping, clamped to `[top,
 * bottom]`.
 *
 * Walks top-down pushing each label below the previous one, then — if the
 * resulting stack overflows the bottom — slides the whole stack back up by the
 * overflow. Sliding the stack rather than clamping each label individually is
 * what keeps them from re-colliding at the boundary: n labels converging on the
 * bottom edge would otherwise all clamp to the same y.
 *
 * A stack taller than the plot cannot fit at all; it starts at `top` and is
 * allowed to run over, which is still more legible than n labels on one line.
 */
export function placeEndLabels<T>(
  candidates: readonly EndLabelCandidate<T>[],
  bounds: Readonly<{ top: number; bottom: number }>,
): readonly PlacedEndLabel<T>[] {
  const stacked = [...candidates]
    .sort((a, b) => a.idealY - b.idealY)
    .reduce<PlacedEndLabel<T>[]>((placed, entry) => {
      const previous = placed[placed.length - 1];
      const labelY =
        previous && entry.idealY - previous.labelY < MIN_GAP
          ? previous.labelY + MIN_GAP
          : entry.idealY;
      placed.push({ item: entry.item, labelY });
      return placed;
    }, []);

  const last = stacked[stacked.length - 1];
  if (last === undefined) return stacked;

  const overflow = last.labelY - bounds.bottom;
  if (overflow <= 0) return stacked;

  const first = stacked[0]!;
  const shift = Math.min(overflow, Math.max(0, first.labelY - bounds.top));
  return shift === 0 ? stacked : stacked.map((l) => ({ ...l, labelY: l.labelY - shift }));
}
