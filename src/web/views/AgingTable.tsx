import type { CSSProperties } from "react";

import type { AgingPr, AgingStatus, AgingTable as AgingTableData } from "../../analyses/aging/view-model.js";
import { formatHours } from "../../renderers/utils.js";

// 4-2: one row per open PR, in the order the caller supplies (age-descending
// is the data layer's responsibility per docs/explore-screens.md 4-2 — this
// component never re-sorts). Status badges use existing DESIGN.md tones
// (cyan/blue/green/amber/red only, no purple) at low alpha rather than new
// CSS classes, since page-styles.ts has no table/badge classes yet to reuse.

const STATUS_LABELS: Readonly<Record<AgingStatus, string>> = {
  draft: "ドラフト",
  awaiting_review: "レビュー待ち",
  changes_requested: "変更依頼中",
  approved: "アプルーブ済み",
};

const STATUS_COLORS: Readonly<Record<AgingStatus, { fg: string; bg: string; border: string }>> = {
  draft: { fg: "var(--fg-muted)", bg: "rgba(114,128,145,.12)", border: "rgba(114,128,145,.28)" },
  awaiting_review: { fg: "var(--attention)", bg: "rgba(183,121,31,.12)", border: "rgba(183,121,31,.28)" },
  changes_requested: { fg: "var(--danger)", bg: "rgba(194,65,58,.12)", border: "rgba(194,65,58,.28)" },
  approved: { fg: "var(--success)", bg: "rgba(31,143,95,.12)", border: "rgba(31,143,95,.28)" },
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border-default)",
};

const td: CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--border-muted)",
};

// >=24h reads as days (spec example "3.2日"); under that, hours/minutes via
// the shared formatHours (e.g. "45分", "5.3h").
function formatAge(hours: number): string {
  if (hours >= 24) return `${Math.round((hours / 24) * 10) / 10}日`;
  return formatHours(hours);
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${m}/${d} ${hh}:${mm}`;
}

function StatusBadge({ status }: { status: AgingStatus }) {
  const palette = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 650,
        whiteSpace: "nowrap",
        color: palette.fg,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function PrCell({ pr }: { pr: AgingPr }) {
  const label = `#${pr.number} ${pr.title ?? "(無題)"}`;
  if (pr.url === null) return <span>{label}</span>;
  return (
    <a href={pr.url} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

export default function AgingTable({ table }: { table: AgingTableData }) {
  if (table.prs.length === 0) {
    return (
      <section>
        <h2>エイジングテーブル</h2>
        <p className="empty">オープン PR なし 🎉</p>
      </section>
    );
  }

  return (
    <section>
      <h2>エイジングテーブル</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th scope="col" style={th}>
                PR タイトル
              </th>
              <th scope="col" style={th}>
                リポジトリ
              </th>
              <th scope="col" style={th}>
                作成者
              </th>
              <th scope="col" style={th}>
                状態
              </th>
              <th scope="col" style={th}>
                ボール保持者
              </th>
              <th scope="col" style={{ ...th, textAlign: "right" }}>
                経過時間
              </th>
              <th scope="col" style={th}>
                最終更新
              </th>
            </tr>
          </thead>
          <tbody>
            {table.prs.map((pr) => (
              <tr key={`${pr.repoKey}#${pr.number}`}>
                <td style={td}>
                  <PrCell pr={pr} />
                </td>
                <td style={td}>{pr.repoKey}</td>
                <td style={td}>{pr.author ?? "—"}</td>
                <td style={td}>
                  <StatusBadge status={pr.status} />
                </td>
                <td style={td}>{pr.ballHolder ?? "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatAge(pr.ageHours)}</td>
                <td style={td}>{formatUpdatedAt(pr.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
