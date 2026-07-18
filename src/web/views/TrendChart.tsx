import { useId, useMemo, useState } from "react";

import type { ActivityTrendBucket } from "../../analyses/activity-trend/view-model.js";
import type { Grain } from "../../analyses/scope.js";

// Line chart for activity counts over time. Explore-only (the frozen report has
// no trend section), so it is a plain React component with no inline script —
// the pattern every new Explore view follows. See docs/explore-views-plan.md.
//
// Two series per chart, never four: PR counts and comment counts differ by an
// order of magnitude, so one shared y-axis flattens the PR lines. Callers render
// two charts instead (small multiples) rather than a dual axis.
//
// Palette is validated, not eyeballed. The DESIGN.md tokens below cleared the
// categorical checks (lightness band, chroma floor, CVD separation,
// normal-vision floor, contrast) as the pairs blue↔green and cyan↔amber. The
// four-in-one-chart arrangement FAILED — cyan↔green sit at ΔE 12.5 for normal
// vision, under the floor of 15 — which is why the split is structural, not
// stylistic. Re-validate before changing any of these hex values.

export type TrendSeries = Readonly<{
  key: keyof ActivityTrendBucket & ("prOpened" | "prMerged" | "reviews" | "comments");
  label: string;
  color: string;
}>;

export const TREND_COLORS = {
  prOpened: "var(--accent-blue)",
  prMerged: "var(--success)",
  reviews: "var(--accent-cyan)",
  comments: "var(--attention)",
} as const;

const VIEW_W = 720;
const VIEW_H = 200;
const PAD = { top: 12, right: 64, bottom: 26, left: 40 } as const;

const GRAIN_LABEL: Readonly<Record<Grain, string>> = {
  day: "日次",
  week: "週次",
  month: "月次",
};

function formatBucket(iso: string, grain: Grain): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return grain === "month" ? `${date.getUTCFullYear()}/${month}` : `${month}/${day}`;
}

/** Nice-ish upper bound so the axis reads in round numbers. */
function axisMax(values: readonly number[]): number {
  const peak = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil(peak / magnitude) * magnitude;
}

export default function TrendChart({
  title,
  buckets,
  series,
  grain,
}: {
  title: string;
  buckets: readonly ActivityTrendBucket[];
  series: readonly TrendSeries[];
  grain: Grain;
}) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);

  // A filter submit can swap `buckets` while the pointer still rests on the
  // chart — a keyboard submit, or a preset button whose click path never
  // crosses the SVG, so `onMouseLeave` never fires. Explore keeps the rendered
  // element in state (islands/Explore.tsx), so this component is reconciled
  // rather than remounted and `hover` would otherwise survive into data it no
  // longer indexes. Resetting during render is React's recommended alternative
  // to a useEffect for this; note it does not spare the pass below from a stale
  // `hover`, which is why the lookup there is defensive too.
  const [renderedBuckets, setRenderedBuckets] = useState(buckets);
  if (renderedBuckets !== buckets) {
    setRenderedBuckets(buckets);
    setHover(null);
  }

  const geometry = useMemo(() => {
    const max = axisMax(buckets.flatMap((b) => series.map((s) => b[s.key])));
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    // A lone bucket has no span to divide; pin it to the left edge.
    const step = buckets.length > 1 ? plotW / (buckets.length - 1) : 0;
    const x = (index: number) => PAD.left + index * step;
    const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
    return { max, plotH, x, y };
  }, [buckets, series]);

  if (buckets.length === 0) {
    return (
      <section className="trend">
        <h2>{title}</h2>
        <p className="trend-empty">この期間のデータがありません。</p>
      </section>
    );
  }

  const { max, plotH, x, y } = geometry;
  // Keep the axis readable at any bucket count rather than printing every tick.
  const labelStride = Math.max(1, Math.ceil(buckets.length / 8));
  // Defensive, not decorative: on the render pass where `buckets` has just
  // shrunk, the reset above is queued but not yet applied, so `hover` can still
  // point past the end. An out-of-range read has to drop the overlay — throwing
  // inside render blanks the whole Explore island, which has no error boundary.
  const hoveredBucket = hover == null ? undefined : buckets[hover];
  const active = hover != null && hoveredBucket ? { index: hover, bucket: hoveredBucket } : null;

  // End labels sit at each line's final value, so converging series collide and
  // render as overlapping glyphs. Walk them top-down and push each down until it
  // clears the previous one — the labels stay attached to the right line while
  // remaining legible.
  const lastIndex = buckets.length - 1;
  const endLabels = series
    .map((s) => ({ series: s, idealY: y(buckets[lastIndex]![s.key]) }))
    .sort((a, b) => a.idealY - b.idealY)
    .reduce<{ series: TrendSeries; labelY: number }[]>((placed, entry) => {
      const previous = placed[placed.length - 1];
      const minGap = 13;
      const labelY =
        previous && entry.idealY - previous.labelY < minGap
          ? previous.labelY + minGap
          : entry.idealY;
      placed.push({ series: entry.series, labelY });
      return placed;
    }, []);

  return (
    <section className="trend">
      <h2 id={titleId}>
        {title}
        <span className="trend-grain">{GRAIN_LABEL[grain]}</span>
      </h2>

      {/* Legend is mandatory for >=2 series so identity is never color-alone;
          the end-of-line labels below are the second, redundant channel. */}
      <ul className="trend-legend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="trend-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      <svg
        className="trend-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((ratio) => {
          const gy = PAD.top + plotH * (1 - ratio);
          return (
            <g key={ratio}>
              <line className="trend-grid" x1={PAD.left} y1={gy} x2={VIEW_W - PAD.right} y2={gy} />
              <text className="trend-axis" x={PAD.left - 8} y={gy + 4} textAnchor="end">
                {Math.round(max * ratio)}
              </text>
            </g>
          );
        })}

        {buckets.map((bucket, index) =>
          index % labelStride === 0 ? (
            <text
              key={bucket.bucket}
              className="trend-axis"
              x={x(index)}
              y={VIEW_H - 8}
              textAnchor="middle"
            >
              {formatBucket(bucket.bucket, grain)}
            </text>
          ) : null,
        )}

        {active && (
          <line
            className="trend-crosshair"
            x1={x(active.index)}
            y1={PAD.top}
            x2={x(active.index)}
            y2={PAD.top + plotH}
          />
        )}

        {series.map((s) => (
          <g key={s.key}>
            <polyline
              className="trend-line"
              points={buckets.map((b, i) => `${x(i)},${y(b[s.key])}`).join(" ")}
              stroke={s.color}
            />
            {active && (
              <circle
                className="trend-dot"
                cx={x(active.index)}
                cy={y(active.bucket[s.key])}
                r={5}
                fill={s.color}
              />
            )}
          </g>
        ))}

        {/* Direct labels: the redundant encoding that keeps the pair legible for
            tritan viewers, where these hues sit closest. Drawn after the lines
            so a nudged label is never covered by one. */}
        {endLabels.map(({ series: s, labelY }) => (
          <text
            key={s.key}
            className="trend-endlabel"
            x={x(lastIndex) + 8}
            y={labelY + 4}
            fill={s.color}
          >
            {s.label}
          </text>
        ))}

        {/* Full-height hit targets: far easier to acquire than the 2px line. */}
        {buckets.map((bucket, index) => (
          <rect
            key={bucket.bucket}
            x={x(index) - (VIEW_W - PAD.left - PAD.right) / (buckets.length * 2) - 1}
            y={PAD.top}
            width={(VIEW_W - PAD.left - PAD.right) / buckets.length + 2}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>

      <p className="trend-readout" role="status">
        {active
          ? `${formatBucket(active.bucket.bucket, grain)} — ${series
              .map((s) => `${s.label} ${active.bucket[s.key]}`)
              .join(" / ")}`
          : "グラフにカーソルを合わせると内訳が出ます。"}
      </p>

      {/* Table view: the non-visual path to the same numbers. */}
      <details className="trend-table">
        <summary>数値を表で見る</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">期間</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.bucket}>
                <th scope="row">{formatBucket(bucket.bucket, grain)}</th>
                {series.map((s) => (
                  <td key={s.key}>{bucket[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
