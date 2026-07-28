import type { CycleFunnel, CycleStageKey } from "../../analyses/cycle-time/view-model.js";
import { formatHours } from "../../renderers/utils.js";
import { NO_VALUE } from "./readout.js";

// Cycle-time funnel (1-2). Four stage cards, side by side, in funnel order.
// Deliberately shows no total: stage p50s are medians, and medians do not add
// (docs/explore-screens.md "設計上の決定事項" — the one representative sum
// lives on the DORA lead-time card, 1-1). This component is the relative
// comparison across stages only.

const STAGE_LABELS: Readonly<Record<CycleStageKey, string>> = {
  commit_to_open: "コミット→オープン",
  open_to_review: "オープン→レビュー",
  review_to_approve: "レビュー→アプルーブ",
  approve_to_merge: "アプルーブ→マージ",
};

/**
 * Why a stage has no median, in the reader's terms.
 *
 * A stage samples the PRs whose two boundary timestamps both exist, and the SQL
 * derives `p50_hours` and `n` from the identical `FILTER (WHERE sN >= 0)`
 * (cycle-time/query.ts) — so `p50Hours === null` holds exactly when `n === 0`.
 * The old "データなし(n=0)" therefore printed a number that could never be
 * anything but 0, and still left the reader to guess which of the two
 * timestamps went missing. Naming the missing end answers that instead.
 */
const STAGE_ABSENT_REASON: Readonly<Record<CycleStageKey, string>> = {
  commit_to_open: "コミット情報のあるPRなし",
  open_to_review: "レビューされたPRなし",
  review_to_approve: "アプルーブされたPRなし",
  approve_to_merge: "アプルーブ後にマージされたPRなし",
};

export default function CycleFunnel({
  funnel,
  stageHref,
}: {
  funnel: CycleFunnel;
  stageHref?: (key: CycleStageKey) => string;
}) {
  // Nothing merged in the period: all four stages are empty for one single
  // reason, so it gets stated once. Four cards each repeating "no data" is four
  // times the ink for the same sentence, and the funnel's four-stage structure
  // is not worth showing when there is no comparison left to make.
  if (funnel.stages.every((stage) => stage.n === 0)) {
    return (
      <section>
        <h2>サイクルタイムファネル</h2>
        <p className="empty">この期間のマージ済みPRがありません。</p>
      </section>
    );
  }

  return (
    <section>
      <h2>サイクルタイムファネル</h2>
      <div className="cycle-funnel-grid">
        {funnel.stages.map((stage) => {
          const hasData = stage.p50Hours !== null;
          // The headline slot is 22px display type: it holds the value or the
          // placeholder, never a sentence. The sentence goes one line down,
          // where the sample size sits when there is one.
          const value = hasData ? formatHours(stage.p50Hours) : NO_VALUE;
          const note = hasData ? `n=${stage.n}` : STAGE_ABSENT_REASON[stage.key];
          const content = (
            <>
              <span className="cycle-funnel-label">{STAGE_LABELS[stage.key]}</span>
              <strong className="cycle-funnel-value">{value}</strong>
              <span className="cycle-funnel-n">{note}</span>
            </>
          );
          const className = `cycle-funnel-card${hasData ? "" : " cycle-funnel-card-muted"}`;
          return stageHref ? (
            <a key={stage.key} className={className} href={stageHref(stage.key)}>
              {content}
            </a>
          ) : (
            <article key={stage.key} className={className}>
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
