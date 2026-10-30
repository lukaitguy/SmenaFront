/**
 * Rad sa vremenom u zoni restorana. API čuva i vraća trenutke u UTC-u, a raspored se prikazuje i
 * zadaje po lokalnom vremenu restorana, pa se sve konverzije rade ovde.
 *
 * Datumi su stringovi "YYYY-MM-DD" (kalendarski dan, bez zone), a vreme je "HH:mm".
 * Datoteka koristi samo sintaksu koja se može ukloniti (bez enum-a), da je može učitati i Node skripta.
 */

const MS_PER_DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Zidni sat u zoni, kao da je UTC (za računanje pomaka). */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  return Date.UTC(values['year'], values['month'] - 1, values['day'], values['hour'], values['minute'], values['second']);
}

/** Lokalni datum i vreme (u zoni) za dati trenutak. */
export function utcToLocal(instant: Date | string, timeZone: string): { date: string; time: string } {
  const moment = typeof instant === 'string' ? new Date(instant) : instant;
  const wall = new Date(wallClockAsUtc(moment, timeZone));
  const iso = wall.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Trenutak (UTC) u kojem je zidni sat u zoni pokazivao dati datum i vreme. */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);

  // Pomak zone zavisi od trenutka, pa se približavamo u par koraka (važno oko promene sata).
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const offset = wallClockAsUtc(new Date(guess), timeZone) - guess;
    const next = wanted - offset;
    if (next === guess) {
      break;
    }
    guess = next;
  }
  return new Date(guess);
}

/** "16:00:00" -> "16:00" (API vraća sekunde, a polja za vreme rade sa HH:mm). */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return utcToLocal(now, timeZone).date;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 1 = ponedeljak ... 7 = nedelja. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Ponedeljak nedelje u kojoj je dati datum. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const API_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Ime dana u nedelji kako ga očekuje API (System.DayOfWeek) za dan 1 (ponedeljak) do 7 (nedelja). */
export function apiWeekdayName(weekday: number): string {
  return API_DAY_NAMES[weekday - 1];
}

/** Isto, za kalendarski datum. */
export function apiDayName(date: string): string {
  return apiWeekdayName(isoWeekday(date));
}

const dayFormatter = new Intl.DateTimeFormat('sr-Latn', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' });
const longFormatter = new Intl.DateTimeFormat('sr-Latn', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const monthFormatter = new Intl.DateTimeFormat('sr-Latn', { timeZone: 'UTC', day: 'numeric', month: 'short' });

function asUtcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Npr. "Pon, 26. 10." */
export function formatDayShort(date: string): string {
  return capitalize(dayFormatter.format(asUtcNoon(date)));
}

/** Npr. "Ponedeljak, 26. oktobar" */
export function formatDayLong(date: string): string {
  return capitalize(longFormatter.format(asUtcNoon(date)));
}

/** Npr. "26. okt - 1. nov 2026". */
export function formatWeekRange(start: string): string {
  const end = addDays(start, 6);
  const year = end.slice(0, 4);
  return `${monthFormatter.format(asUtcNoon(start))} - ${monthFormatter.format(asUtcNoon(end))} ${year}`;
}

/** Trajanje u satima, npr. "8 h" ili "8,5 h". */
export function formatDuration(startsAt: string, endsAt: string): string {
  const hours = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} h`;
}
