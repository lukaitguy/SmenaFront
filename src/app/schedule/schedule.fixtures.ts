import { Employee, Position, Shift, ShiftTemplate } from '../core/models';

/** Zajednički podaci za testove komponenti rasporeda. */
export const WAITER: Position = { id: 'p-waiter', name: 'Konobar' };
export const BARTENDER: Position = { id: 'p-bartender', name: 'Šanker' };

export const FIRST: ShiftTemplate = {
  id: 't-first',
  positionId: WAITER.id,
  positionName: 'Konobar',
  name: 'I',
  startTime: '08:00:00',
  endTime: '16:00:00',
  endsNextDay: false,
};

export const SECOND: ShiftTemplate = {
  id: 't-second',
  positionId: WAITER.id,
  positionName: 'Konobar',
  name: 'II',
  startTime: '16:00:00',
  endTime: '00:00:00',
  endsNextDay: true,
};

export const ANA: Employee = {
  id: 'e-ana',
  firstName: 'Ana',
  lastName: 'Petrović',
  role: 'Staff',
  status: 'Active',
  positions: [WAITER],
};

export const NEMANJA: Employee = {
  id: 'e-nemanja',
  firstName: 'Nemanja',
  lastName: 'Popović',
  role: 'Staff',
  status: 'Active',
  positions: [BARTENDER],
};

export function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 's-1',
    employeeId: ANA.id,
    employeeName: 'Ana Petrović',
    positionId: WAITER.id,
    positionName: 'Konobar',
    startsAt: '2026-11-02T07:00:00+00:00', // 08:00 po lokalnom (zima, +01:00)
    endsAt: '2026-11-02T15:00:00+00:00',
    note: null,
    seriesId: null,
    publishedAt: '2026-10-30T10:00:00+00:00',
    templateId: null,
    templateName: null,
    ...overrides,
  };
}
