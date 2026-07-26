import { useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

import type {
  SizePickupPoint,
  SizePickupScatter as SizePickupScatterData,
} from "../../analyses/review-metrics/view-model.js";
import { formatHours } from "../../renderers/utils.js";

// Review block A, 2-3: size × review-pickup scatter (docs/explore-screens.md
// "## 2. レビュー", docs/explore-screens-sql-design.md "## 2-3"). Follows the
// SVG/accessibility pattern TrendChart established (role="img" + aria-labelledby,
// a hover readout, a <details> table fallback) rather than inventing a new one.
//
// Y (change size) is log-scale by spec: "大きい PR ほどレビューが遅い" reads in
// the upper-right, and line-count PRs span several orders of magnitude so a
// linear axis would flatten everything below a few outliers. X (pickup hours)
// stays linear — pickup can legitimately be ~0h (reviewed the moment it opened),
// which a log axis cannot place at all, and the spec leaves the choice open.

const VIEW_W = 720;
const VIEW_H = 320;
const PAD = { top: 16, right: 20, bottom: 40, left: 60 } as const;

function log10(value: number): number {
  return Math.log(value) / Math.LN10;
}

/** Nice-ish linear upper bound, same rounding TrendChart uses for its y-axis. */
function niceLinearMax(values: readonly number[]): number {
  const peak = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(log10(peak));
  return Math.ceil(peak / magnitude) * magnitude;
}

/**
 * Log-scale domain rounded out to whole decades, so ticks land on 10/100/1000
 * rather than arbitrary values. Values are floored at 1 before taking log10 —
 * `size_lines` is additions+deletions and is never negative, but a PR with a
 * mode-only change can legitimately be 0, and log(0) has no position.
 */
function decadeDomain(values: readonly number[]): { min: number; max: number; ticks: number[] } {
  const floored = values.map((v) => Math.max(v, 1));
  const minExp = Math.floor(log10(Math.min(...floored)));
  const rawMaxExp = Math.ceil(log10(Math.max(...floored)));
  const maxExp = rawMaxExp === minExp ? minExp + 1 : rawMaxExp;
  const ticks = [];
  for (let exp = minExp; exp <= maxExp; exp++) ticks.push(10 ** exp);
  return { min: 10 ** minExp, max: 10 ** maxExp, ticks };
}

type TooltipState = Readonly<{ point: SizePickupPoint }>;

// Identical in shape to GanttChart's positionTooltip — both clamp a
// fixed-position tooltip to the viewport from the last known pointer
// coordinates — but small enough that sharing it across two files would cost
// more in indirection than the ~10 lines it saves.
function positionTooltip(el: HTMLDivElement | null, clientX: number, clientY: number): void {
  if (!el) return;
  const offset = 14;
  const rect = el.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 10;
  const maxY = window.innerHeight - rect.height - 10;
  el.style.left = `${Math.max(10, Math.min(clientX + offset, maxX))}px`;
  el.style.top = `${Math.max(10, Math.min(clientY + offset, maxY))}px`;
}

function pointKey(point: SizePickupPoint): string {
  return `${point.repoKey}#${point.number}`;
}

export default function SizePickupScatter({ scatter }: { scatter: SizePickupScatterData }) {
  const titleId = useId();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const { points, totalMatched, truncated } = scatter;

  const geometry = useMemo(() => {
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    const xMax = niceLinearMax(points.map((p) => p.pickupHours));
    const y = decadeDomain(points.map((p) => p.sizeLines));
    const xScale = (value: number) => PAD.left + (value / xMax) * plotW;
    const yLogSpan = log10(y.max) - log10(y.min);
    const yScale = (value: number) =>
      PAD.top + plotH - ((log10(Math.max(value, 1)) - log10(y.min)) / yLogSpan) * plotH;
    return { plotW, plotH, xMax, y, xScale, yScale };
  }, [points]);

  if (points.length === 0) {
    return (
      <section>
        <h2>サイズ × レビュー着手</h2>
        <p className="empty">この期間のレビュー着手データがありません。</p>
      </section>
    );
  }

  const { plotH, xMax, y, xScale, yScale } = geometry;
  const xTicks = [0, xMax / 4, xMax / 2, (xMax * 3) / 4, xMax];

  function handlePointEnter(point: SizePickupPoint, event: ReactMouseEvent): void {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setTooltip({ point });
  }
  function handlePointMove(event: ReactMouseEvent): void {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    positionTooltip(tooltipRef.current, event.clientX, event.clientY);
  }
  function handlePointLeave(): void {
    setTooltip(null);
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2 id={titleId}>サイズ × レビュー着手</h2>
          <p className="section-copy">
            大きい PR ほどレビュー着手が遅くなっていないか。右上の点が改善候補（PR分割の根拠）。
          </p>
        </div>
      </div>

      {truncated && (
        <p className="section-copy">
          最新 {points.length} 件を表示（全 {totalMatched} 件）
        </p>
      )}

      <div className="chart-scroll">
        <svg
          className="scatter-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-labelledby={titleId}
        >
        {y.ticks.map((tick) => {
          const gy = yScale(tick);
          return (
            <g key={tick}>
              <line className="trend-grid" x1={PAD.left} y1={gy} x2={VIEW_W - PAD.right} y2={gy} />
              <text className="trend-axis" x={PAD.left - 8} y={gy + 4} textAnchor="end">
                {tick.toLocaleString()}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => (
          <text
            key={tick}
            className="trend-axis"
            x={xScale(tick)}
            y={VIEW_H - PAD.bottom + 16}
            textAnchor="middle"
          >
            {Math.round(tick * 10) / 10}
          </text>
        ))}

        <text
          className="scatter-axis-label"
          x={PAD.left + (VIEW_W - PAD.left - PAD.right) / 2}
          y={VIEW_H - 6}
          textAnchor="middle"
        >
          オープン→初回レビュー時間（時間）
        </text>
        <text
          className="scatter-axis-label"
          x={-(PAD.top + plotH / 2)}
          y={14}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          変更行数（対数目盛）
        </text>

        {points.map((point) => {
          const cx = xScale(point.pickupHours);
          const cy = yScale(point.sizeLines);
          const active = tooltip?.point === point;
          const circle = (
            <circle
              className={active ? "scatter-point scatter-point-active" : "scatter-point"}
              cx={cx}
              cy={cy}
              r={5}
              onMouseEnter={(event) => handlePointEnter(point, event)}
              onMouseMove={handlePointMove}
              onMouseLeave={handlePointLeave}
            />
          );
          return point.url ? (
            <a
              key={pointKey(point)}
              className="scatter-point-link"
              href={point.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`#${point.number} ${point.title ?? ""} を GitHub で開く`}
            >
              {circle}
            </a>
          ) : (
            <g key={pointKey(point)}>{circle}</g>
          );
        })}
        </svg>
      </div>

      <p className="trend-readout" role="status">
        {tooltip
          ? `#${tooltip.point.number} ${tooltip.point.title ?? "(無題)"} (${tooltip.point.repoKey}) — ` +
            `${tooltip.point.sizeLines.toLocaleString()}行 / ${formatHours(tooltip.point.pickupHours)}`
          : "点にカーソルを合わせると PR の詳細が出ます。クリックで GitHub を開きます。"}
      </p>

      <details className="trend-table">
        <summary>数値を表で見る</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">PR</th>
              <th scope="col">タイトル</th>
              <th scope="col">リポジトリ</th>
              <th scope="col">変更行数</th>
              <th scope="col">オープン→初回レビュー</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={pointKey(point)}>
                <th scope="row">#{point.number}</th>
                <td>{point.title ?? "-"}</td>
                <td>{point.repoKey}</td>
                <td>{point.sizeLines.toLocaleString()}</td>
                <td>{formatHours(point.pickupHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {tooltip &&
        createPortal(
          <div className="timeline-tooltip" role="tooltip" ref={tooltipRef}>
            <div className="timeline-tooltip-title">
              #{tooltip.point.number} {tooltip.point.title ?? "(無題)"}
            </div>
            <dl>
              <dt>リポジトリ</dt>
              <dd>{tooltip.point.repoKey}</dd>
              <dt>変更行数</dt>
              <dd>{tooltip.point.sizeLines.toLocaleString()}行</dd>
              <dt>オープン→初回レビュー</dt>
              <dd>{formatHours(tooltip.point.pickupHours)}</dd>
            </dl>
          </div>,
          document.body,
        )}
    </section>
  );
}
