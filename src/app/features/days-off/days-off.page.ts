import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { addMonths, formatMonth, lastDayOfMonth, monthStart, monthWeeks } from '../../core/calendar';
import { DayOff, DayOffStatus, Wish } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { formatDayLong, todayIn } from '../../core/time';

export const DAY_OFF_LABELS: Record<DayOffStatus, string> = {
  Pending: 'Čeka odobrenje',
  Approved: 'Odobreno',
  Rejected: 'Odbijeno',
  Cancelled: 'Otkazano',
};

const WEEKDAYS = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

/**
 * "Slobodni dani": radnik klikom na datum traži ceo slobodan dan (čeka odobrenje menadžera) ili javi želju
 * "I smena ili slobodan" (važi odmah, menadžer je vidi pri pravljenju rasporeda, ništa ne blokira).
 */
@Component({
  selector: 'app-days-off-page',
  imports: [FormsModule],
  template: `
    <div class="mb-5">
      <h1 class="text-xl font-semibold tracking-tight">Slobodni dani</h1>
      <p class="text-sm text-slate-500">Izaberi datum pa traži slobodan dan ili javi koju smenu možeš.</p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
      </div>
    }

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="Kalendar">
        <div class="mb-3 flex items-center justify-between">
          <button type="button" class="btn-secondary px-3 py-1.5" aria-label="Prethodni mesec" (click)="shiftMonth(-1)">‹</button>
          <h2 class="font-semibold">{{ monthLabel() }}</h2>
          <button type="button" class="btn-secondary px-3 py-1.5" aria-label="Sledeći mesec" (click)="shiftMonth(1)">›</button>
        </div>

        <div class="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          @for (name of weekdays; track name) {
            <div class="py-1">{{ name }}</div>
          }
        </div>
        <div class="grid grid-cols-7 gap-1">
          @for (day of days(); track day.date) {
            <button
              type="button"
              class="flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-lg border px-1 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40"
              [class]="cellClass(day)"
              [disabled]="day.date < today() || !day.inMonth"
              [attr.aria-label]="cellLabel(day)"
              [attr.aria-pressed]="selected() === day.date"
              (click)="select(day.date)"
            >
              <span class="font-medium tabular-nums">{{ dayNumber(day.date) }}</span>
              @if (badge(day.date); as b) {
                <span class="rounded px-1 text-[10px] font-semibold leading-4" [class]="b.class">{{ b.text }}</span>
              }
            </button>
          }
        </div>

        <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500" aria-label="Legenda">
          <li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400"></span>Čeka odobrenje</li>
          <li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500"></span>Odobren slobodan dan</li>
          <li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500"></span>Želja za smenu</li>
        </ul>
      </section>

      <aside class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:self-start" aria-label="Izabrani dan">
        @if (selected(); as date) {
          <h2 class="font-semibold">{{ dayLabel(date) }}</h2>

          @if (activeDayOff(date); as off) {
            <div class="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div class="font-medium">Slobodan dan: {{ statusLabel(off) }}</div>
              @if (off.reason) {
                <div class="text-slate-500">{{ off.reason }}</div>
              }
              <button type="button" class="btn-secondary mt-2 px-3 py-1.5" [disabled]="busy()" (click)="cancelDayOff(off)">
                {{ off.status === 'Approved' ? 'Otkaži slobodan dan' : 'Povuci zahtev' }}
              </button>
            </div>
          }

          @if (wishFor(date); as wish) {
            <div class="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              <div class="font-medium">Želja: {{ wish.preferredShift }} smena ili slobodan</div>
              <button type="button" class="btn-secondary mt-2 px-3 py-1.5" [disabled]="busy()" (click)="removeWish(wish)">Ukloni želju</button>
            </div>
          }

          @if (!activeDayOff(date)) {
            <div class="mt-4 space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Izaberi</p>
              <label class="label" for="reason">Razlog (nije obavezno)</label>
              <input id="reason" class="field" maxlength="500" [(ngModel)]="reason" placeholder="npr. slava, ispit" />
              <button type="button" class="btn-primary w-full" [disabled]="busy()" (click)="requestDayOff(date)">
                Slobodan dan
              </button>
              @for (name of shiftNames(); track name) {
                <button
                  type="button"
                  class="btn-secondary w-full"
                  [disabled]="busy() || wishFor(date)?.preferredShift === name"
                  (click)="saveWish(date, name)"
                >
                  {{ name }} smena ili slobodan
                </button>
              }
              <p class="text-xs text-slate-500">
                Slobodan dan odobrava menadžer. Želja za smenu važi odmah, ali menadžer ipak može da te rasporedi.
              </p>
            </div>
          }
        } @else {
          <p class="text-sm text-slate-500">Klikni na datum u kalendaru.</p>
        }

        @if (notice()) {
          <p class="mt-3 text-sm text-emerald-700" role="status">{{ notice() }}</p>
        }
      </aside>
    </div>
  `,
})
export class DaysOffPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);

  protected readonly weekdays = WEEKDAYS;
  protected readonly today = computed(() => todayIn(this.auth.timeZone()));
  protected readonly month = signal(monthStart(todayIn(this.auth.timeZone())));
  protected readonly days = computed(() => monthWeeks(this.month()).flat());
  protected readonly monthLabel = computed(() => formatMonth(this.month()));

  protected readonly selected = signal<string | null>(null);
  protected readonly dayOffs = signal<DayOff[]>([]);
  protected readonly wishes = signal<Wish[]>([]);
  protected readonly shiftNames = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected reason = '';

  constructor() {
    void this.loadShiftNames();
    void this.load();
  }

  protected shiftMonth(count: number): void {
    this.month.set(addMonths(this.month(), count));
    this.selected.set(null);
    void this.load();
  }

  protected select(date: string): void {
    this.selected.set(date);
    this.notice.set('');
    this.error.set('');
    this.reason = '';
  }

  protected dayNumber(date: string): number {
    return Number(date.slice(8));
  }

  protected dayLabel(date: string): string {
    return formatDayLong(date);
  }

  /** Zahtev koji još važi za dan (na čekanju ili odobren); odbijeni i otkazani se ne prikazuju. */
  protected activeDayOff(date: string): DayOff | undefined {
    return this.dayOffs().find((d) => d.date === date && (d.status === 'Pending' || d.status === 'Approved'));
  }

  protected wishFor(date: string): Wish | undefined {
    return this.wishes().find((w) => w.date === date);
  }

  protected statusLabel(off: DayOff): string {
    return DAY_OFF_LABELS[off.status];
  }

  protected badge(date: string): { text: string; class: string } | null {
    const off = this.activeDayOff(date);
    if (off) {
      return off.status === 'Approved'
        ? { text: 'slobodan', class: 'bg-emerald-100 text-emerald-800' }
        : { text: 'traženo', class: 'bg-amber-100 text-amber-800' };
    }
    const wish = this.wishFor(date);
    return wish ? { text: `${wish.preferredShift}/sl.`, class: 'bg-sky-100 text-sky-800' } : null;
  }

  protected cellClass(day: { date: string; inMonth: boolean }): string {
    const classes = [this.selected() === day.date ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200 hover:bg-slate-50'];
    classes.push(day.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400');
    if (day.date === this.today()) {
      classes.push('font-bold text-brand-700');
    }
    return classes.join(' ');
  }

  protected cellLabel(day: { date: string }): string {
    const text = this.badge(day.date)?.text;
    return text ? `${formatDayLong(day.date)}, ${text}` : formatDayLong(day.date);
  }

  protected async requestDayOff(date: string): Promise<void> {
    await this.run(async () => {
      await this.api.requestDayOff(date, this.reason.trim() || null);
      this.notice.set('Zahtev je poslat menadžeru.');
    });
  }

  protected async cancelDayOff(off: DayOff): Promise<void> {
    await this.run(async () => {
      await this.api.cancelDayOff(off.id);
      this.notice.set(off.status === 'Approved' ? 'Slobodan dan je otkazan.' : 'Zahtev je povučen.');
    });
  }

  protected async saveWish(date: string, name: string): Promise<void> {
    await this.run(async () => {
      await this.api.saveWish(date, name);
      this.notice.set(`Želja je javljena: ${name} smena ili slobodan.`);
    });
  }

  protected async removeWish(wish: Wish): Promise<void> {
    await this.run(async () => {
      await this.api.deleteWish(wish.id);
      this.notice.set('Želja je uklonjena.');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadShiftNames(): Promise<void> {
    try {
      const mine = new Set((this.auth.user()?.positions ?? []).map((p) => p.id));
      const names = (await this.api.shiftTemplates()).filter((t) => mine.has(t.positionId)).map((t) => t.name);
      this.shiftNames.set([...new Set(names)].sort());
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  private async load(): Promise<void> {
    const from = this.month();
    const to = lastDayOfMonth(from);
    try {
      const [dayOffs, wishes] = await Promise.all([this.api.myDayOffs(from, to), this.api.myWishes(from, to)]);
      this.dayOffs.set(dayOffs);
      this.wishes.set(wishes);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
