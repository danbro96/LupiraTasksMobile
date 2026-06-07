// Lightweight due-date helpers. Quick-pick chips avoid pulling in a native date-picker
// dependency (which would force a fresh native build); good enough for a family task app.

const DAY_MS = 86_400_000;

function atEndOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** ISO for end-of-day, `days` from today (0 = today, 1 = tomorrow, …). */
export function dueInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return atEndOfLocalDay(d).toISOString();
}

/** ISO for end-of-day on the next upcoming Saturday. */
export function dueNextWeekend(): string {
  const d = new Date();
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7; // always 1..7 ahead
  d.setDate(d.getDate() + daysUntilSat);
  return atEndOfLocalDay(d).toISOString();
}

/** Human label for a due date, plus whether it's past. Null when there's no due date. */
export function formatDue(iso: string | null | undefined): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay.getTime() - startToday.getTime()) / DAY_MS);

  let label: string;
  if (diffDays === 0) label = 'Today';
  else if (diffDays === 1) label = 'Tomorrow';
  else if (diffDays === -1) label = 'Yesterday';
  else label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return { label, overdue: due.getTime() < now.getTime() };
}
