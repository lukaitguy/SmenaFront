import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { describeShift } from '../../core/describe';
import { Shift } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { addDays, localToUtc, todayIn } from '../../core/time';
import { Modal } from '../../ui/modal';

const HORIZON_DAYS = 30;

type Mode = 'exchange' | 'handover';

/**
 * Zamena moje smene: razmena za kolegovu smenu iste uloge, ili prepuštanje kolegi. Kolega prvo prihvata,
 * pa odluku donosi menadžer; smene menjaju vlasnika tek tada.
 */
@Component({
  selector: 'app-swap-dialog',
  imports: [FormsModule, Modal],
  template: `
    <app-modal title="Zameni smenu" [subtitle]="mine()" (closed)="closed.emit()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Vrsta zamene">
          <button type="button" class="rounded-xl border px-3 py-2 text-left text-sm transition"
            [class]="mode() === 'exchange' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30' : 'border-slate-300 hover:bg-slate-50'"
            [attr.aria-pressed]="mode() === 'exchange'" (click)="mode.set('exchange')">
            <span class="block font-semibold">Razmeni</span>
            <span class="text-xs text-slate-500">za kolegovu smenu</span>
          </button>
          <button type="button" class="rounded-xl border px-3 py-2 text-left text-sm transition"
            [class]="mode() === 'handover' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30' : 'border-slate-300 hover:bg-slate-50'"
            [attr.aria-pressed]="mode() === 'handover'" (click)="mode.set('handover')">
            <span class="block font-semibold">Prepusti</span>
            <span class="text-xs text-slate-500">kolegi, bez zauzvrat</span>
          </button>
        </div>

        @if (loading()) {
          <p class="text-sm text-slate-500">Učitavanje kolega…</p>
        } @else if (mode() === 'exchange') {
          <div>
            <label class="label" for="their-shift">Kolegina smena koju želiš</label>
            <select id="their-shift" class="field" [(ngModel)]="theirShiftId">
              <option value="">Izaberi smenu…</option>
              @for (option of theirShifts(); track option.id) {
                <option [value]="option.id">{{ option.employeeName }} · {{ describe(option) }}</option>
              }
            </select>
            @if (theirShifts().length === 0) {
              <p class="mt-1 text-xs text-slate-500">Nema objavljenih smena kolega za razmenu u narednih {{ horizon }} dana.</p>
            }
          </div>
        } @else {
          <div>
            <label class="label" for="colleague">Kolega</label>
            <select id="colleague" class="field" [(ngModel)]="colleagueId">
              <option value="">Izaberi kolegu…</option>
              @for (colleague of colleagues(); track colleague.id) {
                <option [value]="colleague.id">{{ colleague.name }}</option>
              }
            </select>
            @if (colleagues().length === 0) {
              <p class="mt-1 text-xs text-slate-500">Nema kolega na ovoj poziciji sa objavljenim smenama.</p>
            }
          </div>
        }

        <div>
          <label class="label" for="swap-note">Poruka kolegi <span class="font-normal text-slate-400">(nije obavezno)</span></label>
          <input id="swap-note" class="field" maxlength="500" [(ngModel)]="note" />
        </div>

        <p class="text-xs text-slate-500">Kolega mora da prihvati, a zatim zamenu odobrava menadžer.</p>

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
      </div>

      <ng-container modal-actions>
        <button type="button" class="btn-secondary" (click)="closed.emit()">Otkaži</button>
        <button type="button" class="btn-primary" [disabled]="busy() || !canSend()" (click)="send()">
          {{ busy() ? 'Slanje…' : 'Pošalji zahtev' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class SwapDialog implements OnInit {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);

  readonly shift = input.required<Shift>();
  readonly sent = output<string>();
  readonly closed = output<void>();

  protected readonly horizon = HORIZON_DAYS;
  protected readonly mode = signal<Mode>('exchange');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly roster = signal<Shift[]>([]);
  protected theirShiftId = '';
  protected colleagueId = '';
  protected note = '';

  protected readonly mine = computed(
    () => `${describeShift(this.shift().startsAt, this.shift().endsAt, this.auth.timeZone())} · ${this.shift().positionName}`,
  );

  /** Kolegine objavljene smene iste uloge koje još nisu počele. */
  protected readonly theirShifts = computed(() => {
    const me = this.auth.user()?.employeeId;
    const now = Date.now();
    return this.roster()
      .filter((s) => s.employeeId && s.employeeId !== me && s.positionId === this.shift().positionId && new Date(s.startsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  });

  protected readonly colleagues = computed(() => {
    const byId = new Map<string, string>();
    for (const s of this.theirShifts()) {
      byId.set(s.employeeId!, s.employeeName ?? '');
    }
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'sr-Latn'));
  });

  ngOnInit(): void {
    void this.load();
  }

  protected describe(shift: Shift): string {
    return describeShift(shift.startsAt, shift.endsAt, this.auth.timeZone());
  }

  protected canSend(): boolean {
    return this.mode() === 'exchange' ? this.theirShiftId !== '' : this.colleagueId !== '';
  }

  protected async send(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const exchange = this.mode() === 'exchange';
      const target = exchange ? this.theirShifts().find((s) => s.id === this.theirShiftId) : undefined;
      await this.api.createSwap({
        shiftId: this.shift().id,
        targetEmployeeId: exchange ? null : this.colleagueId,
        targetShiftId: exchange ? this.theirShiftId : null,
        note: this.note.trim() || null,
      });
      const who = exchange ? target?.employeeName : this.colleagues().find((c) => c.id === this.colleagueId)?.name;
      this.sent.emit(`Zahtev je poslat${who ? `: ${who}` : ''}. Čeka odgovor kolege.`);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const timeZone = this.auth.timeZone();
      const today = todayIn(timeZone);
      this.roster.set(
        await this.api.roster(localToUtc(today, '00:00', timeZone), localToUtc(addDays(today, HORIZON_DAYS), '00:00', timeZone), this.shift().positionId),
      );
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
