// Pure date-window presets for the Explore period picker. Framework-free and
// unit-tested (the React picker only renders these). All bounds are UTC; weeks
// start Monday to match the report period convention.

export type DatePreset = Readonly<{ id: string; label: string; from: Date; to: Date }>;

const DAY_MS = 86_400_000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Quick-pick windows ending at `now` (injectable for tests). */
export function datePresets(now: Date): DatePreset[] {
  const to = now;
  const daysAgo = (n: number): Date => new Date(now.getTime() - n * DAY_MS);
  // Monday 00:00 UTC of the current week (getUTCDay: 0=Sun..6=Sat).
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const weekStart = startOfUtcDay(new Date(now.getTime() - mondayOffset * DAY_MS));
  return [
    { id: "this-week", label: "今週", from: weekStart, to },
    { id: "1m", label: "過去1ヶ月", from: daysAgo(30), to },
    { id: "3m", label: "過去3ヶ月", from: daysAgo(90), to },
    { id: "1y", label: "過去1年", from: daysAgo(365), to },
  ];
}
