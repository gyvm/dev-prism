/**
 * Timezone-aware date utilities using Intl.DateTimeFormat.
 * No external dependencies required.
 */

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 1=Monday ... 7=Sunday (ISO 8601)
};

function getDateParts(date: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = new Map<string, string>();
  for (const { type, value } of formatter.formatToParts(date)) {
    parts.set(type, value);
  }

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));
  const hourRaw = parts.get("hour");
  const hour = Number(hourRaw === "24" ? "0" : hourRaw);
  const minute = Number(parts.get("minute"));
  const second = Number(parts.get("second"));

  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
    throw new Error(
      `Intl.DateTimeFormat did not return expected date parts for timezone "${timezone}". ` +
      `Got: year=${parts.get("year")}, month=${parts.get("month")}, day=${parts.get("day")}`,
    );
  }

  const weekdayStr = parts.get("weekday") ?? "";
  const weekday = weekdayMap[weekdayStr];
  if (weekday === undefined) {
    throw new Error(
      `Unexpected weekday abbreviation "${weekdayStr}" from Intl.DateTimeFormat for timezone "${timezone}". ` +
      `Expected one of: Mon, Tue, Wed, Thu, Fri, Sat, Sun`,
    );
  }

  return { year, month, day, hour, minute, second, weekday };
}

/**
 * Returns "YYYY-MM-DD" for the given date in the specified timezone.
 */
export function toDateSlug(date: Date, timezone: string): string {
  const { year, month, day } = getDateParts(date, timezone);
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Returns the UTC Date representing the start of Monday (00:00:00) in the
 * given timezone for the week containing the specified date.
 */
function getMondayInTz(date: Date, timezone: string): Date {
  const parts = getDateParts(date, timezone);
  // Days to subtract to get to Monday (weekday 1)
  const daysBack = parts.weekday - 1;

  // Build a Date for the target local date at 00:00:00 in UTC,
  // then adjust by the timezone offset.
  const localMidnight = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - daysBack, 0, 0, 0, 0),
  );

  // Find the actual UTC time for midnight in the target timezone
  // by checking what the timezone offset is at that approximate time.
  const candidateParts = getDateParts(localMidnight, timezone);
  const offsetMs =
    (candidateParts.hour * 3600 +
      candidateParts.minute * 60 +
      candidateParts.second) *
    1000;

  // If the candidate's local time is ahead of midnight, subtract the offset
  // If behind, the date rolled back — add a day's worth minus offset
  let monday = new Date(localMidnight.getTime() - offsetMs);

  // Verify and correct: ensure the result is actually Monday 00:00 in the tz
  const verifyParts = getDateParts(monday, timezone);
  if (verifyParts.hour !== 0 || verifyParts.minute !== 0) {
    // DST edge case: re-adjust
    const remainingOffsetMs =
      (verifyParts.hour * 3600 + verifyParts.minute * 60) * 1000;
    monday = new Date(monday.getTime() - remainingOffsetMs);

    // Final check: if DST spring-forward caused overshoot into previous day
    const finalParts = getDateParts(monday, timezone);
    if (finalParts.weekday !== 1) {
      // Rolled back to Sunday — push forward by 1 day
      monday = new Date(monday.getTime() + 86_400_000);
    }
  }

  return monday;
}

/**
 * Returns the Monday 00:00:00 and Sunday 23:59:59.999 (in the given timezone)
 * as UTC Dates for the ISO week containing the specified date.
 */
export function getWeekBoundaries(
  date: Date,
  timezone: string,
): { start: Date; end: Date } {
  const start = getMondayInTz(date, timezone);
  // Sunday 23:59:59.999 = Monday + 7 days - 1ms
  const end = new Date(start.getTime() + 7 * 86_400_000 - 1);
  return { start, end };
}

/**
 * Validates that a string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}
