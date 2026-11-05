import { DayOff, Wish } from '../core/models';
import { addDays, formatDayShort, isoWeekday } from '../core/time';

/** Šta su radnici javili menadžeru: želje za smenu i slobodni dani koji još čekaju odluku. */
export interface Preferences {
  wishes: Wish[];
  pendingDayOffs: DayOff[];
}

export const NO_PREFERENCES: Preferences = { wishes: [], pendingDayOffs: [] };

/** Datumi ponavljajućeg rasporeda: od `from` do `until` (uključeno), samo za izabrane dane (1 = pon ... 7 = ned). */
export function recurringDates(from: string, until: string, weekdays: number[]): string[] {
  const dates: string[] = [];
  for (let date = from; date <= until && dates.length < 400; date = addDays(date, 1)) {
    if (weekdays.includes(isoWeekday(date))) {
      dates.push(date);
    }
  }
  return dates;
}

/**
 * Upozorenje za menadžera pre nego što radnika postavi u smenu, ili null kad nema šta da se upozori.
 * Želja ("I ili slobodan") se krši svakom drugom smenom, a zahtev za slobodan dan koji čeka odluku bilo kojom.
 * Odobren slobodan dan se ovde ne proverava: njega server ne dozvoljava.
 *
 * @param shiftName naziv smene (šablona), ili null za proizvoljno vreme
 */
export function preferenceWarning(
  preferences: Preferences,
  employeeId: string | null,
  dates: string[],
  shiftName: string | null,
): string | null {
  if (!employeeId) {
    return null;
  }

  const conflicts: { date: string; text: string }[] = [];
  for (const date of dates) {
    const dayOff = preferences.pendingDayOffs.find((d) => d.employeeId === employeeId && d.date === date);
    if (dayOff) {
      conflicts.push({ date, text: 'slobodan dan' });
      continue;
    }
    const wish = preferences.wishes.find((w) => w.employeeId === employeeId && w.date === date);
    if (wish && wish.preferredShift !== shiftName) {
      conflicts.push({ date, text: `slobodan dan ili smenu ${wish.preferredShift}` });
    }
  }

  if (conflicts.length === 0) {
    return null;
  }
  const question = 'Da li ste sigurni da želite da ga postavite u odabranu smenu?';
  if (conflicts.length === 1) {
    return `Radnik je zatražio ovaj dan: ${conflicts[0].text}. ${question}`;
  }
  const list = conflicts.slice(0, 5).map((c) => `${formatDayShort(c.date)} (${c.text})`).join(', ');
  const more = conflicts.length > 5 ? ` i još ${conflicts.length - 5}` : '';
  return `Radnik je za ${conflicts.length} od izabranih dana zatražio slobodan dan ili drugu smenu: ${list}${more}. ${question}`;
}
