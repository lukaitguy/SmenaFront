import { describe, expect, it } from 'vitest';
import { DayOff, Wish } from '../core/models';
import { Preferences, preferenceWarning, recurringDates } from './preference-warning';

const wish = (employeeId: string, date: string, preferredShift: string): Wish => ({
  id: `${employeeId}-${date}`, employeeId, employeeName: 'x', date, preferredShift, createdAt: '2026-11-01T00:00:00Z',
});
const dayOff = (employeeId: string, date: string): DayOff => ({
  id: `${employeeId}-${date}`, status: 'Pending', date, employeeId, employeeName: 'x', reason: null,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
});

const prefs: Preferences = {
  wishes: [wish('ana', '2026-11-13', 'I')],
  pendingDayOffs: [dayOff('ana', '2026-11-12'), dayOff('marko', '2026-11-13')],
};

describe('preferenceWarning', () => {
  it('stays quiet when the shift is the wished one', () => {
    expect(preferenceWarning(prefs, 'ana', ['2026-11-13'], 'I')).toBeNull();
  });

  it('warns when the employee is put into another shift than the wished one', () => {
    const text = preferenceWarning(prefs, 'ana', ['2026-11-13'], 'II');
    expect(text).toContain('slobodan dan ili smenu I');
    expect(text).toContain('Da li ste sigurni');
  });

  it('treats a custom time as a different shift', () => {
    expect(preferenceWarning(prefs, 'ana', ['2026-11-13'], null)).not.toBeNull();
  });

  it('warns for a day off still waiting for a decision, whatever the shift', () => {
    expect(preferenceWarning(prefs, 'ana', ['2026-11-12'], 'I')).toContain('slobodan dan');
  });

  it('ignores other employees, other days and open shifts', () => {
    expect(preferenceWarning(prefs, 'nemanja', ['2026-11-13'], 'II')).toBeNull();
    expect(preferenceWarning(prefs, 'ana', ['2026-11-14'], 'II')).toBeNull();
    expect(preferenceWarning(prefs, null, ['2026-11-13'], 'II')).toBeNull();
  });

  it('summarises several conflicting days of a recurring schedule', () => {
    const text = preferenceWarning(prefs, 'ana', ['2026-11-12', '2026-11-13', '2026-11-14'], 'II');
    expect(text).toContain('za 2 od izabranih dana');
  });
});

describe('recurringDates', () => {
  it('lists the chosen weekdays between the dates, inclusive', () => {
    // 2.11.2026. je ponedeljak.
    expect(recurringDates('2026-11-02', '2026-11-16', [1, 3])).toEqual([
      '2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16',
    ]);
  });
});
