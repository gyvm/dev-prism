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
    expect(html).toContain('<span class="metric-label">マージ数</span>');
    expect(html).toContain(
      "デプロイ頻度の代理としてマージ数を表示します。未マージPRは含めません。",
    );
    expect(html).toContain(
      "PR作成からマージまでの時間の中央値。未マージPRは含めません。",
    );
    expect(html).not.toContain("ラベル付き");
    expect(html).toContain(
      "で始まるPR（巻き戻し）の数 ÷ 週内マージPR数。ラベル運用に依存せず、Revertタイトルで失敗修正を判定しています。",
    );
    expect(html).toContain(
      "で始まるPR（巻き戻し）の、作成からマージまでの平均時間。該当PRがない場合は N/A です。",
    );
  });
});
