import type { AgingPr, AgingStatus, AgingTable as AgingTableData } from "../../analyses/aging/view-model.js";
import { formatHours } from "../../renderers/utils.js";

// 4-2: one row per open PR, in the order the caller supplies (age-descending
// is the data layer's responsibility per docs/explore-screens.md 4-2 — this
// component never re-sorts). Status badges use existing DESIGN.md tones
// (cyan/blue/green/amber/red only, no purple) at low alpha via the
// `.aging-badge-<status>` classes in explore-styles.ts, which derive their
// fill/border from the same tokens with color-mix() rather than re-typing the
// alpha as a literal rgba().

const STATUS_LABELS: Readonly<Record<AgingStatus, string>> = {
  draft: "ドラフト",
  awaiting_review: "レビュー待ち",
  changes_requested: "変更依頼中",
  approved: "アプルーブ済み",
};

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// >=24h reads as days (spec example "3.2日"); under that, hours/minutes via
// the shared formatHours (e.g. "45分", "5.3h").
function formatAge(hours: number): string {
  if (hours >= 24) return `${Math.round((hours / 24) * 10) / 10}日`;
  return formatHours(hours);
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return UPDATED_AT_FORMATTER.format(date);
}

function StatusBadge({ status }: { status: AgingStatus }) {
  return <span className={`aging-badge aging-badge-${status}`}>{STATUS_LABELS[status]}</span>;
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
      <div className="aging-table-wrap">
        <table className="aging-table">
          <thead>
            <tr>
              <th scope="col">PR タイトル</th>
              <th scope="col">リポジトリ</th>
              <th scope="col">作成者</th>
              <th scope="col">状態</th>
              <th scope="col">ボール保持者</th>
              <th scope="col" data-align="right">
                経過時間
              </th>
              <th scope="col">最終更新</th>
            </tr>
          </thead>
          <tbody>
            {table.prs.map((pr) => (
              <tr key={`${pr.repoKey}#${pr.number}`}>
                <td>
                  <PrCell pr={pr} />
                </td>
                <td>{pr.repoKey}</td>
                <td>{pr.author ?? "—"}</td>
                <td>
                  <StatusBadge status={pr.status} />
                </td>
                <td>{pr.ballHolder ?? "—"}</td>
                <td data-align="right">{formatAge(pr.ageHours)}</td>
                <td>{formatUpdatedAt(pr.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
