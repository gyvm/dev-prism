import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

import { datePresets } from "../date-presets.js";

type Props = Readonly<{
  from: Date | null;
  to: Date | null;
  /** A preset is a complete window → apply immediately. */
  onPreset: (from: Date, to: Date) => void;
  /** Calendar edits update the draft; applied on the form's 更新 button. */
  onRange: (from: Date | null, to: Date | null) => void;
}>;

function label(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

export default function PeriodPicker({ from, to, onPreset, onRange }: Props) {
  const [open, setOpen] = useState(false);
  // `now` is read once per mount; presets are relative windows.
  const [presets] = useState(() => datePresets(new Date()));
  const selected: DateRange | undefined = from ? { from, to: to ?? undefined } : undefined;

  return (
    <div className="explore-period">
      <div className="explore-presets" role="group" aria-label="期間プリセット">
        {presets.map((preset) => (
          <button type="button" key={preset.id} className="explore-preset" onClick={() => onPreset(preset.from, preset.to)}>
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="explore-preset explore-preset--cal"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          📅 {label(from)} 〜 {label(to)}
        </button>
      </div>
      {open && (
        <div className="explore-calendar">
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={(range) => onRange(range?.from ?? null, range?.to ?? null)}
            numberOfMonths={2}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}
