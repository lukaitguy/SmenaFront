import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { positionColor } from '../../core/colors';
import { Shift } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { ToastService } from '../../ui/toast';
import { SwapDialog } from '../swaps/swap-dialog';
import { addDays, formatDayLong, formatDuration, localToUtc, todayIn, utcToLocal } from '../../core/time';

interface DayGroup {
  date: string;
  isToday: boolean;
  shifts: { shift: Shift; from: string; to: string; nextDay: boolean }[];
}

const HORIZON_DAYS = 30;

/** "Moje smene": objavljene smene prijavljenog zaposlenog u narednih 30 dana, po danima. */
@Component({
  selector: 'app-my-shifts-page',
  imports: [SwapDialog],
  template: `
    <div class="mb-5">
      <h1 class="text-xl font-semibold tracking-tight">Moje smene</h1>
      <p class="text-sm text-slate-500">Narednih {{ horizon }} dana.</p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    @if (next(); as upcoming) {
      <section class="mb-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg">
        <p class="text-xs font-medium uppercase tracking-wider text-brand-100">Sledeća smena</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">
          @if (upcoming.shift.templateName) {
            <span class="mr-2 rounded-lg bg-white/20 px-2 py-0.5">{{ upcoming.shift.templateName }}</span>
          }
          {{ upcoming.from }}–{{ upcoming.to }}
        </p>
        <p class="mt-0.5 text-brand-100">
          {{ dayLabel(upcoming.date) }} · {{ upcoming.shift.positionName }} · {{ duration(upcoming.shift) }}
        </p>
      </section>
    }

    @if (loading() && groups().length === 0) {
      <p class="text-sm text-slate-500">Učitavanje…</p>
    } @else if (groups().length === 0 && !error()) {
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p class="font-medium text-slate-700">Nemaš objavljenih smena u narednih {{ horizon }} dana.</p>
        <p class="mt-1 text-sm text-slate-500">Kad menadžer objavi raspored, smene će se pojaviti ovde.</p>
      </div>
    } @else {
      <ol class="space-y-5">
        @for (group of groups(); track group.date) {
          <li>
            <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              {{ dayLabel(group.date) }}
              @if (group.isToday) {
                <span class="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">danas</span>
              }
            </h2>
            <ul class="space-y-2">
              @for (item of group.shifts; track item.shift.id) {
                <li class="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm" [class]="color(item.shift).chip">
                  @if (item.shift.templateName) {
                    <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/80 text-lg font-bold">
                      {{ item.shift.templateName }}
                    </div>
                  }
                  <div class="text-lg font-semibold tabular-nums">
                    {{ item.from }}–{{ item.to }}@if (item.nextDay) {<sup class="ml-0.5 text-xs">+1</sup>}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium">{{ item.shift.positionName }}</div>
                    @if (item.shift.note) {
                      <div class="truncate text-sm italic opacity-75">{{ item.shift.note }}</div>
                    }
                  </div>
                  <div class="text-sm opacity-75">{{ duration(item.shift) }}</div>
                  @if (canSwap(item.shift)) {
                    <button type="button" class="btn-secondary shrink-0 px-3 py-1.5" (click)="swapping.set(item.shift)">Zameni</button>
                  }
                </li>
              }
            </ul>
          </li>
        }
      </ol>
    }

    @if (swapping(); as shift) {
      <app-swap-dialog [shift]="shift" (sent)="onSwapSent($event)" (closed)="swapping.set(null)" />
    }
  `,
})
export class MyShiftsPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly horizon = HORIZON_DAYS;
  protected readonly shifts = signal<Shift[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly swapping = signal<Shift | null>(null);

  protected readonly groups = computed<DayGroup[]>(() => {
    const timeZone = this.auth.timeZone();
    const today = todayIn(timeZone);
    const byDate = new Map<string, DayGroup>();
    for (const shift of [...this.shifts()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const start = utcToLocal(shift.startsAt, timeZone);
      const end = utcToLocal(shift.endsAt, timeZone);
      const group = byDate.get(start.date) ?? { date: start.date, isToday: start.date === today, shifts: [] };
      group.shifts.push({ shift, from: start.time, to: end.time, nextDay: end.date !== start.date && end.time !== '00:00' });
      byDate.set(start.date, group);
    }
    return [...byDate.values()];
  });

  protected readonly next = computed(() => {
    const now = Date.now();
    const timeZone = this.auth.timeZone();
    const upcoming = [...this.shifts()]
      .filter((s) => new Date(s.endsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    if (!upcoming) {
      return null;
    }
    const start = utcToLocal(upcoming.startsAt, timeZone);
    return { shift: upcoming, date: start.date, from: start.time, to: utcToLocal(upcoming.endsAt, timeZone).time };
  });

  constructor() {
    void this.load();
  }

  protected canSwap(shift: Shift): boolean {
    return new Date(shift.startsAt).getTime() > Date.now();
  }

  protected onSwapSent(message: string): void {
    this.swapping.set(null);
    this.toast.success(message);
  }

  protected color(shift: Shift) {
    return positionColor(shift.positionName);
  }

  protected dayLabel(date: string): string {
    return formatDayLong(date);
  }

  protected duration(shift: Shift): string {
    return formatDuration(shift.startsAt, shift.endsAt);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const timeZone = this.auth.timeZone();
      const today = todayIn(timeZone);
      this.shifts.set(
        await this.api.myShifts(localToUtc(today, '00:00', timeZone), localToUtc(addDays(today, HORIZON_DAYS), '00:00', timeZone)),
      );
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
