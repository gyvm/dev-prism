import type { ReviewerLeadTimes } from "../../analyses/review-metrics/view-model.js";
import { formatHours } from "./format-hours.js";

// Review block B, 2-5: reviewer-by-reviewer request→first-review time
// (docs/explore-screens.md "## 2. レビュー", docs/explore-screens-sql-design.md
// "## 2-5"). Rows render in prop order, never re-sorted by value — a ranked
// bar chart would read as a personal leaderboard, which "設計上の決定事項"
// rules out ("個人ランキングは採用しない"). The representative value is p50,
// not the mean the original screen spec named; the SQL design doc records why
// (median resists a single outlier response) and this component just renders
// whatever it is given.
export default function ReviewerLeadBars({ data }: { data: ReviewerLeadTimes }) {
  const { reviewers } = data;

  if (reviewers.length === 0) {
    return (
      <section>
        <h2>レビュアー別リードタイム</h2>
        <p className="empty">この期間のレビュー依頼データがありません。</p>
      </section>
    );
  }

  // Scaled against the longest bar in this set, not a fixed absolute ceiling —
  // this is a relative comparison across reviewers, not an axis with units.
  const maxP50 = Math.max(1, ...reviewers.map((r) => r.p50Hours ?? 0));

  return (
    <section>
      <h2>レビュアー別リードタイム</h2>
      <p className="section-copy">
        レビュー依頼から初回レビューまでの時間（p50）。棒はレビュアー間の相対比較用。
      </p>
      <ul className="reviewer-lead-list">
        {reviewers.map((r) => {
          const pct = r.p50Hours === null ? 0 : Math.max(2, (r.p50Hours / maxP50) * 100);
          return (
            <li key={r.reviewer} className="reviewer-lead-row">
              <span className="reviewer-lead-name">{r.reviewer}</span>
              <span className="reviewer-lead-bar-wrap">
                {r.p50Hours !== null && (
                  <span className="reviewer-lead-bar" style={{ width: `${pct}%` }} />
                )}
              </span>
              <span className="reviewer-lead-value">
                {r.p50Hours === null
                  ? `未応答のみ (${r.pendingCount}件)`
                  : `${formatHours(r.p50Hours)} (n=${r.respondedCount})`}
                {r.p50Hours !== null && r.pendingCount > 0 && (
                  <span className="reviewer-lead-pending"> ・ 未応答 {r.pendingCount}件</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
