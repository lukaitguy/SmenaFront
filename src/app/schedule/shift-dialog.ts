import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { positionsLabel } from '../core/colors';
import { Employee, Position, Shift, ShiftTemplate } from '../core/models';
import { errorMessage } from '../core/problem';
import { SmenaApi } from '../core/smena-api';
import { addDays, apiWeekdayName, isoWeekday, localToUtc, shortTime, utcToLocal } from '../core/time';
import { Modal } from '../ui/modal';
import { NO_PREFERENCES, Preferences, preferenceWarning, recurringDates } from './preference-warning';

const WEEKDAYS = [
  { value: 1, label: 'Pon' },
  { value: 2, label: 'Uto' },
  { value: 3, label: 'Sre' },
  { value: 4, label: 'Čet' },
  { value: 5, label: 'Pet' },
  { value: 6, label: 'Sub' },
  { value: 7, label: 'Ned' },
];

/** Vrednost izbora smene kad se vreme zadaje ručno (Od-Do) umesto iz šablona. */
const CUSTOM = '';

/**
 * Dodavanje i izmena smene (menadžer). Smena se najčešće bira iz šablona pozicije ("I", "II"), a "Drugo vreme"
 * otvara Od-Do za izuzetke. Sam poziva API pa roditelju javlja samo da je gotovo.
 */
@Component({
  selector: 'app-shift-dialog',
  imports: [FormsModule, Modal],
  template: `
    <app-modal [title]="editing() ? 'Izmena smene' : 'Nova smena'" [subtitle]="subtitle()" (closed)="closed.emit()">
      <form id="shift-form" class="space-y-4" (ngSubmit)="save()">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="employee">Zaposleni</label>
            <select id="employee" name="employee" class="field" [ngModel]="employeeId()" (ngModelChange)="onEmployeeChange($event)">
              <option value="">Otvorena smena</option>
              @for (employee of employeeOptions(); track employee.id) {
                <option [value]="employee.id">{{ employee.firstName }} {{ employee.lastName }}{{ roles(employee) }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label" for="position">{{ hasSeveralRoles() ? 'Radi kao' : 'Pozicija' }}</label>
            <select id="position" name="position" class="field" required [ngModel]="positionId()" (ngModelChange)="onPositionChange($event)">
              @for (position of positionOptions(); track position.id) {
                <option [value]="position.id">{{ position.name }}</option>
              }
            </select>
          </div>
        </div>

        @if (notice()) {
          <p class="-mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">{{ notice() }}</p>
        }

        <div>
          <label class="label" for="date">Datum</label>
          <input id="date" name="date" type="date" class="field max-w-52" required [(ngModel)]="date" />
        </div>

        <fieldset>
          <legend class="label">Smena</legend>
          @if (positionTemplates().length > 0) {
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Smena">
              @for (template of positionTemplates(); track template.id) {
                <button
                  type="button"
                  class="rounded-xl border px-3 py-2 text-left transition"
                  [class]="choice() === template.id ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30' : 'border-slate-300 bg-white hover:bg-slate-50'"
                  [attr.aria-pressed]="choice() === template.id"
                  (click)="choose(template.id)"
                >
                  <span class="block text-lg font-bold leading-none">{{ template.name }}</span>
                  <span class="mt-1 block text-xs tabular-nums text-slate-600">{{ time(template.startTime) }}–{{ time(template.endTime) }}</span>
                </button>
              }
              <button
                type="button"
                class="rounded-xl border px-3 py-2 text-left transition"
                [class]="choice() === custom ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30' : 'border-dashed border-slate-300 bg-white hover:bg-slate-50'"
                [attr.aria-pressed]="choice() === custom"
                (click)="choose(custom)"
              >
                <span class="block text-sm font-semibold leading-none">Drugo vreme</span>
                <span class="mt-1 block text-xs text-slate-500">Od – Do</span>
              </button>
            </div>
          } @else {
            <p class="mb-2 text-xs text-slate-500">Ova pozicija nema unapred definisane smene, pa se vreme zadaje ručno.</p>
          }

          @if (choice() === custom) {
            <div class="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label class="label" for="start">Od</label>
                <input id="start" name="start" type="time" class="field" required [(ngModel)]="start" />
              </div>
              <div>
                <label class="label" for="end">Do</label>
                <input id="end" name="end" type="time" class="field" required [(ngModel)]="end" />
              </div>
            </div>
          }
          @if (overnight()) {
            <p class="mt-2 text-xs text-slate-500">Smena se završava sutradan u {{ end() }}.</p>
          }
        </fieldset>

        <div>
          <label class="label" for="note">Napomena <span class="font-normal text-slate-400">(nije obavezno)</span></label>
          <input id="note" name="note" class="field" maxlength="500" [(ngModel)]="note" />
        </div>

        @if (!editing()) {
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="repeat" class="h-4 w-4 rounded border-slate-300 text-brand-600" [(ngModel)]="repeat" />
              Ponavljaj nedeljno
            </label>
            @if (repeat()) {
              <div class="mt-3 space-y-3">
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Dani u nedelji">
                  @for (day of weekdays; track day.value) {
                    <button
                      type="button"
                      class="h-8 min-w-11 rounded-lg border px-2 text-xs font-medium transition"
                      [class]="repeatDays().includes(day.value) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'"
                      [attr.aria-pressed]="repeatDays().includes(day.value)"
                      (click)="toggleDay(day.value)"
                    >
                      {{ day.label }}
                    </button>
                  }
                </div>
                <div>
                  <label class="label" for="until">Do datuma</label>
                  <input id="until" name="until" type="date" class="field max-w-48" [(ngModel)]="until" />
                </div>
                <p class="text-xs text-slate-500">
                  Dani koji se preklapaju sa drugom smenom ili odobrenim slobodnim danom se preskaču.
                </p>
              </div>
            }
          </div>
        }

        @if (warning(); as text) {
          <p class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{{ text }}</p>
        }

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
      </form>

      <ng-container modal-actions>
        @if (editing()) {
          @if (confirmDelete()) {
            <span class="mr-auto text-sm text-red-700">Obrisati ovu smenu?</span>
            <button type="button" class="btn-ghost" (click)="confirmDelete.set(false)">Ne</button>
            <button type="button" class="btn-danger" [disabled]="busy()" (click)="remove()">Da, obriši</button>
          } @else {
            <button type="button" class="btn-danger mr-auto" (click)="confirmDelete.set(true)">Obriši</button>
          }
        }
        <button type="button" class="btn-secondary" (click)="closed.emit()">Otkaži</button>
        <button type="submit" form="shift-form" class="btn-primary" [disabled]="busy()">
          {{ busy() ? 'Čuvanje…' : warning() ? 'Ipak postavi' : editing() ? 'Sačuvaj' : repeat() ? 'Napravi smene' : 'Dodaj smenu' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class ShiftDialog implements OnInit {
  private readonly api = inject(SmenaApi);

  readonly shift = input<Shift | null>(null);
  /** `custom` otvara dijalog odmah na ručnom vremenu (Od-Do), npr. posle "Drugo vreme" iz brzog dodavanja. */
  readonly prefill = input<{ employeeId: string | null; date: string; custom?: boolean } | null>(null);
  readonly employees = input.required<Employee[]>();
  readonly positions = input.required<Position[]>();
  readonly templates = input<ShiftTemplate[]>([]);
  readonly timeZone = input.required<string>();
  readonly defaultPositionId = input<string | null>(null);
  /** Želje i zahtevi radnika; menadžer dobija upozorenje ako radnika postavlja protiv njih. */
  readonly preferences = input<Preferences>(NO_PREFERENCES);

  /** Javlja da je upisano; tekst (ako postoji) roditelj prikazuje kao obaveštenje. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly custom = CUSTOM;
  protected readonly weekdays = WEEKDAYS;
  protected readonly employeeId = signal('');
  protected readonly positionId = signal('');
  /** Id izabranog šablona, ili prazno za proizvoljno vreme. */
  protected readonly choice = signal<string>(CUSTOM);
  protected readonly date = signal('');
  protected readonly start = signal('08:00');
  protected readonly end = signal('16:00');
  protected readonly note = signal('');
  protected readonly repeat = signal(false);
  protected readonly repeatDays = signal<number[]>([]);
  protected readonly until = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly notice = signal('');

  protected readonly editing = computed(() => this.shift() !== null);
  protected readonly overnight = computed(() => this.end() !== '' && this.start() !== '' && this.end() <= this.start());
  protected readonly subtitle = computed(() => {
    const shift = this.shift();
    if (!shift) {
      return '';
    }
    return shift.publishedAt ? 'Objavljena smena' : 'Nacrt, zaposleni je još ne vide';
  });

  /** Pozicija se bira prva i uvek su ponuđene sve, pa zaposleni koji nema tu ulogu može da se zameni drugom. */
  protected readonly positionOptions = computed(() => this.positions());

  /**
   * Zaposleni se nude samo za izabranu poziciju (za "Konobar" samo konobari). Zaposleni kome je smena već
   * dodeljena ostaje u izboru i ako je u međuvremenu izgubio poziciju, da polje ne bude prazno.
   */
  protected readonly employeeOptions = computed(() =>
    this.employees().filter(
      (e) => e.positions.some((p) => p.id === this.positionId()) || e.id === this.shift()?.employeeId,
    ),
  );

  /** Upozorenje dok je izabrano nešto protiv želje radnika; dugme tada glasi "Ipak postavi". */
  protected readonly warning = computed(() => {
    const dates = this.repeat() && !this.editing()
      ? recurringDates(this.date(), this.until(), this.repeatDays())
      : [this.date()];
    const name = this.choice() === CUSTOM ? null : (this.templates().find((t) => t.id === this.choice())?.name ?? null);
    return preferenceWarning(this.preferences(), this.employeeId() || null, dates, name);
  });

  private readonly selectedEmployee = computed(() => this.employees().find((e) => e.id === this.employeeId()));

  /** Ko radi više uloga (npr. konobar i šanker) bira kao koju radi ovaj dan. */
  protected readonly hasSeveralRoles = computed(() => (this.selectedEmployee()?.positions.length ?? 0) > 1);

  protected readonly positionTemplates = computed(() =>
    this.templates()
      .filter((t) => t.positionId === this.positionId())
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  );

  ngOnInit(): void {
    const shift = this.shift();
    if (shift) {
      const start = utcToLocal(shift.startsAt, this.timeZone());
      this.employeeId.set(shift.employeeId ?? '');
      this.positionId.set(shift.positionId);
      this.date.set(start.date);
      this.start.set(start.time);
      this.end.set(utcToLocal(shift.endsAt, this.timeZone()).time);
      this.note.set(shift.note ?? '');
      // Smena napravljena po šablonu ostaje na šablonu, a sve ostale su proizvoljne (Od-Do).
      this.choice.set(this.templates().some((t) => t.id === shift.templateId) ? shift.templateId! : CUSTOM);
      return;
    }

    const prefill = this.prefill();
    const date = prefill?.date ?? '';
    this.date.set(date);
    this.employeeId.set(prefill?.employeeId ?? '');
    this.repeatDays.set(date ? [isoWeekday(date)] : []);
    this.until.set(date ? addDays(date, 27) : '');
    this.positionId.set(this.pickPosition());
    if (prefill?.custom) {
      this.choice.set(CUSTOM);
    } else {
      this.chooseDefault();
    }
  }

  protected time(value: string): string {
    return shortTime(value);
  }

  /** Uloge u zagradi samo za one koji rade više njih, npr. " (Konobar/Šanker)". */
  protected roles(employee: Employee): string {
    return employee.positions.length > 1 ? ` (${positionsLabel(employee.positions.map((p) => p.name))})` : '';
  }

  protected onEmployeeChange(employeeId: string): void {
    this.employeeId.set(employeeId);
    this.notice.set('');
  }

  protected onPositionChange(positionId: string): void {
    this.positionId.set(positionId);
    this.notice.set('');

    // Izabrani zaposleni koji nema novu poziciju ne može da je radi: smena ostaje otvorena dok se ne izabere drugi.
    const employee = this.selectedEmployee();
    if (employee && !employee.positions.some((p) => p.id === positionId)) {
      this.employeeId.set('');
      this.notice.set(`${employee.firstName} ${employee.lastName} nema ovu poziciju, pa je smena ostala otvorena. Izaberi zaposlenog sa ovom pozicijom.`);
    }

    // Šablon druge pozicije više ne važi: pri dodavanju se nudi prva smena nove pozicije.
    if (!this.positionTemplates().some((t) => t.id === this.choice())) {
      if (this.editing()) {
        this.choice.set(CUSTOM);
      } else {
        this.chooseDefault();
      }
    }
  }

  protected choose(choice: string): void {
    this.choice.set(choice);
    const template = this.templates().find((t) => t.id === choice);
    if (template) {
      this.start.set(shortTime(template.startTime));
      this.end.set(shortTime(template.endTime));
    }
  }

  protected toggleDay(day: number): void {
    this.repeatDays.update((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()));
  }

  protected async save(): Promise<void> {
    if (!this.positionId()) {
      this.error.set('Izaberi poziciju.');
      return;
    }
    if (this.repeat() && !this.editing() && (this.repeatDays().length === 0 || this.until() < this.date())) {
      this.error.set('Za ponavljanje izaberi bar jedan dan i datum završetka koji nije pre početka.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      const timeZone = this.timeZone();
      const endDate = this.overnight() ? addDays(this.date(), 1) : this.date();
      const templateId = this.choice() === CUSTOM ? null : this.choice();
      const request = {
        employeeId: this.employeeId() || null,
        positionId: this.positionId(),
        startsAt: localToUtc(this.date(), this.start(), timeZone).toISOString(),
        endsAt: localToUtc(endDate, this.end(), timeZone).toISOString(),
        note: this.note().trim() || null,
        templateId,
      };

      const current = this.shift();
      if (current) {
        await this.api.updateShift(current.id, request);
        this.saved.emit('Smena je sačuvana.');
      } else if (this.repeat()) {
        const result = await this.api.createRecurring({
          employeeId: request.employeeId,
          positionId: request.positionId,
          fromDate: this.date(),
          untilDate: this.until(),
          daysOfWeek: this.repeatDays().map(apiWeekdayName),
          startTime: `${this.start()}:00`,
          endTime: `${this.end()}:00`,
          note: request.note,
          onConflict: 'Skip',
          templateId,
        });
        const skipped = result.skipped.length > 0 ? `, preskočeno ${result.skipped.length} (preklapanje ili slobodan dan)` : '';
        this.saved.emit(`Napravljeno smena: ${result.created}${skipped}.`);
      } else {
        await this.api.createShift(request);
        this.saved.emit('Smena je dodata.');
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.shift();
    if (!current) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.deleteShift(current.id);
      this.saved.emit('Smena je obrisana.');
    } catch (e) {
      this.error.set(errorMessage(e));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  /** Pri dodavanju se unapred bira prva smena pozicije (npr. "I"), a bez šablona ostaje Od-Do. */
  private chooseDefault(): void {
    const first = this.positionTemplates()[0];
    if (first) {
      this.choose(first.id);
    } else {
      this.choice.set(CUSTOM);
    }
  }

  /** Početna pozicija: ona iz filtera ako je ima (i zaposleni, ako je zadat), inače prva koju zaposleni radi. */
  private pickPosition(): string {
    const preferred = this.defaultPositionId();
    const employee = this.selectedEmployee();
    const candidates = employee ? employee.positions : this.positions();
    return candidates.find((p) => p.id === preferred)?.id ?? candidates[0]?.id ?? '';
  }
}
