import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { describeShift } from '../../core/describe';
import { Claim, DayOff, Swap, Wish } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { addDays, formatDayLong, todayIn } from '../../core/time';

const WISH_HORIZON_DAYS = 60;

/** "Zahtevi" (menadžer): slobodni dani na čekanju i želje radnika za naredne dane. */
@Component({
  selector: 'app-requests-page',
  template: `
    <div class="mb-5">
      <h1 class="text-xl font-semibold tracking-tight">Zahtevi</h1>
      <p class="text-sm text-slate-500">Odluči o zahtevima radnika i pogledaj njihove želje pre pravljenja rasporeda.</p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    <section class="mb-8" aria-labelledby="swaps-title">
      <h2 id="swaps-title" class="mb-2 text-sm font-semibold text-slate-700">Zamene smena koje čekaju odluku ({{ swaps().length }})</h2>
      @if (!loading() && swaps().length === 0) {
        <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Nema zamena koje čekaju odluku. Zamena stiže ovde kad je kolega prihvati.
        </p>
      }
      <ul class="space-y-2">
        @for (swap of swaps(); track swap.id) {
          <li class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="min-w-0 flex-1 text-sm">
              @if (swap.targetShiftId) {
                <div class="font-medium">Razmena: {{ swap.requesterName }} ⇄ {{ swap.targetName }}</div>
                <div class="text-slate-600">
                  {{ swap.requesterName }} daje {{ when(swap.shiftStartsAt, swap.shiftEndsAt) }} ({{ swap.positionName }}),
                  dobija {{ when(swap.targetShiftStartsAt!, swap.targetShiftEndsAt!) }} ({{ swap.targetPositionName }})
                </div>
              } @else {
                <div class="font-medium">Prepuštanje: {{ swap.requesterName }} → {{ swap.targetName }}</div>
                <div class="text-slate-600">{{ when(swap.shiftStartsAt, swap.shiftEndsAt) }} ({{ swap.positionName }})</div>
              }
              @if (swap.note) {
                <div class="italic text-slate-500">{{ swap.note }}</div>
              }
              @if (rowError()[swap.id]; as message) {
                <div class="mt-1 text-red-600" role="alert">{{ message }}</div>
              }
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-primary px-3 py-1.5" [disabled]="busy()" (click)="decideSwap(swap, 'approve')">Odobri</button>
              <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="decideSwap(swap, 'reject')">Odbij</button>
            </div>
          </li>
        }
      </ul>
    </section>

    <section class="mb-8" aria-labelledby="claims-title">
      <h2 id="claims-title" class="mb-2 text-sm font-semibold text-slate-700">Zahtevi za otvorene smene ({{ claims().length }})</h2>
      @if (!loading() && claims().length === 0) {
        <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Niko nije tražio otvorenu smenu.
        </p>
      }
      <ul class="space-y-2">
        @for (claim of claims(); track claim.id) {
          <li class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="min-w-0 flex-1 text-sm">
              <div class="font-medium">{{ claim.employeeName }} traži otvorenu smenu</div>
              <div class="text-slate-600">{{ when(claim.shiftStartsAt, claim.shiftEndsAt) }} ({{ claim.positionName }})</div>
              @if (claim.note) {
                <div class="italic text-slate-500">{{ claim.note }}</div>
              }
              @if (rowError()[claim.id]; as message) {
                <div class="mt-1 text-red-600" role="alert">{{ message }}</div>
              }
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-primary px-3 py-1.5" [disabled]="busy()" (click)="decideClaim(claim, 'approve')">Odobri</button>
              <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="decideClaim(claim, 'reject')">Odbij</button>
            </div>
          </li>
        }
      </ul>
    </section>

    <section class="mb-8" aria-labelledby="pending-title">
      <h2 id="pending-title" class="mb-2 text-sm font-semibold text-slate-700">Slobodni dani na čekanju ({{ dayOffs().length }})</h2>
      @if (!loading() && dayOffs().length === 0) {
        <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Nema zahteva koji čekaju odluku.
        </p>
      }
      <ul class="space-y-2">
        @for (off of dayOffs(); track off.id) {
          <li class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ off.employeeName }}</div>
              <div class="text-sm text-slate-600">{{ dayLabel(off.date) }}</div>
              @if (off.reason) {
                <div class="text-sm italic text-slate-500">{{ off.reason }}</div>
              }
              @if (rowError()[off.id]; as message) {
                <div class="mt-1 text-sm text-red-600" role="alert">{{ message }}</div>
              }
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-primary px-3 py-1.5" [disabled]="busy()" (click)="decide(off, 'approve')">Odobri</button>
              <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="decide(off, 'reject')">Odbij</button>
            </div>
          </li>
        }
      </ul>
    </section>

    <section aria-labelledby="wishes-title">
      <h2 id="wishes-title" class="mb-2 text-sm font-semibold text-slate-700">Želje radnika (narednih {{ horizon }} dana)</h2>
      @if (!loading() && wishes().length === 0) {
        <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Niko nije javio želju.
        </p>
      }
      <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        @for (wish of wishes(); track wish.id) {
          <li class="flex items-center gap-3 px-4 py-3 text-sm">
            <span class="w-44 shrink-0 text-slate-600">{{ dayLabel(wish.date) }}</span>
            <span class="flex-1 font-medium">{{ wish.employeeName }}</span>
            <span class="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">{{ wish.preferredShift }} smena ili slobodan</span>
          </li>
        }
      </ul>
    </section>
  `,
})
export class RequestsPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);

  protected readonly horizon = WISH_HORIZON_DAYS;
  protected readonly dayOffs = signal<DayOff[]>([]);
  protected readonly wishes = signal<Wish[]>([]);
  protected readonly swaps = signal<Swap[]>([]);
  protected readonly claims = signal<Claim[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly rowError = signal<Record<string, string>>({});

  constructor() {
    void this.load();
  }

  protected dayLabel(date: string): string {
    return formatDayLong(date);
  }

  protected when(startsAt: string, endsAt: string): string {
    return describeShift(startsAt, endsAt, this.auth.timeZone());
  }

  protected decide(off: DayOff, decision: 'approve' | 'reject'): Promise<void> {
    return this.decideAndRemove(off.id, () => this.api.decideDayOff(off.id, decision), this.dayOffs);
  }

  protected decideSwap(swap: Swap, decision: 'approve' | 'reject'): Promise<void> {
    return this.decideAndRemove(swap.id, () => this.api.decideSwap(swap.id, decision), this.swaps);
  }

  protected decideClaim(claim: Claim, decision: 'approve' | 'reject'): Promise<void> {
    // Odobrenje jednog zahteva zatvara ostale za istu smenu, pa se lista učitava ponovo.
    return this.decideAndRemove(claim.id, () => this.api.decideClaim(claim.id, decision), this.claims, true);
  }

  /** Šalje odluku i uklanja red; greška (npr. radnik tog dana već ima smenu) ostaje u samom redu. */
  private async decideAndRemove<T extends { id: string }>(
    id: string,
    action: () => Promise<unknown>,
    list: { update(fn: (items: T[]) => T[]): void },
    reload = false,
  ): Promise<void> {
    this.busy.set(true);
    this.rowError.update(({ [id]: _, ...rest }) => rest);
    try {
      await action();
      list.update((items) => items.filter((i) => i.id !== id));
      if (reload) {
        await this.load();
      }
    } catch (e) {
      this.rowError.update((errors) => ({ ...errors, [id]: errorMessage(e) }));
    } finally {
      this.busy.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const today = todayIn(this.auth.timeZone());
      const [dayOffs, wishes, swaps, claims] = await Promise.all([
        this.api.dayOffs('Pending'),
        this.api.wishes(today, addDays(today, WISH_HORIZON_DAYS)),
        this.api.swaps('Accepted'),
        this.api.claims('Pending'),
      ]);
      this.dayOffs.set(dayOffs);
      this.wishes.set(wishes);
      this.swaps.set(swaps);
      this.claims.set(claims);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
