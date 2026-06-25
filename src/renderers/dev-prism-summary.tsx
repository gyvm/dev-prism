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
  description,
  prompt,
  empty,
  items,
}: {
  title: string;
  description: string;
  prompt: string;
  empty: string;
  items: readonly DevPrismPrCandidate[];
}) {
  return (
    <section className="dev-prism-candidate-group">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <>
          <p className="dev-prism-group-desc">{description}</p>
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
              </li>
            ))}
          </ul>
          <p className="dev-prism-prompt">{prompt}</p>
        </>
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

      <div className="dev-prism-section">
        <div className="dev-prism-section-heading">
          <p className="dev-prism-eyebrow">What Changed</p>
          <h3>変化の理由候補</h3>
        </div>
        <div className="dev-prism-grid">
          <CandidateList
            title="長くかかったPR"
            description="PR作成からマージまでが長く、今週のリードタイムに影響している可能性があります。"
            prompt="これらは来週も同じ進め方になりそうですか？"
            empty="長くかかったPRは見つかりませんでした。"
            items={summary.whatChanged.longLeadTimePrs}
          />
          <CandidateList
            title="レビュー待ちが長かったPR"
            description="初回レビューまでの待ち時間が長く、流れを重くしている可能性があります。"
            prompt="レビュー待ちが長かった理由は何でしたか？"
            empty="レビュー待ちが目立つPRは見つかりませんでした。"
            items={summary.whatChanged.longReviewWaitPrs}
          />
          <CandidateList
            title="議論が多かったPR"
            description="コメントやレビュー本文が多く、議論や方針確認が発生していた可能性があります。"
            prompt="これらの議論はPR上で完結しましたか？"
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
            description="短いリードタイムで完了しており、うまく流れた作業として共有しやすいPRです。"
            prompt="今週うまく流れた作業は再現できますか？"
            empty="短時間で完了したPRは見つかりませんでした。"
            items={summary.rememberThisWeek.quickWins}
          />
          <CandidateList
            title="小さく価値のあるPR"
            description="変更量は小さいものの、チームの作業記憶に残しておきたい完了PRです。"
            prompt="これらは他のメンバーにも共有しておく価値がありますか？"
            empty="小さく完了したPRは見つかりませんでした。"
            items={summary.rememberThisWeek.smallButUseful}
          />
          <CandidateList
            title="複数人が関わったPR"
            description="作者以外の複数人がレビューやコメントに関わっており、チームで認識を揃えたい動きです。"
            prompt="関わった人の知見をチームに共有できますか？"
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
            description="オープンのまま期間をまたいでおり、来週の扱いを確認したいPRです。"
            prompt="これらは来週誰が見るとよさそうですか？"
            empty="長く開いたままのPRは見つかりませんでした。"
            items={summary.needsFollowUp.staleOpenPrs}
          />
          <CandidateList
            title="未解決レビューがあるPR"
            description="未解決レビューがあります。対応済みか、持ち越しかを確認したいPRです。"
            prompt="未解決スレッドは対応済みですか、それとも来週に持ち越しますか？"
            empty="未解決レビューがあるPRは見つかりませんでした。"
            items={summary.needsFollowUp.unresolvedReviewPrs}
          />
          <CandidateList
            title="コメント後に止まっているPR"
            description="最後のコメントやレビュー後に動きが止まっており、確認漏れの可能性があります。"
            prompt="次に動かす人は決まっていますか？"
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
