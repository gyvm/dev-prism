import type {
  AuthorActivity,
  ReviewCorrelation,
  ReviewerActivity,
  ReviewerPair,
} from "../shared/types.js";
import { escapeHtml } from "./utils.js";

const MAX_DISPLAYED = 12;
const ROW_H = 36;
const ROW_GAP = 8;
const HEADER_H = 44;
const LEFT_W = 280;
const RIGHT_W = 280;
const COL_GAP = 168;
const TOTAL_W = LEFT_W + COL_GAP + RIGHT_W;

const ROLE_COLOR = {
  human: {
    color: "var(--role-human)",
    fill: "var(--role-human-fill)",
    line: "var(--role-human-line)",
  },
  bot: {
    color: "var(--role-bot)",
    fill: "var(--role-bot-fill)",
    line: "var(--role-bot-line)",
  },
} as const;

type Role = keyof typeof ROLE_COLOR;

type ColumnNode = {
  id: string;
  nodeId: string;
  role: Role;
  activity: AuthorActivity | ReviewerActivity;
};

function sortAuthors(authors: readonly AuthorActivity[]): AuthorActivity[] {
  return [...authors]
    .sort((a, b) => b.prCount - a.prCount || a.login.localeCompare(b.login))
    .slice(0, MAX_DISPLAYED);
}

function sortReviewers(reviewers: readonly ReviewerActivity[]): ReviewerActivity[] {
  return [...reviewers]
    .sort((a, b) => b.reviewCount - a.reviewCount || a.login.localeCompare(b.login))
    .slice(0, MAX_DISPLAYED);
}

function buildColumns(
  authors: readonly AuthorActivity[],
  reviewers: readonly ReviewerActivity[],
): { authors: ColumnNode[]; reviewers: ColumnNode[] } {
  const topAuthors = sortAuthors(authors);
  const topReviewers = sortReviewers(reviewers);

  const roleFor = (activity: AuthorActivity | ReviewerActivity): Role =>
    activity.kind === "bot" ? "bot" : "human";

  return {
    authors: topAuthors.map((activity) => ({
      id: activity.login,
      nodeId: `author:${activity.login}`,
      role: roleFor(activity),
      activity,
    })),
    reviewers: topReviewers.map((activity) => ({
      id: activity.login,
      nodeId: `reviewer:${activity.login}`,
      role: roleFor(activity),
      activity,
    })),
  };
}

function nodeHtml(
  node: ColumnNode,
  side: "left" | "right",
  maxLeft: number,
  maxRight: number,
): string {
  const isLeft = side === "left";
  const activity = node.activity;
  const count = isLeft
    ? (activity as AuthorActivity).prCount
    : (activity as ReviewerActivity).reviewCount;
  const max = isLeft ? maxLeft : maxRight;
  const widthPct = max > 0 ? Math.max(8, (count / max) * 100) : 0;
  const palette = node.role === "bot" ? ROLE_COLOR.bot : ROLE_COLOR.human;
  const label = escapeHtml(activity.login);

  const defaultBarW = `${widthPct.toFixed(1)}%`;

  return `<div class="bg-node" data-node-id="${escapeHtml(node.nodeId)}" data-login="${escapeHtml(node.id)}" data-side="${side}" data-role="${node.role}" data-total="${count}" data-default-count="${count}" data-default-bar-w="${defaultBarW}" style="--role-color:${palette.color};--role-fill:${palette.fill};--role-line:${palette.line};--bar-w:${defaultBarW}">
    <div class="bg-bar"></div>
    <span class="bg-dot"></span>
    <span class="bg-label">${label}</span>
    <span class="bg-count">${count}</span>
  </div>`;
}

function edgesSvg(
  authors: readonly ColumnNode[],
  reviewers: readonly ColumnNode[],
  pairs: readonly ReviewerPair[],
  height: number,
): string {
  const authorIndexById = new Map(authors.map((node, i) => [node.id, i]));
  const reviewerIndexById = new Map(reviewers.map((node, i) => [node.id, i]));
  const visible = pairs.filter(
    (p) => authorIndexById.has(p.author) && reviewerIndexById.has(p.reviewer),
  );
  if (visible.length === 0) {
    return `<svg class="bg-edges" width="${TOTAL_W}" height="${height}" viewBox="0 0 ${TOTAL_W} ${height}" aria-hidden="true"></svg>`;
  }
  const maxCount = Math.max(1, ...visible.map((p) => p.count));

  const lines = visible
    .map((p) => {
      const ai = authorIndexById.get(p.author)!;
      const ri = reviewerIndexById.get(p.reviewer)!;
      const y1 = HEADER_H + ai * (ROW_H + ROW_GAP) + ROW_H / 2;
      const y2 = HEADER_H + ri * (ROW_H + ROW_GAP) + ROW_H / 2;
      const x1 = LEFT_W;
      const x2 = LEFT_W + COL_GAP;
      const w = Math.max(0.8, (p.count / maxCount) * 6);
      const role = authors[ai]?.role ?? "human";
      const palette = role === "bot" ? ROLE_COLOR.bot : ROLE_COLOR.human;
      return `<line data-author="${escapeHtml(p.author)}" data-reviewer="${escapeHtml(p.reviewer)}" data-count="${p.count}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${palette.color}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" style="--w:${w.toFixed(2)}" />`;
    })
    .join("");

  return `<svg class="bg-edges" width="${TOTAL_W}" height="${height}" viewBox="0 0 ${TOTAL_W} ${height}" aria-hidden="true">${lines}</svg>`;
}

const HOVER_SCRIPT = `
(function(){
  var roots = document.querySelectorAll('[data-component="bipartite"]');
  roots.forEach(function(root){
    function resetNode(node){
      var count = node.querySelector('.bg-count');
      if (count) count.textContent = node.getAttribute('data-default-count') || '';
      node.style.setProperty('--bar-w', node.getAttribute('data-default-bar-w') || '0%');
    }
    function clear(){
      root.removeAttribute('data-hovered');
      root.querySelectorAll('.bg-active').forEach(function(el){ el.classList.remove('bg-active'); });
      root.querySelectorAll('.bg-node').forEach(resetNode);
    }
    function showPairCount(nodeId, pairCount){
      root.querySelectorAll('.bg-node[data-node-id="' + CSS.escape(nodeId) + '"]').forEach(function(n){
        var total = Number(n.getAttribute('data-total') || 0);
        var count = n.querySelector('.bg-count');
        var pct = total > 0 ? Math.max(8, (pairCount / total) * 100) : 0;
        n.style.setProperty('--bar-w', pct.toFixed(1) + '%');
        if (count) count.textContent = pairCount + '/' + total;
      });
    }
    function activate(node){
      var login = node.getAttribute('data-login');
      var side = node.getAttribute('data-side');
      var nodeId = node.getAttribute('data-node-id');
      if (!login || !side || !nodeId) return;
      root.setAttribute('data-hovered', nodeId);
      var related = new Set([nodeId]);
      root.querySelectorAll('.bg-edges line').forEach(function(line){
        var a = line.getAttribute('data-author');
        var r = line.getAttribute('data-reviewer');
        var count = Number(line.getAttribute('data-count') || 0);
        if (side === 'left' && a === login){
          line.classList.add('bg-active');
          var reviewerNodeId = 'reviewer:' + r;
          related.add(reviewerNodeId);
          showPairCount(reviewerNodeId, count);
        } else if (side === 'right' && r === login){
          line.classList.add('bg-active');
          var authorNodeId = 'author:' + a;
          related.add(authorNodeId);
          showPairCount(authorNodeId, count);
        }
      });
      related.forEach(function(relatedNodeId){
        root.querySelectorAll('.bg-node[data-node-id="' + CSS.escape(relatedNodeId) + '"]').forEach(function(n){
          n.classList.add('bg-active');
        });
      });
    }
    root.addEventListener('mouseover', function(e){
      var n = e.target.closest('.bg-node[data-node-id]');
      if (!n || !root.contains(n)) return;
      var nodeId = n.getAttribute('data-node-id');
      if (root.getAttribute('data-hovered') === nodeId) return;
      clear();
      activate(n);
    });
    root.addEventListener('mouseleave', clear);
  });
})();
`.trim();

export function renderBipartiteGraph(data: unknown): string {
  const correlation = data as ReviewCorrelation;
  const columns = buildColumns(correlation.authors, correlation.reviewers);

  if (columns.authors.length === 0 && columns.reviewers.length === 0) {
    return `<section><h2>レビュー相関</h2><p class="empty">今週のレビュー相関データはありません。</p></section>`;
  }

  const maxLeft = Math.max(
    1,
    ...columns.authors.map((node) => (node.activity as AuthorActivity).prCount),
  );
  const maxRight = Math.max(
    1,
    ...columns.reviewers.map((node) => (node.activity as ReviewerActivity).reviewCount),
  );
  const rowCount = Math.max(columns.authors.length, columns.reviewers.length);
  const height = HEADER_H + rowCount * (ROW_H + ROW_GAP) - ROW_GAP + 8;

  const leftCol = columns.authors
    .map((node) => nodeHtml(node, "left", maxLeft, maxRight))
    .join("");
  const rightCol = columns.reviewers
    .map((node) => nodeHtml(node, "right", maxLeft, maxRight))
    .join("");

  return `<section class="review-correlation">
    <div class="section-head">
      <div>
        <h2>レビュー相関</h2>
        <p class="section-copy">作成者とレビュアーのペアをレビュー数で重み付けして表示。</p>
      </div>
    </div>
    <div class="bg-root" data-component="bipartite" style="--bg-row-h:${ROW_H}px;--bg-row-gap:${ROW_GAP}px;--bg-header-h:${HEADER_H}px;--bg-left-w:${LEFT_W}px;--bg-right-w:${RIGHT_W}px;--bg-col-gap:${COL_GAP}px;--bg-total-w:${TOTAL_W}px;--bg-height:${height}px">
      <div class="bg-grid">
        <div class="bg-col bg-authors">
          <div class="bg-col-header"><strong>PR作成者</strong><small>(プルリク作成数)</small></div>
          ${leftCol}
        </div>
        ${edgesSvg(columns.authors, columns.reviewers, correlation.pairs, height)}
        <div class="bg-col bg-reviewers">
          <div class="bg-col-header"><strong>レビュアー</strong><small>(レビュープルリク数)</small></div>
          ${rightCol}
        </div>
      </div>
      <div class="bg-legend">
        <span class="bg-legend-item"><span class="bg-dot" style="background:${ROLE_COLOR.human.color}"></span>人間</span>
        <span class="bg-legend-item"><span class="bg-dot" style="background:${ROLE_COLOR.bot.color}"></span>ボット</span>
        <span class="bg-legend-hint">ホバーで関連ノードと接続を強調</span>
      </div>
    </div>
    <script>${HOVER_SCRIPT}</script>
  </section>`;
}
