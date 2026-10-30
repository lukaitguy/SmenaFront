import { describe, expect, it } from 'vitest';
import {
  addDays,
  apiDayName,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatWeekRange,
  isoWeekday,
  localToUtc,
  todayIn,
  utcToLocal,
  weekDays,
  weekStart,
} from './time';

const BELGRADE = 'Europe/Belgrade';

describe('calendar dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('numbers weekdays from Monday = 1 to Sunday = 7', () => {
    expect(isoWeekday('2026-11-02')).toBe(1); // ponedeljak
    expect(isoWeekday('2026-11-08')).toBe(7); // nedelja
  });

  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-04')).toBe('2026-11-02');
  });

  it('lists the seven days of a week', () => {
    const days = weekDays('2026-11-02');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-11-02');
    expect(days[6]).toBe('2026-11-08');
  });

  it('names weekdays the way the API expects them', () => {
    expect(apiDayName('2026-11-02')).toBe('Monday');
    expect(apiDayName('2026-11-08')).toBe('Sunday');
  });

  it('formats a week range', () => {
    expect(formatWeekRange('2026-10-26')).toContain('2026');
  });
});

describe('restaurant time zone', () => {
  it('converts local wall time to UTC in winter (+01:00)', () => {
    expect(localToUtc('2026-11-02', '08:00', BELGRADE).toISOString()).toBe('2026-11-02T07:00:00.000Z');
  });

  it('converts local wall time to UTC in summer (+02:00)', () => {
    expect(localToUtc('2026-07-15', '08:00', BELGRADE).toISOString()).toBe('2026-07-15T06:00:00.000Z');
  });

  it('keeps the same local hour across the autumn clock change', () => {
    // 25.10.2026. vraćanje na zimsko vreme
    expect(localToUtc('2026-10-24', '08:00', BELGRADE).toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(localToUtc('2026-10-26', '08:00', BELGRADE).toISOString()).toBe('2026-10-26T07:00:00.000Z');
  });

  it('keeps the same local hour across the spring clock change', () => {
    // 29.03.2026. prelazak na letnje vreme
    expect(localToUtc('2026-03-28', '08:00', BELGRADE).toISOString()).toBe('2026-03-28T07:00:00.000Z');
    expect(localToUtc('2026-03-30', '08:00', BELGRADE).toISOString()).toBe('2026-03-30T06:00:00.000Z');
  });

  it('converts a UTC instant back to local date and time', () => {
    expect(utcToLocal('2026-11-02T07:00:00+00:00', BELGRADE)).toEqual({ date: '2026-11-02', time: '08:00' });
  });

  it('puts late UTC evenings on the next local day', () => {
    expect(utcToLocal('2026-11-02T23:30:00Z', BELGRADE)).toEqual({ date: '2026-11-03', time: '00:30' });
  });

  it('round-trips local time through UTC', () => {
    for (const [date, time] of [
      ['2026-11-02', '22:00'],
      ['2026-07-15', '06:30'],
      ['2027-01-01', '00:00'],
    ]) {
      const back = utcToLocal(localToUtc(date, time, BELGRADE), BELGRADE);
      expect(back).toEqual({ date, time });
    }
  });

  it('works for a zone without daylight saving time', () => {
    expect(localToUtc('2026-07-15', '08:00', 'UTC').toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('tells which calendar day it is in the restaurant zone, not in UTC', () => {
    const lateEveningUtc = new Date('2026-11-02T23:30:00Z');
    expect(todayIn(BELGRADE, lateEveningUtc)).toBe('2026-11-03');
    expect(todayIn('UTC', lateEveningUtc)).toBe('2026-11-02');
  });
});

describe('durations', () => {
  it('formats whole and half hours', () => {
    expect(formatDuration('2026-11-02T07:00:00Z', '2026-11-02T15:00:00Z')).toBe('8 h');
    expect(formatDuration('2026-11-02T07:00:00Z', '2026-11-02T15:30:00Z')).toBe('8,5 h');
  });
});

describe('day labels', () => {
  it('start with a capital letter', () => {
    expect(formatDayLong('2026-11-02')[0]).toBe('P');
    expect(formatDayShort('2026-11-02')[0]).toBe('P');
  });
});
