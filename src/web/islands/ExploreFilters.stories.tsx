import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import ExploreFilters, { type ExploreFilterValue } from "./ExploreFilters.js";

const initialValue: ExploreFilterValue = {
  from: new Date("2026-05-25T00:00:00Z"),
  to: new Date("2026-07-19T00:00:00Z"),
  grain: "week",
  repos: ["gyvm/dev-prism"],
  users: [],
  includeBots: false,
};

function FiltersPreview() {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState("選択内容を更新できます。");

  const apply = (next: ExploreFilterValue) => {
    setValue(next);
    setStatus("フィルタを適用しました。");
  };

  return (
    <>
      <ExploreFilters
        value={value}
        options={{
          repos: ["gyvm/dev-prism", "gyvm/other-repo"],
          users: ["hoshino", "kaede", "amamiya", "reviewer-bot"],
        }}
        onChange={setValue}
        onPreset={apply}
        onSubmit={() => apply(value)}
      />
      <p className="explore-status" role="status" aria-live="polite">
        {status}
      </p>
    </>
  );
}

const meta = {
  title: "Explore/Controls/Filters",
  component: ExploreFilters,
  args: {
    value: initialValue,
    options: { repos: [], users: [] },
    onChange: () => {},
    onPreset: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof ExploreFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => <FiltersPreview />,
};
