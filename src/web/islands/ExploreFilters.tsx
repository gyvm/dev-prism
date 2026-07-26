import type { FormEvent } from "react";

import type { Grain } from "../../analyses/scope.js";
import MultiSelect from "./MultiSelect.js";
import PeriodPicker from "./PeriodPicker.js";

export type ExploreFilterValue = Readonly<{
  from: Date | null;
  to: Date | null;
  grain: Grain;
  repos: readonly string[];
  users: readonly string[];
  includeBots: boolean;
}>;

export type ExploreFilterOptions = Readonly<{ repos: readonly string[]; users: readonly string[] }>;

type Props = Readonly<{
  value: ExploreFilterValue;
  options: ExploreFilterOptions;
  onChange: (next: ExploreFilterValue) => void;
  /** Period presets are complete windows and apply immediately. */
  onPreset: (next: ExploreFilterValue) => void;
  onSubmit: () => void;
  /**
   * Greys out the time-axis controls (period + grain) for views that read the
   * present rather than a window — the wip backlog. Repos/users/bots stay live
   * everywhere (docs/explore-screens.md フィルタバー). Grain is included because
   * it only drives trend charts, and wip has none: leaving it enabled would be
   * a knob that visibly does nothing.
   */
  timeControlsDisabled?: boolean;
}>;

/**
 * Controlled Explore query controls. Keeping query state in the parent lets
 * the controls remain mounted while only the selected view below them changes.
 */
export default function ExploreFilters({
  value,
  options,
  onChange,
  onPreset,
  onSubmit,
  timeControlsDisabled = false,
}: Props) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="explore-filters" aria-label="フィルタ" onSubmit={submit}>
      <PeriodPicker
        from={value.from}
        to={value.to}
        onPreset={(from, to) => onPreset({ ...value, from, to })}
        onRange={(from, to) => onChange({ ...value, from, to })}
        disabled={timeControlsDisabled}
      />
      <label className="explore-field">
        <span>粒度</span>
        <select
          name="grain"
          value={value.grain}
          disabled={timeControlsDisabled}
          onChange={(event) => onChange({ ...value, grain: event.target.value as Grain })}
        >
          <option value="day">日</option>
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
      </label>
      <div className="explore-field">
        <span>Repos</span>
        <MultiSelect
          label="Repos"
          options={options.repos}
          selected={value.repos}
          onChange={(repos) => onChange({ ...value, repos })}
        />
      </div>
      <div className="explore-field">
        <span>Users</span>
        <MultiSelect
          label="Users"
          options={options.users}
          selected={value.users}
          onChange={(users) => onChange({ ...value, users })}
        />
      </div>
      <label className="explore-field">
        <span>Bot を含む</span>
        <input
          type="checkbox"
          name="includeBots"
          checked={value.includeBots}
          onChange={(event) => onChange({ ...value, includeBots: event.target.checked })}
        />
      </label>
      <button type="submit">更新</button>
    </form>
  );
}
