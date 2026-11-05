import { describe, expect, it } from 'vitest';
import { addMonths, formatMonth, lastDayOfMonth, monthStart, monthWeeks } from './calendar';

describe('calendar', () => {
  it('moves between months across year boundaries', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-11-01', 0)).toBe('2026-11-01');
  });

  it('finds the first and last day of a month', () => {
    expect(monthStart('2026-11-18')).toBe('2026-11-01');
    expect(lastDayOfMonth('2026-02-01')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02-01')).toBe('2028-02-29');
  });

  it('builds Monday-first weeks and marks days outside the month', () => {
    // 1. novembar 2026. je nedelja: prva nedelja počinje ponedeljkom 26. oktobra.
    const weeks = monthWeeks('2026-11-01');
    expect(weeks[0][0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(weeks[0][6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(weeks.length).toBe(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.at(-1)?.at(-1)).toEqual({ date: '2026-12-06', inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it('does not add an empty trailing week', () => {
    // Februar 2027. počinje u ponedeljak i ima 28 dana: tačno 4 nedelje.
    expect(monthWeeks('2027-02-01')).toHaveLength(4);
  });

  it('formats the month name', () => {
    expect(formatMonth('2026-11-05')).toMatch(/^Novembar 2026/);
  });
});
