import { getWeekBoundaries, toDateSlug } from "../shared/timezone.js";

export type Period = Readonly<{
  id: string;
  start: Date;
  end: Date;
}>;

export function periodForDate(now: Date, timezone: string): Period {
  const { start, end } = getWeekBoundaries(now, timezone);
  return { id: toDateSlug(start, timezone), start, end };
}
