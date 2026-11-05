import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { positionColor } from '../../core/colors';
import { CLAIM_LABELS, SWAP_LABELS, describeShift } from '../../core/describe';
import { Claim, Shift, Swap } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { addDays, localToUtc, todayIn } from '../../core/time';
import { ToastService } from '../../ui/toast';

const HORIZON_DAYS = 30;

/** "Zamene" (zaposleni): otvorene smene koje može da traži, zahtevi kolega na odgovor i moji zahtevi. */
@Component({
  selector: 'app-my-requests-page',
  template: `
    <div class="mb-5">
      <h1 class="text-xl font-semibold tracking-tight">Zamene i otvorene smene</h1>
      <p class="text-sm text-slate-500">Zamenu smene zatražiš iz „Moje smene". Svaki zahtev na kraju odobrava menadžer.</p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    @if (incoming().length > 0) {
      <section class="mb-8" aria-labelledby="incoming-title">
        <h2 id="incoming-title" class="mb-2 text-sm font-semibold text-slate-700">Čeka tvoj odgovor ({{ incoming().length }})</h2>
        <ul class="space-y-2">
          @for (swap of incoming(); track swap.id) {
            <li class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div class="min-w-0 flex-1 text-sm">
                <div class="font-medium">{{ swap.requesterName }} {{ swap.targetShiftId ? 'predlaže razmenu' : 'ti prepušta smenu' }}</div>
                <div>{{ swapText(swap) }}</div>
                @if (swap.note) {
                  <div class="italic text-slate-600">{{ swap.note }}</div>
                }
                @if (rowError()[swap.id]; as message) {
                  <div class="mt-1 text-red-600" role="alert">{{ message }}</div>
                }
              </div>
              <div class="flex gap-2">
                <button type="button" class="btn-primary px-3 py-1.5" [disabled]="busy()" (click)="respond(swap, 'accept')">Prihvati</button>
                <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="respond(swap, 'decline')">Odbij</button>
              </div>
            </li>
          }
        </ul>
      </section>
    }

    <section class="mb-8" aria-labelledby="open-title">
      <h2 id="open-title" class="mb-2 text-sm font-semibold text-slate-700">Otvorene smene (narednih {{ horizon }} dana)</h2>
      @if (!loading() && openShifts().length === 0) {
        <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Trenutno nema otvorenih smena za tvoju ulogu.
        </p>
      }
      <ul class="space-y-2">
        @for (shift of openShifts(); track shift.id) {
          <li class="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm" [class]="color(shift).chip">
            <div class="min-w-0 flex-1">
              <div class="font-medium tabular-nums">{{ when(shift.startsAt, shift.endsAt) }}</div>
              <div class="text-sm opacity-75">{{ shift.positionName }}@if (shift.note) { · {{ shift.note }} }</div>
              @if (rowError()[shift.id]; as message) {
                <div class="mt-1 text-sm text-red-700" role="alert">{{ message }}</div>
              }
            </div>
            @if (claimFor(shift.id); as claim) {
              <span class="text-sm font-medium">Zatraženo, čeka menadžera</span>
              <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="cancelClaim(claim)">Povuci</button>
            } @else {
              <button type="button" class="btn-primary px-3 py-1.5" [disabled]="busy()" (click)="claim(shift)">Traži smenu</button>
            }
          </li>
        }
      </ul>
    </section>

    <section aria-labelledby="mine-title">
      <h2 id="mine-title" class="mb-2 text-sm font-semibold text-slate-700">Moji zahtevi</h2>
      @if (!loading() && history().length === 0) {
        <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">Još nemaš zahteva.</p>
      }
      <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm empty:hidden">
        @for (item of history(); track item.id) {
          <li class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ item.title }}</div>
              <div class="text-slate-600">{{ item.text }}</div>
              @if (rowError()[item.id]; as message) {
                <div class="mt-1 text-red-600" role="alert">{{ message }}</div>
              }
            </div>
            <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{{ item.status }}</span>
            @if (item.cancel) {
              <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="item.cancel()">Povuci</button>
            }
          </li>
        }
      </ul>
    </section>
  `,
})
export class MyRequestsPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly horizon = HORIZON_DAYS;
  protected readonly openShifts = signal<Shift[]>([]);
  protected readonly claims = signal<Claim[]>([]);
  protected readonly swaps = signal<Swap[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly rowError = signal<Record<string, string>>({});

  private readonly me = computed(() => this.auth.user()?.employeeId);

  protected readonly incoming = computed(() => this.swaps().filter((s) => s.targetId === this.me() && s.status === 'Pending'));

  protected readonly history = computed(() => {
    const me = this.me();
    const items: { id: string; createdAt: string; title: string; text: string; status: string; cancel?: () => void }[] = [];
    for (const swap of this.swaps()) {
      if (swap.status === 'Cancelled' || (swap.targetId === me && swap.status === 'Pending')) {
        continue;
      }
      const mine = swap.requesterId === me;
      items.push({
        id: swap.id,
        createdAt: swap.createdAt,
        title: mine
          ? `${swap.targetShiftId ? 'Razmena sa' : 'Prepuštanje kolegi'} ${swap.targetName}`
          : `${swap.requesterName} ${swap.targetShiftId ? 'razmena' : 'ti prepušta'}`,
        text: this.swapText(swap),
        status: SWAP_LABELS[swap.status],
        cancel: mine && (swap.status === 'Pending' || swap.status === 'Accepted') ? () => void this.respond(swap, 'cancel') : undefined,
      });
    }
    for (const claim of this.claims()) {
      if (claim.status === 'Cancelled') {
        continue;
      }
      items.push({
        id: claim.id,
        createdAt: claim.createdAt,
        title: 'Otvorena smena',
        text: `${this.when(claim.shiftStartsAt, claim.shiftEndsAt)} · ${claim.positionName}`,
        status: CLAIM_LABELS[claim.status],
        cancel: claim.status === 'Pending' ? () => void this.cancelClaim(claim) : undefined,
      });
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  constructor() {
    void this.load();
  }

  protected color(shift: Shift) {
    return positionColor(shift.positionName);
  }

  protected when(startsAt: string, endsAt: string): string {
    return describeShift(startsAt, endsAt, this.auth.timeZone());
  }

  protected swapText(swap: Swap): string {
    const gives = `${this.when(swap.shiftStartsAt, swap.shiftEndsAt)} · ${swap.positionName}`;
    if (swap.targetShiftId && swap.targetShiftStartsAt && swap.targetShiftEndsAt) {
      const gets = `${this.when(swap.targetShiftStartsAt, swap.targetShiftEndsAt)} · ${swap.targetPositionName}`;
      return swap.requesterId === this.me() ? `Daješ ${gives}, dobijaš ${gets}` : `Dobijaš ${gives}, daješ ${gets}`;
    }
    return gives;
  }

  protected claimFor(shiftId: string): Claim | undefined {
    return this.claims().find((c) => c.shiftId === shiftId && c.status === 'Pending');
  }

  protected async claim(shift: Shift): Promise<void> {
    await this.run(shift.id, async () => {
      await this.api.claimShift(shift.id, null);
      this.toast.success('Zahtev je poslat menadžeru.');
    });
  }

  protected async cancelClaim(claim: Claim): Promise<void> {
    await this.run(claim.id, async () => {
      await this.api.cancelClaim(claim.id);
      this.toast.success('Zahtev je povučen.');
    });
  }

  protected async respond(swap: Swap, action: 'accept' | 'decline' | 'cancel'): Promise<void> {
    await this.run(swap.id, async () => {
      await this.api.respondToSwap(swap.id, action);
      this.toast.success(
        { accept: 'Prihvatio si zahtev. Sada čeka odluku menadžera.', decline: 'Odbio si zahtev.', cancel: 'Zahtev je povučen.' }[action],
      );
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const timeZone = this.auth.timeZone();
      const today = todayIn(timeZone);
      const [openShifts, claims, swaps] = await Promise.all([
        this.api.openShifts(localToUtc(today, '00:00', timeZone), localToUtc(addDays(today, HORIZON_DAYS), '00:00', timeZone)),
        this.api.myClaims(),
        this.api.mySwaps(),
      ]);
      this.openShifts.set(openShifts);
      this.claims.set(claims);
      this.swaps.set(swaps);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async run(id: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.rowError.update(({ [id]: _, ...rest }) => rest);
    try {
      await action();
      await this.load();
    } catch (e) {
      this.rowError.update((errors) => ({ ...errors, [id]: errorMessage(e) }));
    } finally {
      this.busy.set(false);
    }
  }
}
