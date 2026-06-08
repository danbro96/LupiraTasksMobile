import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dueInDays, dueNextWeekend, dueOnDate, formatDue } from './dueDate';

// Fixed "now" = noon on Wed 2026-06-10 (local), away from midnight so day-boundary math is stable.
describe('dueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('labels today / tomorrow / yesterday relative to now', () => {
    expect(formatDue(dueInDays(0))?.label).toBe('Today');
    expect(formatDue(dueInDays(1))?.label).toBe('Tomorrow');
    expect(formatDue(dueInDays(-1))?.label).toBe('Yesterday');
  });

  it('flags past due dates as overdue, future ones as not', () => {
    expect(formatDue(dueInDays(-1))?.overdue).toBe(true);
    expect(formatDue(dueInDays(5))?.overdue).toBe(false);
    expect(formatDue(dueInDays(0))?.overdue).toBe(false); // end of today is still ahead of noon
  });

  it('returns null when there is no due date', () => {
    expect(formatDue(null)).toBeNull();
    expect(formatDue(undefined)).toBeNull();
    expect(formatDue('not-a-date')).toBeNull();
  });

  it('dueOnDate returns end-of-day on the given date', () => {
    // 10 days ahead of the fixed now (2026-06-10): not overdue, and shown as a calendar date
    // (locale-formatted, so assert it's not one of the relative labels rather than an exact string).
    const r = formatDue(dueOnDate(new Date(2026, 5, 20, 9, 0, 0)));
    expect(r).not.toBeNull();
    expect(r!.overdue).toBe(false);
    expect(['Today', 'Tomorrow', 'Yesterday']).not.toContain(r!.label);
    expect(r!.label.length).toBeGreaterThan(0);
  });

  it('dueNextWeekend lands on a Saturday within the next week', () => {
    const iso = dueNextWeekend();
    const d = new Date(iso);
    expect(d.getDay()).toBe(6); // Saturday
    const aheadDays = (d.getTime() - new Date(2026, 5, 10, 12, 0, 0).getTime()) / 86_400_000;
    expect(aheadDays).toBeGreaterThan(0);
    expect(aheadDays).toBeLessThanOrEqual(7);
  });
});
