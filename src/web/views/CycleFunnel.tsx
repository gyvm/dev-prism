import type { CycleFunnel, CycleStageKey } from "../../analyses/cycle-time/view-model.js";
import { formatHours } from "../../renderers/utils.js";

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

export default function CycleFunnel({
  funnel,
  stageHref,
}: {
  funnel: CycleFunnel;
  stageHref?: (key: CycleStageKey) => string;
}) {
  return (
    <section>
      <h2>サイクルタイムファネル</h2>
      <div className="cycle-funnel-grid">
        {funnel.stages.map((stage) => {
          const hasData = stage.p50Hours !== null;
          const value = hasData ? formatHours(stage.p50Hours) : `データなし(n=${stage.n})`;
          const content = (
            <>
              <span className="cycle-funnel-label">{STAGE_LABELS[stage.key]}</span>
              <strong className="cycle-funnel-value">{value}</strong>
              {hasData && <span className="cycle-funnel-n">n={stage.n}</span>}
            </>
          );
          return stageHref ? (
            <a key={stage.key} className="cycle-funnel-card" href={stageHref(stage.key)}>
              {content}
            </a>
          ) : (
            <article key={stage.key} className="cycle-funnel-card">
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
