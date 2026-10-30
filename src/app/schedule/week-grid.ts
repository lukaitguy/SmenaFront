import { Component, computed, input, output } from '@angular/core';
import { PositionColor, positionColor } from '../core/colors';
import { Shift } from '../core/models';
import { formatDayShort, isoWeekday, utcToLocal } from '../core/time';

export interface GridRow {
  /** Id zaposlenog; null je red otvorenih smena. */
  id: string | null;
  label: string;
  hint?: string;
}

interface ShiftView {
  shift: Shift;
  from: string;
  to: string;
  nextDay: boolean;
  draft: boolean;
  color: PositionColor;
}

/**
 * Nedeljna mreža: redovi su zaposleni (plus red otvorenih smena), kolone su dani.
 * Prikazna komponenta: ne zna odakle su podaci i šta se radi sa klikovima.
 */
@Component({
  selector: 'app-week-grid',
  template: `
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="grid min-w-[62rem]" style="grid-template-columns: 11rem repeat(7, minmax(8.5rem, 1fr))">
        <div class="sticky left-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Zaposleni
        </div>
        @for (day of days(); track day) {
          <div
            class="border-b border-l border-slate-200 px-2 py-2 text-center"
            [class]="day === today() ? 'bg-brand-50' : isWeekend(day) ? 'bg-slate-100/70' : 'bg-slate-50'"
          >
            <div class="text-xs font-medium" [class]="day === today() ? 'text-brand-700' : 'text-slate-600'">
              {{ dayLabel(day) }}
            </div>
            @if (day === today()) {
              <div class="text-[10px] font-semibold uppercase tracking-wide text-brand-600">danas</div>
            }
          </div>
        }

        @for (row of rows(); track row.id ?? 'open') {
          <div
            class="sticky left-0 z-10 flex flex-col justify-center border-b border-slate-100 px-3 py-2"
            [class]="
              row.id === null ? 'bg-amber-50' : row.id === highlightId() ? 'bg-brand-50' : 'bg-white'
            "
          >
            <span class="truncate text-sm font-medium" [class]="row.id === null ? 'text-amber-900' : 'text-slate-900'">
              {{ row.label }}
            </span>
            @if (row.hint) {
              <span class="truncate text-xs text-slate-500">{{ row.hint }}</span>
            }
          </div>

          @for (day of days(); track day) {
            <div
              class="group relative flex min-h-[4.25rem] flex-col gap-1 border-b border-l border-slate-100 p-1.5"
              [class]="
                row.id === null
                  ? 'bg-amber-50/40'
                  : row.id === highlightId()
                    ? 'bg-brand-50/50'
                    : isWeekend(day)
                      ? 'bg-slate-50/70'
                      : 'bg-white'
              "
            >
              @for (view of cell(row.id, day); track view.shift.id) {
                <button
                  type="button"
                  class="w-full rounded-md border px-2 py-1 text-left text-xs leading-tight shadow-sm transition hover:shadow"
                  [class]="view.color.chip + (view.draft && editable() ? ' border-dashed opacity-90' : '')"
                  [attr.aria-label]="(view.shift.templateName ? view.shift.templateName + ' smena, ' : '') + view.from + ' do ' + view.to + ', ' + view.shift.positionName"
                  (click)="openShift.emit(view.shift)"
                >
                  <span class="flex items-center justify-between gap-1">
                    @if (view.shift.templateName) {
                      <span class="flex items-baseline gap-1.5">
                        <span class="text-sm font-bold leading-none">{{ view.shift.templateName }}</span>
                        <span class="text-[11px] tabular-nums opacity-70">{{ view.from }}–{{ view.to }}@if (view.nextDay) {<sup class="ml-0.5">+1</sup>}</span>
                      </span>
                    } @else {
                      <span class="font-semibold tabular-nums">{{ view.from }}–{{ view.to }}@if (view.nextDay) {<sup class="ml-0.5">+1</sup>}</span>
                    }
                    @if (view.draft && editable()) {
                      <span class="rounded bg-white/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">nacrt</span>
                    }
                  </span>
                  <span class="mt-0.5 block truncate opacity-80">{{ view.shift.positionName }}</span>
                  @if (view.shift.note) {
                    <span class="mt-0.5 block truncate italic opacity-70">{{ view.shift.note }}</span>
                  }
                </button>
              }

              @if (editable()) {
                <button
                  type="button"
                  class="mt-auto grid h-6 w-full place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                  [attr.aria-label]="'Dodaj smenu: ' + row.label + ', ' + dayLabel(day)"
                  (click)="addShift.emit({ employeeId: row.id, date: day })"
                >
                  <svg viewBox="0 0 20 20" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z" />
                  </svg>
                </button>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class WeekGrid {
  readonly days = input.required<string[]>();
  readonly rows = input.required<GridRow[]>();
  readonly shifts = input.required<Shift[]>();
  readonly timeZone = input.required<string>();
  readonly today = input.required<string>();
  readonly editable = input(false);
  /** Red koji se naglašava (npr. prijavljeni zaposleni). */
  readonly highlightId = input<string | null>(null);

  readonly addShift = output<{ employeeId: string | null; date: string }>();
  readonly openShift = output<Shift>();

  private readonly cells = computed(() => {
    const timeZone = this.timeZone();
    const map = new Map<string, ShiftView[]>();
    for (const shift of this.shifts()) {
      const start = utcToLocal(shift.startsAt, timeZone);
      const end = utcToLocal(shift.endsAt, timeZone);
      const key = `${shift.employeeId ?? ''}|${start.date}`;
      const view: ShiftView = {
        shift,
        from: start.time,
        to: end.time,
        nextDay: end.date !== start.date && end.time !== '00:00',
        draft: shift.publishedAt === null,
        color: positionColor(shift.positionName),
      };
      const list = map.get(key);
      if (list) {
        list.push(view);
      } else {
        map.set(key, [view]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.from.localeCompare(b.from));
    }
    return map;
  });

  protected cell(rowId: string | null, date: string): ShiftView[] {
    return this.cells().get(`${rowId ?? ''}|${date}`) ?? [];
  }

  protected dayLabel(day: string): string {
    return formatDayShort(day);
  }

  protected isWeekend(day: string): boolean {
    return isoWeekday(day) >= 6;
  }
}
