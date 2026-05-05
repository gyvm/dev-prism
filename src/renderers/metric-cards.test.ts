import { describe, expect, it } from "vitest";

import { renderMetricCards } from "./metric-cards.js";

describe("renderMetricCards", () => {
  it("renders DORA cards with hoverable aggregation details instead of subcomments", () => {
    const html = renderMetricCards({
      deploymentFrequency: 13,
      leadTimeForChangesHours: 28.8,
      changeFailureRatePercent: 15.384,
      mttrHours: 1.3,
    });

    expect(html).not.toContain("<small>");
    expect(html).not.toContain("ラベルベースの失敗プロキシ");
    expect(html).not.toContain("プロキシ");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain(
      "対象週にマージされたPR数。未マージPRは含めません。",
    );
    expect(html).toContain(
      "PR作成からマージまでの時間の中央値。未マージPRは含めません。",
    );
    expect(html).toContain(
      "hotfix / revert / incident ラベル付きでマージされたPR数 ÷ 週内マージPR数。障害を直接計測せず、ラベルで失敗修正を判定しています。",
    );
    expect(html).toContain(
      "hotfix / revert / incident ラベル付きでマージされたPRの、作成からマージまでの平均時間。該当PRがない場合は N/A です。",
    );
  });
});
