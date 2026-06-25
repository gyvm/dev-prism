export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Report-wide convention is hours (the Flow Snapshot narrative, AI sections, and
// PR candidate metrics all read in hours), so DORA cards stay in hours too rather
// than switching to days above 24h — keeps the lead-time figure consistent across
// the whole report. Mirrors the dev-prism-summary formatHours.
export function formatHours(value: number | null): string {
  if (value === null) return "N/A";
  if (value < 1) return `${Math.round(value * 60)}分`;
  return `${Math.round(value * 10) / 10}h`;
}
