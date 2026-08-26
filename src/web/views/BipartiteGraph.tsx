import { useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";

import type { queryReviewCorrelation } from "../../analyses/review-correlation/query.js";

// Explore's React bipartite graph uses stable `.bg-*` classes and CSS custom
// properties (`--role-color`, `--role-fill`, `--role-line`, `--bar-w`, `--w`),
// driven by React state instead of imperative DOM writes.
//
// Behavior ported from the IIFE (bipartite-graph.ts ~150-230):
//   - hovering a node highlights itself, the edges it participates in, and
//     the nodes at the other end of those edges; everything else dims
//     (via the existing `[data-hovered]` / `.bg-active` CSS rules)
//   - while hovering, the *counterpart* nodes' bar width and count label
//     switch from "total" to "pair-count/total" (`showPairCount` in the
//     original); the hovered node itself keeps its own default display
//   - leaving the graph (mouseleave) clears the hover and restores defaults
//
// Unlike the IIFE, defaults are never "restored" via stashed
// data-default-* attributes — they are simply recomputed from props/state
// on every render, so there is nothing to leak or get out of sync. Hover is
// delegated through React's own onMouseOver/onMouseLeave on the root, so there
// is no listener to unregister in the first place.

type ReviewCorrelation = Awaited<ReturnType<typeof queryReviewCorrelation>>;
type AuthorActivity = ReviewCorrelation["authors"][number];
type ReviewerActivity = ReviewCorrelation["reviewers"][number];
type ReviewerPair = ReviewCorrelation["pairs"][number];

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
type Side = "left" | "right";

/** Style object carrying CSS custom properties alongside normal properties. */
type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;

type ColumnNode<TActivity> = Readonly<{
  id: string; // login
  nodeId: string; // `author:${login}` | `reviewer:${login}`
  role: Role;
  activity: TActivity;
}>;

function roleFor(kind: AuthorActivity["kind"] | ReviewerActivity["kind"]): Role {
  return kind === "bot" ? "bot" : "human";
}

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

function buildColumns(correlation: ReviewCorrelation): {
  authors: ColumnNode<AuthorActivity>[];
  reviewers: ColumnNode<ReviewerActivity>[];
} {
  const topAuthors = sortAuthors(correlation.authors);
  const topReviewers = sortReviewers(correlation.reviewers);

  return {
    authors: topAuthors.map((activity) => ({
      id: activity.login,
      nodeId: `author:${activity.login}`,
      role: roleFor(activity.kind),
      activity,
    })),
    reviewers: topReviewers.map((activity) => ({
      id: activity.login,
      nodeId: `reviewer:${activity.login}`,
      role: roleFor(activity.kind),
      activity,
    })),
  };
}

function barWidthPct(count: number, max: number): number {
  return max > 0 ? Math.max(8, (count / max) * 100) : 0;
}

/** Derived hover state: which nodes/edges light up, and the pair-count override for counterpart nodes. */
type HoverInfo = Readonly<{
  nodeId: string;
  relatedNodeIds: ReadonlySet<string>;
  activeEdgeKeys: ReadonlySet<string>;
  overrides: ReadonlyMap<string, { count: number; total: number; barWidthPct: number }>;
}>;

function edgeKey(pair: ReviewerPair): string {
  return `${pair.author}\u0000${pair.reviewer}`;
}

function computeHoverInfo(
  hoveredNodeId: string | null,
  visiblePairs: readonly ReviewerPair[],
  authorsById: ReadonlyMap<string, ColumnNode<AuthorActivity>>,
  reviewersById: ReadonlyMap<string, ColumnNode<ReviewerActivity>>,
): HoverInfo | null {
  if (!hoveredNodeId) return null;
  const isAuthorSide = hoveredNodeId.startsWith("author:");
  const login = hoveredNodeId.slice(hoveredNodeId.indexOf(":") + 1);
  const side: Side = isAuthorSide ? "left" : "right";

  const relatedNodeIds = new Set<string>([hoveredNodeId]);
  const activeEdgeKeys = new Set<string>();
  const overrides = new Map<string, { count: number; total: number; barWidthPct: number }>();

  for (const pair of visiblePairs) {
    if (side === "left" && pair.author === login) {
      activeEdgeKeys.add(edgeKey(pair));
      const reviewerNodeId = `reviewer:${pair.reviewer}`;
      relatedNodeIds.add(reviewerNodeId);
      const reviewerNode = reviewersById.get(pair.reviewer);
      if (reviewerNode) {
        const total = reviewerNode.activity.reviewCount;
        overrides.set(reviewerNodeId, { count: pair.count, total, barWidthPct: barWidthPct(pair.count, total) });
      }
    } else if (side === "right" && pair.reviewer === login) {
      activeEdgeKeys.add(edgeKey(pair));
      const authorNodeId = `author:${pair.author}`;
      relatedNodeIds.add(authorNodeId);
      const authorNode = authorsById.get(pair.author);
      if (authorNode) {
        const total = authorNode.activity.prCount;
        overrides.set(authorNodeId, { count: pair.count, total, barWidthPct: barWidthPct(pair.count, total) });
      }
    }
  }

  return { nodeId: hoveredNodeId, relatedNodeIds, activeEdgeKeys, overrides };
}

function GraphNode({
  node,
  side,
  defaultCount,
  defaultBarWidthPct,
  hover,
}: {
  node: ColumnNode<AuthorActivity> | ColumnNode<ReviewerActivity>;
  side: Side;
  defaultCount: number;
  defaultBarWidthPct: number;
  hover: HoverInfo | null;
}) {
  const palette = ROLE_COLOR[node.role];
  const override = hover?.overrides.get(node.nodeId);
  const isActive = hover?.relatedNodeIds.has(node.nodeId) ?? false;

  const barWidth = override ? `${override.barWidthPct.toFixed(1)}%` : `${defaultBarWidthPct.toFixed(1)}%`;
  const countLabel = override ? `${override.count}/${override.total}` : `${defaultCount}`;

  const style: StyleWithVars = {
    "--role-color": palette.color,
    "--role-fill": palette.fill,
    "--role-line": palette.line,
    "--bar-w": barWidth,
  };

  return (
    <div
      className={isActive ? "bg-node bg-active" : "bg-node"}
      data-node-id={node.nodeId}
      data-login={node.id}
      data-side={side}
      data-role={node.role}
      data-total={defaultCount}
      style={style}
    >
      <div className="bg-bar" />
      <span className="bg-dot" />
      <span className="bg-label">{node.activity.login}</span>
      <span className="bg-count">{countLabel}</span>
    </div>
  );
}

function EdgesSvg({
  authors,
  reviewers,
  pairs,
  height,
  hover,
}: {
  authors: readonly ColumnNode<AuthorActivity>[];
  reviewers: readonly ColumnNode<ReviewerActivity>[];
  pairs: readonly ReviewerPair[];
  height: number;
  hover: HoverInfo | null;
}) {
  const authorIndexById = new Map(authors.map((node, i) => [node.id, i]));
  const reviewerIndexById = new Map(reviewers.map((node, i) => [node.id, i]));
  const visible = pairs.filter((p) => authorIndexById.has(p.author) && reviewerIndexById.has(p.reviewer));

  if (visible.length === 0) {
    return (
      <svg className="bg-edges" width={TOTAL_W} height={height} viewBox={`0 0 ${TOTAL_W} ${height}`} aria-hidden="true" />
    );
  }

  const maxCount = Math.max(1, ...visible.map((p) => p.count));

  return (
    <svg className="bg-edges" width={TOTAL_W} height={height} viewBox={`0 0 ${TOTAL_W} ${height}`} aria-hidden="true">
      {visible.map((p) => {
        const ai = authorIndexById.get(p.author)!;
        const ri = reviewerIndexById.get(p.reviewer)!;
        const y1 = HEADER_H + ai * (ROW_H + ROW_GAP) + ROW_H / 2;
        const y2 = HEADER_H + ri * (ROW_H + ROW_GAP) + ROW_H / 2;
        const x1 = LEFT_W;
        const x2 = LEFT_W + COL_GAP;
        const w = Math.max(0.8, (p.count / maxCount) * 6);
        const role = authors[ai]?.role ?? "human";
        const palette = ROLE_COLOR[role];
        const isActive = hover?.activeEdgeKeys.has(edgeKey(p)) ?? false;
        const style: StyleWithVars = { "--w": w.toFixed(2) };
        return (
          <line
            key={edgeKey(p)}
            className={isActive ? "bg-active" : undefined}
            data-author={p.author}
            data-reviewer={p.reviewer}
            data-count={p.count}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={palette.color}
            strokeWidth={w.toFixed(2)}
            strokeLinecap="round"
            style={style}
          />
        );
      })}
    </svg>
  );
}

export default function BipartiteGraph({ data }: { data: ReviewCorrelation }) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const columns = useMemo(() => buildColumns(data), [data]);

  const authorsById = useMemo(() => new Map(columns.authors.map((n) => [n.id, n])), [columns.authors]);
  const reviewersById = useMemo(() => new Map(columns.reviewers.map((n) => [n.id, n])), [columns.reviewers]);

  const visiblePairs = useMemo(
    () => data.pairs.filter((p) => authorsById.has(p.author) && reviewersById.has(p.reviewer)),
    [data.pairs, authorsById, reviewersById],
  );

  const hover = useMemo(
    () => computeHoverInfo(hoveredNodeId, visiblePairs, authorsById, reviewersById),
    [hoveredNodeId, visiblePairs, authorsById, reviewersById],
  );

  // Delegated hover, bound to the element rather than registered against a ref.
  // The ref version had to live in an effect, and an effect with `[]` deps runs
  // exactly once: a first render that took the empty-state early return below
  // rendered no `bg-root`, so the ref was null and the listeners were skipped —
  // permanently, even after a later filter brought data in and the div mounted.
  // Handlers declared on the JSX cannot desynchronize from what is mounted.
  function handleMouseOver(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target as Element | null;
    const node = target?.closest<HTMLElement>(".bg-node[data-node-id]");
    if (!node || !event.currentTarget.contains(node)) return;
    const nodeId = node.getAttribute("data-node-id");
    if (!nodeId) return;
    setHoveredNodeId((current) => (current === nodeId ? current : nodeId));
  }

  if (columns.authors.length === 0 && columns.reviewers.length === 0) {
    return (
      <section>
        <h2>レビュー相関</h2>
        <p className="empty">今週のレビュー相関データはありません。</p>
      </section>
    );
  }

  const maxLeft = Math.max(1, ...columns.authors.map((n) => n.activity.prCount));
  const maxRight = Math.max(1, ...columns.reviewers.map((n) => n.activity.reviewCount));
  const rowCount = Math.max(columns.authors.length, columns.reviewers.length);
  const height = HEADER_H + rowCount * (ROW_H + ROW_GAP) - ROW_GAP + 8;

  const rootStyle: StyleWithVars = {
    "--bg-row-h": `${ROW_H}px`,
    "--bg-row-gap": `${ROW_GAP}px`,
    "--bg-header-h": `${HEADER_H}px`,
    "--bg-left-w": `${LEFT_W}px`,
    "--bg-right-w": `${RIGHT_W}px`,
    "--bg-col-gap": `${COL_GAP}px`,
    "--bg-total-w": `${TOTAL_W}px`,
    "--bg-height": `${height}px`,
  };

  return (
    <section className="review-correlation">
      <div className="section-head">
        <div>
          <h2>レビュー相関</h2>
          <p className="section-copy">作成者とレビュアーのペアをレビュー数で重み付けして表示。</p>
        </div>
      </div>
      <div
        className="bg-root"
        data-component="bipartite"
        data-hovered={hoveredNodeId ?? undefined}
        style={rootStyle}
        onMouseOver={handleMouseOver}
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        <div className="bg-grid">
          <div className="bg-col bg-authors">
            <div className="bg-col-header">
              <strong>PR作成者</strong>
              <small>(プルリク作成数)</small>
            </div>
            {columns.authors.map((node) => (
              <GraphNode
                key={node.nodeId}
                node={node}
                side="left"
                defaultCount={node.activity.prCount}
                defaultBarWidthPct={barWidthPct(node.activity.prCount, maxLeft)}
                hover={hover}
              />
            ))}
          </div>
          <EdgesSvg
            authors={columns.authors}
            reviewers={columns.reviewers}
            pairs={data.pairs}
            height={height}
            hover={hover}
          />
          <div className="bg-col bg-reviewers">
            <div className="bg-col-header">
              <strong>レビュアー</strong>
              <small>(レビュープルリク数)</small>
            </div>
            {columns.reviewers.map((node) => (
              <GraphNode
                key={node.nodeId}
                node={node}
                side="right"
                defaultCount={node.activity.reviewCount}
                defaultBarWidthPct={barWidthPct(node.activity.reviewCount, maxRight)}
                hover={hover}
              />
            ))}
          </div>
        </div>
        <div className="bg-legend">
          <span className="bg-legend-item">
            <span className="bg-dot" style={{ background: ROLE_COLOR.human.color }} />
            人間
          </span>
          <span className="bg-legend-item">
            <span className="bg-dot" style={{ background: ROLE_COLOR.bot.color }} />
            ボット
          </span>
          <span className="bg-legend-hint">ホバーで関連ノードと接続を強調</span>
        </div>
      </div>
    </section>
  );
}
