import { addDays, weekStart } from './time';

export interface CalendarDay {
  date: string;
  inMonth: boolean;
}

/** Prvi dan meseca ("YYYY-MM-01") u kome je dati datum. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Prvi dan sledećeg (ili prethodnog, sa negativnim brojem) meseca. */
export function addMonths(month: string, count: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

export function lastDayOfMonth(month: string): string {
  return addDays(addMonths(month, 1), -1);
}

/** Nedelje (pon-ned) koje pokrivaju mesec; dani van meseca su označeni da se prigušeno prikažu. */
export function monthWeeks(month: string): CalendarDay[][] {
  const first = monthStart(month);
  const last = lastDayOfMonth(first);
  const weeks: CalendarDay[][] = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return { date, inMonth: date.slice(0, 7) === first.slice(0, 7) };
    }));
  }
  return weeks;
}

const monthFormatter = new Intl.DateTimeFormat('sr-Latn', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** Npr. "Novembar 2026". */
export function formatMonth(month: string): string {
  const text = monthFormatter.format(new Date(`${monthStart(month)}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
