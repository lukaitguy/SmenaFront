import { formatDayShort, utcToLocal } from './time';

/** Smena u jednom redu, u zoni restorana: "Pet, 13. 11. · 16:00–00:00". */
export function describeShift(startsAt: string, endsAt: string, timeZone: string): string {
  const start = utcToLocal(startsAt, timeZone);
  const end = utcToLocal(endsAt, timeZone);
  return `${formatDayShort(start.date)} · ${start.time}–${end.time}`;
}

export const SWAP_LABELS = {
  Pending: 'Čeka kolegu',
  Accepted: 'Čeka menadžera',
  Declined: 'Kolega je odbio',
  Approved: 'Odobreno',
  Rejected: 'Menadžer je odbio',
  Cancelled: 'Povučeno',
} as const;

export const CLAIM_LABELS = {
  Pending: 'Čeka menadžera',
  Approved: 'Odobreno',
  Rejected: 'Odbijeno',
  Cancelled: 'Povučeno',
} as const;
