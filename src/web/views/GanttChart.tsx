import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";

import type { PrTimelineOutput } from "../../analyses/pr-timeline/types.js";
import type { PrTimeline, TimelineAuxiliary, TimelineState } from "../../shared/types.js";
import { VISIBLE_ROW_LIMIT } from "./row-limit.js";

/**
 * Explore's PR timeline (gantt) chart.
 *
 * This is a from-scratch React chart with state-driven hover/tooltip behavior.
 *
 * This component uses stable CSS classes and DOM shape, with the same hover
 * behavior (segment
 * tooltip with aux details, repo/author hover highlighting), but as ordinary
 * React state. The window listeners are registered and removed in a single
 * `useEffect`, and the tooltip node is a portal that unmounts with the
 * component. Nothing survives past the component's lifetime.
 */

const DAY_COUNT = 7;

const TIMELINE_STATES: readonly TimelineState[] = [
  "implementing",
  "wait_review",
  "fixing",
  "wait_merge",
];

const TIMELINE_STATE_LABELS: Record<TimelineState, string> = {
  implementing: "実装中",
  wait_review: "レビュー待ち",
  fixing: "レビュー修正中",
  wait_merge: "マージ待ち",
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatDayLabel(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
  return `${minutes}分 (${parts.join("")})`;
}

function formatTimelinePoint(
  value: string,
  timezone: string,
): Readonly<{ date: string; time: string }> {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    date: `${part("month")}/${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function formatTimelineDateTime(value: string, timezone: string): string {
  const point = formatTimelinePoint(value, timezone);
  return `${point.date} ${point.time}`;
}

function formatTimelineRange(startAt: string, endAt: string, timezone: string): string {
  const start = formatTimelinePoint(startAt, timezone);
  const end = formatTimelinePoint(endAt, timezone);
  if (start.date === end.date) {
    return `${start.time} - ${end.time}`;
  }
  return `${start.date} ${start.time} - ${end.date} ${end.time}`;
}

function buildStatusRow(
  aux: TimelineAuxiliary,
  timezone: string,
): readonly [string, string] {
  const fmt = (value: string): string => formatTimelineDateTime(value, timezone);
  if (aux.closingState === "merged" && aux.mergedAt !== null) {
    return ["状態", `マージ済み (${fmt(aux.mergedAt)})`];
  }
  if (aux.closingState === "closed_unmerged" && aux.closedAt !== null) {
    return ["状態", `クローズ ${fmt(aux.closedAt)} ※未マージ`];
  }
  return ["状態", "オープン中"];
}

function buildAuxRows(
  aux: TimelineAuxiliary,
  timezone: string,
): ReadonlyArray<readonly [string, string]> {
  const fmt = (value: string | null): string =>
    value === null ? "-" : formatTimelineDateTime(value, timezone);
  const reaction =
    aux.firstReaction === null
      ? "-"
      : `${formatTimelineDateTime(aux.firstReaction.at, timezone)} (@${aux.firstReaction.by})`;
  return [
    buildStatusRow(aux, timezone),
    ["最初のコミット", fmt(aux.firstCommitAt)],
    ["レビュー依頼時刻", fmt(aux.readyForReviewAt)],
    ["最初のレビュー反応", reaction],
    ["最初の承認", fmt(aux.firstApproveAt)],
    ["承認回数", `${aux.approveCount} (うち取消 ${aux.dismissCount})`],
    ["レビュー反応数", `${aux.reviewCommentCount}`],
    ["承認後の追加コミット", `${aux.postApproveCommitCount}`],
  ];
}

type SegmentBar = Readonly<{
  state: TimelineState;
  leftPct: number;
  widthPct: number;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  label: string;
}>;

type RowData = Readonly<{
  key: string;
  repoKey: string;
  author: string | null;
  ref: string;
  url: string;
  title: string;
  closedUnmerged: boolean;
  /** Sort keys read the *unclamped* timeline, not `bars` — bars are clipped to
   *  the week window, so two PRs that both started before it would compare
   *  equal on their drawn geometry. */
  startMs: number;
  endMs: number;
  durationHours: number;
  bars: readonly SegmentBar[];
  auxRows: ReadonlyArray<readonly [string, string]>;
  /** `auxRows` serialized for the `data-aux` attribute the string renderer also
   *  emits. Nothing in this component reads it back — the tooltip is driven by
   *  state — but the DOM shape stays stable for CSS and accessibility.
   *  Serialized here so it is paid once per data load, not once per hover. */
  auxJson: string;
}>;

function buildRow(
  timeline: PrTimeline,
  weekStartMs: number,
  weekDurationMs: number,
  timezone: string,
): RowData | null {
  const bars: SegmentBar[] = [];
  for (const segment of timeline.segments) {
    const startMs = Date.parse(segment.startAt);
    const endMs = Date.parse(segment.endAt);
    const left = clamp01((startMs - weekStartMs) / weekDurationMs);
    const right = clamp01((endMs - weekStartMs) / weekDurationMs);
    const width = right - left;
    if (width <= 0) continue;
    const durationMinutes = Math.max(1, Math.round(segment.durationHours * 60));
    const rangeLabel = formatTimelineRange(segment.startAt, segment.endAt, timezone);
    bars.push({
      state: segment.state,
      leftPct: left * 100,
      widthPct: Math.max(width * 100, 0.5),
      startAt: segment.startAt,
      endAt: segment.endAt,
      durationMinutes,
      label: `${rangeLabel} / ${formatDurationMinutes(durationMinutes)} / ${TIMELINE_STATE_LABELS[segment.state]}`,
    });
  }
  if (bars.length === 0) return null;

  const repoKey = `${timeline.repo.owner}/${timeline.repo.name}`;
  const auxRows = buildAuxRows(timeline.auxiliary, timezone);
  return {
    key: `${repoKey}#${timeline.number}`,
    repoKey,
    author: timeline.author,
    ref: `${repoKey}#${timeline.number}`,
    url: `https://github.com/${timeline.repo.owner}/${timeline.repo.name}/pull/${timeline.number}`,
    title: timeline.title,
    closedUnmerged: timeline.auxiliary.closingState === "closed_unmerged",
    startMs: Math.min(...timeline.segments.map((segment) => Date.parse(segment.startAt))),
    endMs: Math.max(...timeline.segments.map((segment) => Date.parse(segment.endAt))),
    durationHours: timeline.totalDurationHours,
    bars,
    auxRows,
    auxJson: JSON.stringify(auxRows),
  };
}

type SortKey = "start" | "end" | "duration";

type SortState = Readonly<{ key: SortKey; desc: boolean }>;

const SORT_OPTIONS: ReadonlyArray<Readonly<{ key: SortKey; label: string }>> = [
  { key: "start", label: "開始" },
  { key: "end", label: "終了" },
  { key: "duration", label: "所要時間" },
];

/** Direction a key opens in when it is newly picked. The two time keys read
 *  oldest-first — the gantt then steps down the page in the order the work
 *  actually happened — while duration opens longest-first, since sorting by it
 *  at all is a search for the outlier. */
const SORT_OPENS_DESC: Readonly<Record<SortKey, boolean>> = {
  start: false,
  end: false,
  duration: true,
};

const DEFAULT_SORT: SortState = { key: "start", desc: false };

function sortValue(row: RowData, key: SortKey): number {
  if (key === "start") return row.startMs;
  if (key === "end") return row.endMs;
  return row.durationHours;
}

/** NaN (an unparseable boundary) sorts last in both directions, as in
 *  StageTimeTable — the flip below is applied after the guard, not to it. */
function compareRows(a: RowData, b: RowData, sort: SortState): number {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  if (Number.isNaN(av) || Number.isNaN(bv)) {
    if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
    return Number.isNaN(av) ? 1 : -1;
  }
  // Ties fall back to start time so equal durations still read chronologically.
  const tie = Number.isNaN(a.startMs) || Number.isNaN(b.startMs) ? 0 : a.startMs - b.startMs;
  const diff = av === bv ? tie : av - bv;
  return sort.desc ? -diff : diff;
}

type HoveredFilter = Readonly<{ kind: "repo" | "author"; value: string }>;

type TooltipState = Readonly<{
  items: ReadonlyArray<Pick<SegmentBar, "state" | "label">>;
  auxRows: ReadonlyArray<readonly [string, string]>;
}>;

function positionTooltip(el: HTMLDivElement | null, clientX: number, clientY: number): void {
  if (!el) return;
  const offset = 14;
  const x = clientX + offset;
  const y = clientY + offset;
  const rect = el.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 10;
  const maxY = window.innerHeight - rect.height - 10;
  el.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
  el.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
}

function EmptyState() {
  return (
    <section>
      <h2>PRタイムライン</h2>
      <p className="empty">今週のタイムラインデータはありません。</p>
    </section>
  );
}

export default function GanttChart({ weekStart, weekEnd, timezone, timelines }: PrTimelineOutput) {
  const [hoveredFilter, setHoveredFilter] = useState<HoveredFilter | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [expanded, setExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  // Keep tooltip dismissal symmetric with mount/unmount so the view never
  // leaves global listeners behind.
  useEffect(() => {
    function hide(): void {
      setTooltip(null);
    }
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip) return;
    positionTooltip(tooltipRef.current, pointerRef.current.x, pointerRef.current.y);
  }, [tooltip]);

  // Derived purely from the data props — but hover state (tooltip,
  // hoveredFilter) re-renders this component on every pointer move across the
  // list, and without the memo each of those renders re-parsed every segment's
  // dates and built two Intl.DateTimeFormat instances per segment. That is
  // data-load work, not pointer work.
  const { axisLabels, rows } = useMemo(() => {
    const weekStartMs = Date.parse(weekStart);
    const weekEndMs = Date.parse(weekEnd);
    const weekDurationMs = Math.max(weekEndMs - weekStartMs, 1);
    const bucketMs = weekDurationMs / DAY_COUNT;
    return {
      axisLabels: Array.from({ length: DAY_COUNT }, (_, i) =>
        formatDayLabel(new Date(weekStartMs + i * bucketMs + bucketMs / 2)),
      ),
      rows: timelines
        .map((timeline) => buildRow(timeline, weekStartMs, weekDurationMs, timezone))
        .filter((row): row is RowData => row !== null),
    };
  }, [weekStart, weekEnd, timezone, timelines]);

  // Kept out of the memo above so re-sorting never re-parses segment dates.
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sort)),
    [rows, sort],
  );

  // Subsumes the empty-`timelines` case: no timelines means no rows.
  if (rows.length === 0) return <EmptyState />;

  const hasClosedUnmerged = rows.some((row) => row.closedUnmerged);
  // Row cap applies to the *sorted* list, so the sort chooses which rows the
  // collapsed view shows. As in StageTimeTable, `expanded` deliberately
  // survives a sort change rather than re-collapsing under the user.
  const hiddenCount = expanded ? 0 : Math.max(0, sortedRows.length - VISIBLE_ROW_LIMIT);
  const visibleRows = hiddenCount > 0 ? sortedRows.slice(0, VISIBLE_ROW_LIMIT) : sortedRows;

  function toggleSort(key: SortKey): void {
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: SORT_OPENS_DESC[key] },
    );
  }

  function handleTrackEnter(event: MouseEvent<HTMLDivElement>, row: RowData): void {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setTooltip({
      items: row.bars.map((bar) => ({ state: bar.state, label: bar.label })),
      auxRows: row.auxRows,
    });
  }
  function handleTrackMove(event: MouseEvent<HTMLDivElement>): void {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    positionTooltip(tooltipRef.current, event.clientX, event.clientY);
  }
  function handleTrackLeave(): void {
    setTooltip(null);
  }
  function handleFilterEnter(kind: HoveredFilter["kind"], value: string): void {
    setHoveredFilter((current) =>
      current?.kind === kind && current.value === value ? current : { kind, value },
    );
  }
  function handleListLeave(): void {
    setHoveredFilter(null);
    setTooltip(null);
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>PRタイムライン</h2>
        </div>
        <div className="timeline-head-aside">
          <div className="timeline-sort" role="group" aria-label="並び替え">
            <span className="timeline-sort-label">並び替え</span>
            {SORT_OPTIONS.map((option) => {
              const isSorted = sort.key === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  className="timeline-sort-btn"
                  aria-pressed={isSorted}
                  onClick={() => toggleSort(option.key)}
                >
                  {option.label}
                  {isSorted ? (sort.desc ? " ▼" : " ▲") : ""}
                </button>
              );
            })}
          </div>
          <div className="timeline-legend" aria-label="Timeline legend">
            {TIMELINE_STATES.map((state) => (
              <span className="legend-item" key={state}>
                <span className={`gantt-legend-swatch ${state}`} />
                {TIMELINE_STATE_LABELS[state]}
              </span>
            ))}
            {hasClosedUnmerged && (
              <span className="legend-item">
                <span className="gantt-legend-swatch gantt-legend-swatch-closed" />
                クローズ (未マージ)
              </span>
            )}
          </div>
        </div>
      </div>
      <div
        className="timeline-list"
        data-component="timeline"
        data-hovered-filter={
          hoveredFilter ? `${hoveredFilter.kind}:${hoveredFilter.value}` : undefined
        }
        onMouseLeave={handleListLeave}
      >
        <article className="timeline-row timeline-axis-row" aria-hidden="true">
          <div className="timeline-meta">プルリクエスト</div>
          <div className="timeline-track-wrap">
            <div className="timeline-axis">
              {axisLabels.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
          </div>
        </article>
        {visibleRows.map((row) => {
          const { author } = row;
          const isActive =
            hoveredFilter !== null &&
            ((hoveredFilter.kind === "repo" && hoveredFilter.value === row.repoKey) ||
              (hoveredFilter.kind === "author" &&
                author !== null &&
                hoveredFilter.value === author));
          return (
            <article
              key={row.key}
              className={`timeline-row${isActive ? " timeline-filter-active" : ""}`}
              data-repo={row.repoKey}
              data-author={author ?? undefined}
              data-closed-unmerged={row.closedUnmerged ? "true" : undefined}
              data-aux={row.auxJson}
            >
              <div className="timeline-meta">
                <span className="pr-title-line">
                  <a className="pr-title" href={row.url} target="_blank" rel="noopener noreferrer">
                    {row.title}
                  </a>
                  <span className="pr-author-prefix">by</span>
                  {author === null ? (
                    <span className="pr-author">作成者不明</span>
                  ) : (
                    <span
                      className="pr-author"
                      data-author={author}
                      onMouseEnter={() => handleFilterEnter("author", author)}
                    >
                      @{author}
                    </span>
                  )}
                </span>
                <span
                  className="pr-ref"
                  data-repo={row.repoKey}
                  onMouseEnter={() => handleFilterEnter("repo", row.repoKey)}
                >
                  {row.ref}
                </span>
                {row.closedUnmerged && (
                  <span className="aging-badge aging-badge-draft">未マージ</span>
                )}
              </div>
              <div className="timeline-track-wrap">
                <div
                  className="gantt-track"
                  onMouseEnter={(event) => handleTrackEnter(event, row)}
                  onMouseMove={handleTrackMove}
                  onMouseLeave={handleTrackLeave}
                >
                  <div className="gantt-daygrid" aria-hidden="true">
                    {Array.from({ length: DAY_COUNT }, (_, i) => (
                      <span key={i} className="gantt-daygrid-cell" />
                    ))}
                  </div>
                  {row.bars.map((bar, i) => (
                    <span
                      key={i}
                      className={`gantt-segment ${bar.state}`}
                      style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                      data-state={bar.state}
                      data-start={bar.startAt}
                      data-end={bar.endAt}
                      data-duration-minutes={bar.durationMinutes}
                      data-label={bar.label}
                    />
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button type="button" className="timeline-more" onClick={() => setExpanded(true)}>
          残り {hiddenCount} 件を表示（全 {sortedRows.length} 件）
        </button>
      )}
      {tooltip &&
        createPortal(
          <div className="timeline-tooltip" role="tooltip" ref={tooltipRef}>
            <div className="timeline-tooltip-title">ステータス詳細</div>
            <ol>
              {tooltip.items.map((item, i) => (
                <li key={i}>
                  <span className={`gantt-tooltip-swatch ${item.state}`} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ol>
            {tooltip.auxRows.length > 0 && (
              <dl>
                {tooltip.auxRows.map(([label, value], i) => (
                  <Fragment key={i}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
