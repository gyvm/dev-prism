export function formatHours(value: number | null): string {
  if (value === null) return "N/A";
  if (value < 1) return `${Math.round(value * 60)}分`;
  return `${Math.round(value * 10) / 10}h`;
}
