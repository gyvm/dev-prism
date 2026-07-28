import { useId, useMemo, useState } from "react";

import { CYCLE_STAGE_KEYS } from "../../analyses/cycle-time/view-model.js";
import type {
  CycleStageKey,
  LeadTrend,
  LeadTrendBucket,
} from "../../analyses/cycle-time/view-model.js";
import type { Grain } from "../../analyses/scope.js";
import { formatHours } from "../../renderers/utils.js";
import { placeEndLabels } from "./end-labels.js";
import { formatBucket, GRAIN_LABEL } from "./grain-format.js";

// Lead-time trend (1-3): the funnel's four stages (1-2), over time, so the
// same breakdown reads as a direction of travel rather than a snapshot.
//
// Not TrendChart reused: TrendChart's buckets carry flat counts per key,
// LeadTrendBucket carries a `stages` array of {p50Hours, n} where p50Hours can
// be null for a sparse bucket. That shape needs its own line-building (breaking
// the polyline at nulls instead of interpolating across them), so this is a
// fresh implementation — same SVG structure, CSS classes (reused verbatim from
// TrendChart/EXPLORE_STYLES: .trend, .trend-svg, .trend-line, …) and
// accessibility pattern (crosshair + role="status" readout + <details> table).
//
// Colors deliberately do not reuse TREND_COLORS' four hues together
// (accent-blue/success/accent-cyan/attention): TrendChart.tsx documents that
// exact combination failing the categorical checks (cyan↔green ΔE 12.5,
// under the floor of 15), which is why *that* component never renders more
// than two series at once. This chart has no such escape (funnel order is one
// chart, 1-2's stages are the whole point), so it swaps in --danger for
// --success to avoid the failing pair. See deviations note in the delivering
// task — this substitution was not re-run through the categorical validator.
export const LEAD_TREND_COLORS: Readonly<Record<CycleStageKey, string>> = {
  commit_to_open: "var(--accent-blue)",
  open_to_review: "var(--accent-cyan)",
  review_to_approve: "var(--attention)",
  approve_to_merge: "var(--danger)",
};

const STAGE_LABELS: Readonly<Record<CycleStageKey, string>> = {
  commit_to_open: "コミット→オープン",
  open_to_review: "オープン→レビュー",
  review_to_approve: "レビュー→アプルーブ",
  approve_to_merge: "アプルーブ→マージ",
};

const VIEW_W = 720;
const VIEW_H = 200;
// The Japanese stage names render directly at the line ends, so the chart
// reserves their width inside the viewBox instead of relying on SVG overflow.
const PAD = { top: 12, right: 150, bottom: 26, left: 40 } as const;

/** Nice-ish upper bound so the axis reads in round numbers; ignores sparse nulls. */
function axisMax(values: readonly (number | null)[]): number {
  const present = values.filter((v): v is number => v !== null);
  const peak = Math.max(1, ...present);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil(peak / magnitude) * magnitude;
}

function stageValue(bucket: LeadTrendBucket, stageIndex: number): number | null {
  return bucket.stages[stageIndex]?.p50Hours ?? null;
}

function stageN(bucket: LeadTrendBucket, stageIndex: number): number {
  return bucket.stages[stageIndex]?.n ?? 0;
}

type Point = Readonly<{ index: number; value: number }>;

/** Splits a series into contiguous non-null runs so gaps break the line
 *  instead of interpolating across a missing (sparse) bucket. */
function buildRuns(buckets: readonly LeadTrendBucket[], stageIndex: number): readonly Point[][] {
  const runs: Point[][] = [];
  let current: Point[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const value = stageValue(buckets[i]!, stageIndex);
    if (value === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push({ index: i, value });
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export default function LeadTrendChart({ trend }: { trend: LeadTrend }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, grain } = trend;

  // Same defensive re-sync as TrendChart: a filter submit can swap `buckets`
  // while the pointer still rests on the chart (no mouseleave crosses the
  // SVG), so stale `hover` must be dropped during render, not via effect.
  const [renderedBuckets, setRenderedBuckets] = useState(buckets);
  if (renderedBuckets !== buckets) {
    setRenderedBuckets(buckets);
    setHover(null);
  }

  const geometry = useMemo(() => {
    const allValues = buckets.flatMap((b) =>
      CYCLE_STAGE_KEYS.map((_, i) => stageValue(b, i)),
    );
    const max = axisMax(allValues);
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    const step = buckets.length > 1 ? plotW / (buckets.length - 1) : 0;
    const x = (index: number) => PAD.left + index * step;
    const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
    const runs = CYCLE_STAGE_KEYS.map((_, i) => buildRuns(buckets, i));
    return { max, plotH, x, y, runs };
  }, [buckets]);

  if (buckets.length === 0) {
    return (
      <section className="trend">
        <h2>リードタイムの推移</h2>
        <p className="trend-empty">この期間のデータがありません。</p>
      </section>
    );
  }

  const { max, plotH, x, y, runs } = geometry;
  const labelStride = Math.max(1, Math.ceil(buckets.length / 8));
  const hoveredBucket = hover == null ? undefined : buckets[hover];
  const active = hover != null && hoveredBucket ? { index: hover, bucket: hoveredBucket } : null;

  // End labels: attach to each stage's *last present* value (not necessarily
  // the last bucket — a stage can go sparse at the tail), then de-collide with
  // the same helper TrendChart uses. The clamp is what stops all four stages —
  // which converge on ~0h whenever review is fast — from stacking down over the
  // x-axis tick labels.
  const lastIndex = buckets.length - 1;
  const endLabels = placeEndLabels(
    CYCLE_STAGE_KEYS.map((key, stageIndex) => {
      const stageRuns = runs[stageIndex]!;
      const lastRun = stageRuns[stageRuns.length - 1];
      const lastPoint = lastRun?.[lastRun.length - 1];
      return lastPoint ? { item: key, idealY: y(lastPoint.value) } : null;
    }).filter((v): v is { item: CycleStageKey; idealY: number } => v !== null),
    { top: PAD.top, bottom: PAD.top + plotH },
  );

  return (
    <section className="trend">
      <h2 id={titleId}>
        リードタイムの推移
        <span className="trend-grain">{GRAIN_LABEL[grain]}</span>
      </h2>

      <ul className="trend-legend">
        {CYCLE_STAGE_KEYS.map((key) => (
          <li key={key}>
            <span
              className="trend-swatch"
              style={{ background: LEAD_TREND_COLORS[key] }}
              aria-hidden="true"
            />
            {STAGE_LABELS[key]}
          </li>
        ))}
      </ul>

      <div className="chart-scroll">
        <svg
          className="trend-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-labelledby={titleId}
          onMouseLeave={() => setHover(null)}
        >
        {[0, 0.5, 1].map((ratio) => {
          const gy = PAD.top + plotH * (1 - ratio);
          return (
            <g key={ratio}>
              <line className="trend-grid" x1={PAD.left} y1={gy} x2={VIEW_W - PAD.right} y2={gy} />
              <text className="trend-axis" x={PAD.left - 8} y={gy + 4} textAnchor="end">
                {formatHours(max * ratio)}
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

        {CYCLE_STAGE_KEYS.map((key, stageIndex) => {
          const color = LEAD_TREND_COLORS[key];
          const activeValue = active ? stageValue(active.bucket, stageIndex) : null;
          return (
            <g key={key}>
              {runs[stageIndex]!.map((run, runIndex) => (
                <polyline
                  key={runIndex}
                  className="trend-line"
                  points={run.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
                  stroke={color}
                />
              ))}
              {active && activeValue !== null && (
                <circle
                  className="trend-dot"
                  cx={x(active.index)}
                  cy={y(activeValue)}
                  r={5}
                  fill={color}
                />
              )}
            </g>
          );
        })}

        {endLabels.map(({ item: key, labelY }) => (
          <text
            key={key}
            className="trend-endlabel"
            x={x(lastIndex) + 8}
            y={labelY + 4}
            fill={LEAD_TREND_COLORS[key]}
          >
            {STAGE_LABELS[key]}
          </text>
        ))}

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
      </div>

      <p className="trend-readout" role="status">
        {active
          ? `${formatBucket(active.bucket.bucket, grain)} — ${CYCLE_STAGE_KEYS.map((key, i) => {
              const value = stageValue(active.bucket, i);
              return value === null
                ? `${STAGE_LABELS[key]} データなし`
                : `${STAGE_LABELS[key]} ${formatHours(value)}(n=${stageN(active.bucket, i)})`;
            }).join(" / ")}`
          : "グラフにカーソルを合わせると内訳が出ます。"}
      </p>

      <details className="trend-table">
        <summary>数値を表で見る</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">期間</th>
              {CYCLE_STAGE_KEYS.map((key) => (
                <th key={key} scope="col">
                  {STAGE_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.bucket}>
                <th scope="row">{formatBucket(bucket.bucket, grain)}</th>
                {CYCLE_STAGE_KEYS.map((key, i) => {
                  const value = stageValue(bucket, i);
                  return (
                    <td key={key}>
                      {value === null ? "データなし" : `${formatHours(value)}(n=${stageN(bucket, i)})`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
