import { useState } from "react";
import {
  Button,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DateRangePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  I18nProvider,
  Popover,
  RangeCalendar,
  type DateValue,
  type RangeValue,
} from "react-aria-components";
import { CalendarDate } from "@internationalized/date";

import { datePresets } from "../date-presets.js";

type Props = Readonly<{
  from: Date | null;
  to: Date | null;
  /** A preset is a complete window → apply immediately. */
  onPreset: (from: Date, to: Date) => void;
  /** Calendar edits update the draft; applied on the form's 更新 button. */
  onRange: (from: Date | null, to: Date | null) => void;
}>;

// The app models periods as UTC day boundaries (Date.toISOString().slice(0,10)),
// so convert on the UTC fields to keep the displayed calendar day stable across
// the viewer's timezone.
function toCalendar(date: Date | null): CalendarDate | null {
  return date
    ? new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    : null;
}

function fromCalendar(date: DateValue): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

export default function PeriodPicker({ from, to, onPreset, onRange }: Props) {
  // `now` is read once per mount; presets are relative windows.
  const [presets] = useState(() => datePresets(new Date()));
  const start = toCalendar(from);
  const end = toCalendar(to);
  const value: RangeValue<CalendarDate> | null = start && end ? { start, end } : null;

  return (
    <I18nProvider locale="ja-JP">
      <div className="explore-period">
        <div className="explore-presets" role="group" aria-label="期間プリセット">
        {presets.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className="explore-preset"
            onClick={() => onPreset(preset.from, preset.to)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <DateRangePicker
        className="rac-daterange"
        aria-label="期間"
        value={value}
        onChange={(range) =>
          range ? onRange(fromCalendar(range.start), fromCalendar(range.end)) : onRange(null, null)
        }
      >
        <Group className="rac-group">
          <DateInput slot="start" className="rac-dateinput">
            {(segment) => <DateSegment segment={segment} className="rac-segment" />}
          </DateInput>
          <span aria-hidden="true" className="rac-dash">
            〜
          </span>
          <DateInput slot="end" className="rac-dateinput">
            {(segment) => <DateSegment segment={segment} className="rac-segment" />}
          </DateInput>
          <Button className="rac-calbtn" aria-label="カレンダーを開く">
            📅
          </Button>
        </Group>
        <Popover className="rac-popover" placement="bottom start">
          <Dialog className="rac-dialog">
            <RangeCalendar className="rac-calendar" firstDayOfWeek="mon" visibleDuration={{ months: 2 }}>
              <header className="rac-calheader">
                <Button slot="previous" className="rac-navbtn" aria-label="前月">
                  ‹
                </Button>
                <Heading className="rac-calheading" />
                <Button slot="next" className="rac-navbtn" aria-label="翌月">
                  ›
                </Button>
              </header>
              <div className="rac-calgrids">
                <CalendarGrid className="rac-calgrid">
                  {(date) => <CalendarCell date={date} className="rac-calcell" />}
                </CalendarGrid>
                <CalendarGrid className="rac-calgrid" offset={{ months: 1 }}>
                  {(date) => <CalendarCell date={date} className="rac-calcell" />}
                </CalendarGrid>
              </div>
            </RangeCalendar>
          </Dialog>
        </Popover>
      </DateRangePicker>
      </div>
    </I18nProvider>
  );
}
