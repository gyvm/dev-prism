import {
  AGING_HISTOGRAM_BUCKETS,
  type AgingHistogram as AgingHistogramData,
} from "../../analyses/aging/view-model.js";

// 4-3: fixed 5-bucket histogram of open-PR age. The bucket axis is always the
// full AGING_HISTOGRAM_BUCKETS order regardless of which buckets the data
// actually has rows for — an empty bucket still gets its axis label and a
// zero-height bar (docs/explore-screens.md 4-3). Follows TrendChart's
// accessibility pattern: an aria-label on the visual, plus a <details> table
// as the non-visual fallback.

function countFor(histogram: AgingHistogramData, bucket: string): number {
  return histogram.buckets.find((b) => b.bucket === bucket)?.count ?? 0;
}

export default function AgingHistogram({ histogram }: { histogram: AgingHistogramData }) {
  const counts = AGING_HISTOGRAM_BUCKETS.map((bucket) => ({
    bucket,
    count: countFor(histogram, bucket),
  }));
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const max = Math.max(1, ...counts.map((c) => c.count));

  if (total === 0) {
    return (
      <section>
        <h2>経過時間の分布</h2>
        <p className="empty">オープン PR なし 🎉</p>
      </section>
    );
  }

  return (
    <section>
      <h2>経過時間の分布</h2>
      <div
        role="img"
        aria-label={`経過時間帯別のオープンPR件数: ${counts
          .map((c) => `${c.bucket} ${c.count}件`)
          .join("、")}`}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          height: 160,
          padding: "8px 4px 0",
        }}
      >
        {counts.map((c) => (
          <div
            key={c.bucket}
            aria-hidden="true"
            style={{
              flex: "1 1 0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
              height: "100%",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{c.count}</span>
            <div
              style={{
                width: "100%",
                maxWidth: 56,
                // A zero count still gets a hairline so the bucket reads as
                // "present, empty" rather than missing from the chart.
                height: `${Math.max((c.count / max) * 100, c.count > 0 ? 2 : 0.5)}%`,
                background: "var(--accent-cyan)",
                borderRadius: "4px 4px 0 0",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{c.bucket}</span>
          </div>
        ))}
      </div>

      <details className="trend-table">
        <summary>数値を表で見る</summary>
        <table>
          <thead>
            <tr>
              {counts.map((c) => (
                <th key={c.bucket} scope="col">
                  {c.bucket}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {counts.map((c) => (
                <td key={c.bucket}>{c.count}件</td>
              ))}
            </tr>
          </tbody>
        </table>
      </details>
    </section>
  );
}
