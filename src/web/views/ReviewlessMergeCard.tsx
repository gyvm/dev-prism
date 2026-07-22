import type { ReviewlessMerges } from "../../analyses/review-metrics/view-model.js";

// Review block A, 2-1: review pass-through detection (docs/explore-screens.md
// "## 2. レビュー"). Deliberately a single card — a companion "review coverage
// rate" card would just be 100% minus this number, the same signal twice, so
// the spec rules it out rather than leaving it as a future addition.
export default function ReviewlessMergeCard({ data }: { data: ReviewlessMerges }) {
  return (
    <section>
      <h2>レビューなしマージ</h2>
      <div className="metric-grid metric-grid-single">
        <article className="metric-card metric-card-reviewless">
          <span className="metric-label">レビューを経ずにマージされた割合</span>
          <strong>{data.rate === null ? "N/A" : `${(data.rate * 100).toFixed(1)}%`}</strong>
          <p className="metric-card-note">
            {data.rate === null
              ? "対象期間にマージなし"
              : `${data.reviewlessCount}件 / マージ${data.mergedCount}件`}
          </p>
        </article>
      </div>
    </section>
  );
}
