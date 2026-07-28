import { useMemo, useState } from "react";

import { CYCLE_STAGE_KEYS } from "../../analyses/cycle-time/view-model.js";
import type { CycleStageKey, PrStageTimes } from "../../analyses/cycle-time/view-model.js";
import { formatHours } from "../../renderers/utils.js";
import { VISIBLE_ROW_LIMIT } from "./row-limit.js";

// 3-2: stage-by-stage duration table, same data as GanttChart (3-1) in tabular
// form. `initialSort` lands the funnel-card drilldown (docs/explore-screens.md
// "ページ間の動線"); resolving the query parameter into that prop is the
// caller's job, not this component's.

type SortKey = CycleStageKey | "sizeLines" | "mergedAt" | "number";

type SortState = Readonly<{ key: SortKey; desc: boolean }>;

type Column = Readonly<{ key: SortKey; label: string; align?: "right" }>;

const STAGE_LABELS: Readonly<Record<CycleStageKey, string>> = {
  commit_to_open: "コミット→オープン",
  open_to_review: "オープン→レビュー",
  review_to_approve: "レビュー→アプルーブ",
  approve_to_merge: "アプルーブ→マージ",
};

const COLUMNS: readonly Column[] = [
  { key: "number", label: "PR" },
  { key: "sizeLines", label: "変更行数", align: "right" },
  ...CYCLE_STAGE_KEYS.map((key) => ({ key, label: STAGE_LABELS[key], align: "right" as const })),
  { key: "mergedAt", label: "マージ日" },
];

const MERGED_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatStageHours(hours: number | null): string {
  return hours === null ? "—" : formatHours(hours);
}

function formatMergedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return MERGED_DATE_FORMATTER.format(date);
}

/** Sort value for a column; null (missing stage data) always sorts last. */
function sortValue(row: PrStageTimes, key: SortKey): number | null {
  if (key === "number") return row.number;
  if (key === "sizeLines") return row.sizeLines;
  if (key === "mergedAt") return Date.parse(row.mergedAt);
  const index = CYCLE_STAGE_KEYS.indexOf(key);
  return row.stageHours[index] ?? null;
}

function compareRows(a: PrStageTimes, b: PrStageTimes, sort: SortState): number {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  const diff = av - bv;
  return sort.desc ? -diff : diff;
}

export default function StageTimeTable({
  rows,
  initialSort,
}: {
  rows: readonly PrStageTimes[];
  initialSort?: Readonly<{ key: CycleStageKey | "sizeLines" | "mergedAt"; desc: boolean }>;
}) {
  // Deviation: no default sort is mandated by the spec, so an unsorted table
  // defaults to "most recently merged first" — the same order a fresh load of
  // 3-1's gantt chart reads in.
  const [sort, setSort] = useState<SortState>(initialSort ?? { key: "mergedAt", desc: true });
  const [expanded, setExpanded] = useState(false);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sort)),
    [rows, sort],
  );

  function toggleSort(key: SortKey): void {
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: true }));
  }

  // Same cap, and for the same reason, as the gantt above it (GanttChart's
  // VISIBLE_ROW_LIMIT): a year-wide Explore window puts hundreds of rows on the
  // page. Capping is safe *because* the table sorts — the outliers this table
  // exists to surface are what a sort brings to the top, so they are always in
  // the visible slice. Re-collapsing on sort would fight the user, so `expanded`
  // is deliberately not reset in toggleSort.
  const hiddenCount = expanded ? 0 : Math.max(0, sortedRows.length - VISIBLE_ROW_LIMIT);
  const visibleRows = hiddenCount > 0 ? sortedRows.slice(0, VISIBLE_ROW_LIMIT) : sortedRows;

  if (rows.length === 0) {
    return (
      <section>
        <h2>ステージ別時間テーブル</h2>
        <p className="empty">この期間のPRデータがありません。</p>
      </section>
    );
  }

  return (
    <section>
      <h2>ステージ別時間テーブル</h2>
      <div className="stage-table-wrap">
        <table className="stage-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const isSorted = sort.key === col.key;
                const ariaSort = isSorted ? (sort.desc ? "descending" : "ascending") : "none";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    data-align={col.align === "right" ? "right" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="stage-table-sort-btn"
                    >
                      {col.label}
                      {isSorted ? (sort.desc ? " ▼" : " ▲") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.repoKey}#${row.number}`}>
                <td>
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noopener noreferrer">
                      #{row.number} {row.title ?? "(無題)"}
                    </a>
                  ) : (
                    <span>
                      #{row.number} {row.title ?? "(無題)"}
                    </span>
                  )}
                </td>
                <td data-align="right">{row.sizeLines}</td>
                {row.stageHours.map((hours, i) => (
                  <td key={i} data-align="right">
                    {formatStageHours(hours)}
                  </td>
                ))}
                <td>{formatMergedDate(row.mergedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <button type="button" className="timeline-more" onClick={() => setExpanded(true)}>
          残り {hiddenCount} 件を表示（全 {sortedRows.length} 件）
        </button>
      )}
    </section>
  );
}
