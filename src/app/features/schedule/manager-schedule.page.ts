import { Component, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { positionColor, positionsLabel } from '../../core/colors';
import { Employee, Position, Shift, ShiftTemplate } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { addDays, formatWeekRange, localToUtc, todayIn, utcToLocal, weekDays, weekStart } from '../../core/time';
import { GridRow, WeekGrid } from '../../schedule/week-grid';
import { QuickAddDialog, QuickGroup } from '../../schedule/quick-add-dialog';
import { ShiftDialog } from '../../schedule/shift-dialog';
import { Modal } from '../../ui/modal';
import { ToastService } from '../../ui/toast';

type DialogState = { shift: Shift | null; prefill: { employeeId: string | null; date: string; custom?: boolean } | null };

@Component({
  selector: 'app-manager-schedule-page',
  imports: [WeekGrid, ShiftDialog, QuickAddDialog, Modal],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Raspored</h1>
        <p class="text-sm text-slate-500">Pravi raspored kao nacrt, pa ga objavi zaposlenima.</p>
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="flex items-center rounded-lg border border-slate-300 bg-white shadow-sm">
          <button type="button" class="px-3 py-2 text-slate-600 hover:bg-slate-50" aria-label="Prethodna nedelja" (click)="shiftWeek(-1)">‹</button>
          <span class="min-w-44 px-2 text-center text-sm font-medium tabular-nums">{{ weekLabel() }}</span>
          <button type="button" class="px-3 py-2 text-slate-600 hover:bg-slate-50" aria-label="Sledeća nedelja" (click)="shiftWeek(1)">›</button>
        </div>
        <button type="button" class="btn-secondary" [disabled]="isCurrentWeek()" (click)="goToday()">Ova nedelja</button>
        <button type="button" class="btn-primary" (click)="openAdd(null, defaultDate())">+ Nova smena</button>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter po poziciji">
      <button type="button" class="rounded-full border px-3 py-1 text-sm font-medium transition" [class]="chipClass(filter() === 'all')" (click)="filter.set('all')">
        Sve pozicije
      </button>
      @for (position of positions(); track position.id) {
        <button type="button" class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition" [class]="chipClass(filter() === position.id)" (click)="filter.set(position.id)">
          <span class="h-2 w-2 rounded-full" [class]="color(position.name).dot"></span>
          {{ position.name }}
        </button>
      }
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div class="text-sm">
        <span class="font-semibold text-amber-700">{{ draftCount() }}</span> nacrta ·
        <span class="font-semibold text-emerald-700">{{ publishedCount() }}</span> objavljeno
        <span class="text-slate-500">({{ scopeLabel() }})</span>
      </div>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn-secondary" [disabled]="publishedCount() === 0 || busy()" (click)="confirm.set('unpublish')">Povuci objavu</button>
        <button type="button" class="btn-primary" [disabled]="draftCount() === 0 || busy()" (click)="confirm.set('publish')">Objavi raspored</button>
      </div>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="reload()">Pokušaj ponovo</button>
      </div>
    }

    <div [class]="loading() ? 'opacity-60 transition' : 'transition'">
      <app-week-grid
        [days]="days()"
        [rows]="rows()"
        [shifts]="visibleShifts()"
        [timeZone]="timeZone()"
        [today]="today()"
        [editable]="true"
        (addShift)="openAdd($event.employeeId, $event.date)"
        (openShift)="openEdit($event)"
      />
    </div>

    <p class="mt-3 text-xs text-slate-500">
      Isprekidana ivica je nacrt koji zaposleni još ne vide. Žuti red su otvorene smene bez zaposlenog.
    </p>

    @if (quick(); as add) {
      <app-quick-add-dialog
        [who]="add.who"
        [date]="add.date"
        [employeeId]="add.employeeId"
        [groups]="add.groups"
        [timeZone]="timeZone()"
        (created)="onSaved($event)"
        (other)="switchToCustom(add)"
        (closed)="quick.set(null)"
      />
    }

    @if (dialog(); as state) {
      <app-shift-dialog
        [shift]="state.shift"
        [prefill]="state.prefill"
        [employees]="assignableEmployees()"
        [positions]="positions()"
        [templates]="templates()"
        [timeZone]="timeZone()"
        [defaultPositionId]="filter() === 'all' ? null : filter()"
        (saved)="onSaved($event)"
        (closed)="dialog.set(null)"
      />
    }

    @if (confirm() === 'publish') {
      <app-modal title="Objavi raspored" [subtitle]="weekLabel() + ' · ' + scopeLabel()" (closed)="confirm.set(null)">
        <p class="text-sm text-slate-700">
          Broj nacrta koji se objavljuju: <strong>{{ draftCount() }}</strong>. Zaposleni sa tim pozicijama dobiće mejl da pogledaju raspored.
        </p>
        <ng-container modal-actions>
          <button type="button" class="btn-secondary" (click)="confirm.set(null)">Otkaži</button>
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="publish()">{{ busy() ? 'Objavljivanje…' : 'Objavi' }}</button>
        </ng-container>
      </app-modal>
    }

    @if (confirm() === 'unpublish') {
      <app-modal title="Povuci objavu" [subtitle]="weekLabel() + ' · ' + scopeLabel()" (closed)="confirm.set(null)">
        <div class="space-y-2 text-sm text-slate-700">
          <p>Smene koje još nisu počele vraćaju se u nacrt i zaposleni ih više ne vide.</p>
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
            Svi zahtevi za zamenu smena i preuzimanje otvorenih smena vezani za te smene biće obrisani. Ovo se ne može vratiti.
          </p>
        </div>
        <ng-container modal-actions>
          <button type="button" class="btn-secondary" (click)="confirm.set(null)">Otkaži</button>
          <button type="button" class="btn-danger" [disabled]="busy()" (click)="unpublish()">{{ busy() ? 'Povlačenje…' : 'Povuci objavu' }}</button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class ManagerSchedulePage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly timeZone = this.auth.timeZone;
  protected readonly today = computed(() => todayIn(this.timeZone()));
  protected readonly start = signal(weekStart(todayIn(this.auth.timeZone())));
  protected readonly days = computed(() => weekDays(this.start()));
  protected readonly weekLabel = computed(() => formatWeekRange(this.start()));
  protected readonly isCurrentWeek = computed(() => this.start() === weekStart(this.today()));

  protected readonly positions = signal<Position[]>([]);
  protected readonly employees = signal<Employee[]>([]);
  protected readonly templates = signal<ShiftTemplate[]>([]);
  protected readonly shifts = signal<Shift[]>([]);
  protected readonly filter = signal<string>('all');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly dialog = signal<DialogState | null>(null);
  protected readonly quick = signal<{ who: string; date: string; employeeId: string | null; groups: QuickGroup[] } | null>(null);
  protected readonly confirm = signal<'publish' | 'unpublish' | null>(null);

  protected readonly activeEmployees = computed(() =>
    this.employees()
      .filter((e) => e.status === 'Active')
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'sr-Latn')),
  );

  protected readonly assignableEmployees = computed(() => this.activeEmployees().filter((e) => e.positions.length > 0));

  /** Smene čiji je početak u izabranoj nedelji (noćna smena iz prethodne nedelje pripada onoj nedelji). */
  private readonly weekShifts = computed(() => {
    const days = new Set(this.days());
    return this.shifts().filter((s) => days.has(utcToLocal(s.startsAt, this.timeZone()).date));
  });

  protected readonly visibleShifts = computed(() => {
    const filter = this.filter();
    return this.weekShifts().filter((s) => filter === 'all' || s.positionId === filter);
  });

  protected readonly draftCount = computed(() => this.visibleShifts().filter((s) => s.publishedAt === null).length);
  protected readonly publishedCount = computed(() => this.visibleShifts().filter((s) => s.publishedAt !== null).length);

  protected readonly scopeLabel = computed(() =>
    this.filter() === 'all' ? 'sve pozicije' : (this.positions().find((p) => p.id === this.filter())?.name ?? ''),
  );

  protected readonly rows = computed<GridRow[]>(() => {
    const filter = this.filter();
    const known = new Map<string, GridRow>();
    for (const employee of this.activeEmployees()) {
      // Bez pozicije zaposleni ne može da dobije smenu, pa mu red samo zauzima mesto.
      if (employee.positions.length > 0 && (filter === 'all' || employee.positions.some((p) => p.id === filter))) {
        known.set(employee.id, {
          id: employee.id,
          label: `${employee.firstName} ${employee.lastName}`,
          hint: positionsLabel(employee.positions.map((p) => p.name)),
        });
      }
    }
    // Zaposleni koji više nije u listi (npr. neaktivan), a ima smenu u ovoj nedelji, ostaje vidljiv.
    for (const shift of this.visibleShifts()) {
      if (shift.employeeId && !known.has(shift.employeeId)) {
        known.set(shift.employeeId, { id: shift.employeeId, label: shift.employeeName ?? 'Nepoznat zaposleni' });
      }
    }
    return [...known.values(), { id: null, label: 'Otvorene smene', hint: 'bez zaposlenog' }];
  });

  private requestCounter = 0;

  constructor() {
    void this.loadStatic();
    effect(() => {
      void this.loadShifts(this.start());
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

  /** Datum koji se nudi pri dodavanju: danas ako je u prikazanoj nedelji, inače ponedeljak. */
  protected defaultDate(): string {
    return this.days().includes(this.today()) ? this.today() : this.start();
  }

  /**
   * Klik na "+" u ćeliji: nudi smene (šablone) pozicija tog zaposlenog za jedan klik. Ako pozicije nemaju
   * šablone (npr. šanker), odmah se otvara pun dijalog sa Od-Do.
   */
  protected openAdd(employeeId: string | null, date: string): void {
    const groups = this.quickGroups(employeeId);
    if (groups.length === 0) {
      this.dialog.set({ shift: null, prefill: { employeeId, date } });
      return;
    }
    const employee = this.employees().find((e) => e.id === employeeId);
    this.quick.set({
      who: employee ? `${employee.firstName} ${employee.lastName}` : 'Otvorena smena',
      date,
      employeeId,
      groups,
    });
  }

  /** Zaposleni (ili otvorena smena) može da radi samo svoje pozicije; aktivan filter suzuje izbor na jednu. */
  private quickGroups(employeeId: string | null): QuickGroup[] {
    const employee = this.employees().find((e) => e.id === employeeId);
    let positions = employee ? employee.positions : this.positions();
    const filter = this.filter();
    if (filter !== 'all' && positions.some((p) => p.id === filter)) {
      positions = positions.filter((p) => p.id === filter);
    }
    return positions
      .map((position) => ({
        position,
        templates: this.templates()
          .filter((t) => t.positionId === position.id)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
      .filter((group) => group.templates.length > 0);
  }

  protected switchToCustom(add: { date: string; employeeId: string | null }): void {
    this.quick.set(null);
    this.dialog.set({ shift: null, prefill: { employeeId: add.employeeId, date: add.date, custom: true } });
  }

  protected openEdit(shift: Shift): void {
    this.dialog.set({ shift, prefill: null });
  }

  protected onSaved(message: string): void {
    this.dialog.set(null);
    this.quick.set(null);
    this.toast.success(message);
    void this.loadShifts(this.start());
  }

  protected reload(): void {
    void this.loadShifts(this.start());
  }

  protected async publish(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.publish(this.scope());
      this.toast.success(
        result.published === 0
          ? 'Nema nacrta za objavu.'
          : `Objavljeno smena: ${result.published}. Obavešteno zaposlenih: ${result.employeesNotified}.`,
      );
    });
  }

  protected async unpublish(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.unpublish(this.scope());
      const removed = result.swapRequestsRemoved + result.claimRequestsRemoved;
      this.toast.success(
        `Povučeno smena: ${result.unpublished}.` + (removed > 0 ? ` Obrisano zahteva: ${removed}.` : ''),
      );
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.confirm.set(null);
      await this.loadShifts(this.start());
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private scope() {
    const [from, to] = this.range(this.start());
    return { from: from.toISOString(), to: to.toISOString(), positionIds: this.filter() === 'all' ? [] : [this.filter()] };
  }

  private range(start: string): [Date, Date] {
    const timeZone = this.timeZone();
    return [localToUtc(start, '00:00', timeZone), localToUtc(addDays(start, 7), '00:00', timeZone)];
  }

  private async loadStatic(): Promise<void> {
    try {
      const [positions, employees, templates] = await Promise.all([
        this.api.positions(),
        this.api.employees(),
        this.api.shiftTemplates(),
      ]);
      this.positions.set(positions);
      this.employees.set(employees);
      this.templates.set(templates);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  private async loadShifts(start: string): Promise<void> {
    const request = ++this.requestCounter;
    this.loading.set(true);
    this.error.set('');
    try {
      const [from, to] = this.range(start);
      const shifts = await this.api.managerShifts(from, to);
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
