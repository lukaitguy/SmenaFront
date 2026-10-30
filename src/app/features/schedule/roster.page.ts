import { Component, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { positionColor, positionsLabel } from '../../core/colors';
import { Shift } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { addDays, formatWeekRange, localToUtc, todayIn, utcToLocal, weekDays, weekStart } from '../../core/time';
import { GridRow, WeekGrid } from '../../schedule/week-grid';

/** Objavljen raspored uloga prijavljenog zaposlenog (samo pregled). */
@Component({
  selector: 'app-roster-page',
  imports: [WeekGrid],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Raspored</h1>
        <p class="text-sm text-slate-500">Objavljeni raspored tvoje uloge: {{ rolesLabel() }}.</p>
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="flex items-center rounded-lg border border-slate-300 bg-white shadow-sm">
          <button type="button" class="px-3 py-2 text-slate-600 hover:bg-slate-50" aria-label="Prethodna nedelja" (click)="shiftWeek(-1)">‹</button>
          <span class="min-w-44 px-2 text-center text-sm font-medium tabular-nums">{{ weekLabel() }}</span>
          <button type="button" class="px-3 py-2 text-slate-600 hover:bg-slate-50" aria-label="Sledeća nedelja" (click)="shiftWeek(1)">›</button>
        </div>
        <button type="button" class="btn-secondary" [disabled]="isCurrentWeek()" (click)="goToday()">Ova nedelja</button>
      </div>
    </div>

    @if (positions().length > 1) {
      <div class="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter po ulozi">
        <button type="button" class="rounded-full border px-3 py-1 text-sm font-medium transition" [class]="chipClass(filter() === 'all')" (click)="filter.set('all')">
          Sve moje uloge
        </button>
        @for (position of positions(); track position.id) {
          <button type="button" class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition" [class]="chipClass(filter() === position.id)" (click)="filter.set(position.id)">
            <span class="h-2 w-2 rounded-full" [class]="color(position.name).dot"></span>
            {{ position.name }}
          </button>
        }
      </div>
    }

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="reload()">Pokušaj ponovo</button>
      </div>
    }

    @if (positions().length === 0) {
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        Još nisi dodeljen nijednoj poziciji, pa nema rasporeda za prikaz. Javi se menadžeru.
      </div>
    } @else {
      <div [class]="loading() ? 'opacity-60 transition' : 'transition'">
        <app-week-grid
          [days]="days()"
          [rows]="rows()"
          [shifts]="weekShifts()"
          [timeZone]="timeZone()"
          [today]="today()"
          [highlightId]="myId()"
        />
      </div>
      @if (!loading() && weekShifts().length === 0) {
        <p class="mt-3 text-sm text-slate-500">Za ovu nedelju još nema objavljenog rasporeda.</p>
      }
    }
  `,
})
export class RosterPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);

  protected readonly timeZone = this.auth.timeZone;
  protected readonly myId = computed(() => this.auth.user()?.employeeId ?? null);
  protected readonly positions = computed(() => this.auth.user()?.positions ?? []);
  protected readonly today = computed(() => todayIn(this.timeZone()));
  protected readonly start = signal(weekStart(todayIn(this.auth.timeZone())));
  protected readonly days = computed(() => weekDays(this.start()));
  protected readonly weekLabel = computed(() => formatWeekRange(this.start()));
  protected readonly isCurrentWeek = computed(() => this.start() === weekStart(this.today()));
  protected readonly rolesLabel = computed(() => this.positions().map((p) => p.name).join(', ') || 'nema uloge');

  protected readonly filter = signal<string>('all');
  protected readonly shifts = signal<Shift[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly weekShifts = computed(() => {
    const days = new Set(this.days());
    const filter = this.filter();
    return this.shifts().filter(
      (s) => days.has(utcToLocal(s.startsAt, this.timeZone()).date) && (filter === 'all' || s.positionId === filter),
    );
  });

  /** Redovi su zaposleni koji rade u ovoj nedelji (moj red prvi), plus otvorene smene. */
  protected readonly rows = computed<GridRow[]>(() => {
    const people = new Map<string, string>();
    const roles = new Map<string, Set<string>>();
    for (const shift of this.weekShifts()) {
      if (shift.employeeId && shift.employeeName) {
        people.set(shift.employeeId, shift.employeeName);
        roles.set(shift.employeeId, (roles.get(shift.employeeId) ?? new Set()).add(shift.positionName));
      }
    }
    const me = this.myId();
    const sorted = [...people.entries()].sort(([a, an], [b, bn]) => (a === me ? -1 : b === me ? 1 : an.localeCompare(bn, 'sr-Latn')));
    // Ko je u nedelji radio više uloga, ispod imena piše npr. "Konobar/Šanker".
    const rows: GridRow[] = sorted.map(([id, name]) => ({
      id,
      label: id === me ? `${name} (ti)` : name,
      hint: positionsLabel([...(roles.get(id) ?? [])].sort((a, b) => a.localeCompare(b, 'sr-Latn'))),
    }));
    if (this.weekShifts().some((s) => s.employeeId === null)) {
      rows.push({ id: null, label: 'Otvorene smene', hint: 'traži ih kod menadžera' });
    }
    return rows;
  });

  private requestCounter = 0;

  constructor() {
    effect(() => {
      void this.load(this.start());
    });
  }

  protected color(name: string) {
    return positionColor(name);
  }

  protected chipClass(active: boolean): string {
    return active
      ? 'border-brand-600 bg-brand-600 text-white'
      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  }

  protected shiftWeek(delta: number): void {
    this.start.update((start) => addDays(start, delta * 7));
  }

  protected goToday(): void {
    this.start.set(weekStart(this.today()));
  }

  protected reload(): void {
    void this.load(this.start());
  }

  private async load(start: string): Promise<void> {
    const request = ++this.requestCounter;
    this.loading.set(true);
    this.error.set('');
    try {
      const timeZone = this.timeZone();
      const shifts = await this.api.roster(localToUtc(start, '00:00', timeZone), localToUtc(addDays(start, 7), '00:00', timeZone));
      if (request === this.requestCounter) {
        this.shifts.set(shifts);
      }
    } catch (e) {
      if (request === this.requestCounter) {
        this.error.set(errorMessage(e));
      }
    } finally {
      if (request === this.requestCounter) {
        this.loading.set(false);
      }
    }
  }
}
