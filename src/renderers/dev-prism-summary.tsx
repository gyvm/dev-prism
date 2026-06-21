import { renderToStaticMarkup } from "react-dom/server";

import type {
  DevPrismPrCandidate,
  DevPrismSummary,
} from "../analyses/dev-prism-summary/types.js";

function prLabel(pr: DevPrismPrCandidate): string {
  return `${pr.repo}#${pr.number}`;
}

function CandidateList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: readonly DevPrismPrCandidate[];
}) {
  return (
    <section className="dev-prism-candidate-group">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="dev-prism-pr-list">
          {items.map((item) => (
            <li key={`${item.repo}#${item.number}`}>
              <div className="dev-prism-pr-line">
                {item.url ? (
                  <a href={item.url}>{prLabel(item)}</a>
                ) : (
                  <span>{prLabel(item)}</span>
                )}
                <strong>{item.title}</strong>
                <span className="dev-prism-pr-metric">{item.metric}</span>
              </div>
              <p>{item.reason}</p>
              <p className="dev-prism-prompt">{item.prompt}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DevPrismSummary({ summary }: { summary: DevPrismSummary }) {
  return (
    <section className="dev-prism">
      <div className="dev-prism-intro">
        <p className="dev-prism-eyebrow">Flow Snapshot</p>
        <h2>今週の開発フロー</h2>
        <p>{summary.flowSnapshot.analystComment}</p>
      </div>

      <div className="dev-prism-metric-grid">
        {summary.flowSnapshot.metrics.map((metric) => (
          <article
            key={metric.label}
            className={`dev-prism-metric dev-prism-metric-${metric.trend}`}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>

      <div className="dev-prism-section">
        <div className="dev-prism-section-heading">
          <p className="dev-prism-eyebrow">What Changed</p>
          <h3>変化の理由候補</h3>
        </div>
        <div className="dev-prism-grid">
          <CandidateList
            title="長くかかったPR"
            empty="長くかかったPRは見つかりませんでした。"
            items={summary.whatChanged.longLeadTimePrs}
          />
          <CandidateList
            title="レビュー待ちが長かったPR"
            empty="レビュー待ちが目立つPRは見つかりませんでした。"
            items={summary.whatChanged.longReviewWaitPrs}
          />
          <CandidateList
            title="サイズが大きかったPR"
            empty="サイズが大きいPRは見つかりませんでした。"
            items={summary.whatChanged.largePrs}
          />
          <CandidateList
            title="議論が多かったPR"
            empty="議論が多いPRは見つかりませんでした。"
            items={summary.whatChanged.debatedPrs}
          />
        </div>
      </div>

      <div className="dev-prism-section">
        <div className="dev-prism-section-heading">
          <p className="dev-prism-eyebrow">Remember This Week</p>
          <h3>拾っておきたい動き</h3>
        </div>
        <div className="dev-prism-grid">
          <CandidateList
            title="サクッと完了した作業"
            empty="短時間で完了したPRは見つかりませんでした。"
            items={summary.rememberThisWeek.quickWins}
          />
          <CandidateList
            title="小さく価値のあるPR"
            empty="小さく完了したPRは見つかりませんでした。"
            items={summary.rememberThisWeek.smallButUseful}
          />
          <CandidateList
            title="複数人が関わったPR"
            empty="複数人が関わったPRは見つかりませんでした。"
            items={summary.rememberThisWeek.collaborativePrs}
          />
        </div>
      </div>

      <div className="dev-prism-section">
        <div className="dev-prism-section-heading">
          <p className="dev-prism-eyebrow">Needs Follow-up</p>
          <h3>来週確認したいこと</h3>
        </div>
        <div className="dev-prism-grid">
          <CandidateList
            title="長く開いたままのPR"
            empty="長く開いたままのPRは見つかりませんでした。"
            items={summary.needsFollowUp.staleOpenPrs}
          />
          <CandidateList
            title="未解決レビューがあるPR"
            empty="未解決レビューがあるPRは見つかりませんでした。"
            items={summary.needsFollowUp.unresolvedReviewPrs}
          />
          <CandidateList
            title="コメント後に止まっているPR"
            empty="コメント後に止まっているPRは見つかりませんでした。"
            items={summary.needsFollowUp.waitingAfterCommentPrs}
          />
        </div>
      </div>
    </section>
  );
}

export function renderDevPrismSummary(data: unknown): string {
  return renderToStaticMarkup(<DevPrismSummary summary={data as DevPrismSummary} />);
}
