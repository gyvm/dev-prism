import { describe, expect, it } from "vitest";

import { renderBipartiteGraph } from "./bipartite-graph.js";

describe("renderBipartiteGraph", () => {
  it("uses role-scoped node ids when the same login appears as author and reviewer", () => {
    const html = renderBipartiteGraph({
      authors: [
        { login: "alice", prCount: 2, kind: "human" },
        { login: "bob", prCount: 1, kind: "human" },
      ],
      reviewers: [
        { login: "alice", reviewCount: 1, kind: "human" },
        { login: "carol", reviewCount: 2, kind: "human" },
      ],
      pairs: [
        { author: "alice", reviewer: "carol", count: 2 },
        { author: "bob", reviewer: "alice", count: 1 },
      ],
    });

    expect(html).toContain(
      'data-node-id="author:alice" data-login="alice" data-side="left"',
    );
    expect(html).toContain(
      'data-node-id="reviewer:alice" data-login="alice" data-side="right"',
    );
    expect(html).toContain('data-total="2" data-default-count="2"');
    expect(html).toContain('data-default-bar-w="100.0%"');
    expect(html).toContain('data-count="2"');
    expect(html).not.toContain('data-id="alice"');
    expect(html).toContain("var reviewerNodeId = 'reviewer:' + r");
    expect(html).toContain("var authorNodeId = 'author:' + a");
    expect(html).toContain("showPairCount(reviewerNodeId, count)");
    expect(html).toContain("showPairCount(authorNodeId, count)");
    expect(html).toContain("count.textContent = pairCount + '/' + total");
  });

  it("uses node kind for bot role", () => {
    const html = renderBipartiteGraph({
      authors: [{ login: "renovate", prCount: 1, kind: "bot" }],
      reviewers: [{ login: "alice", reviewCount: 1, kind: "human" }],
      pairs: [{ author: "renovate", reviewer: "alice", count: 1 }],
    });

    expect(html).toContain('data-login="renovate" data-side="left" data-role="bot"');
  });
});
