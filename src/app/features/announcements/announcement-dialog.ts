import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { positionColor, positionsLabel } from '../../core/colors';
import { Announcement, Employee, Position } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { addDays, localToUtc, todayIn } from '../../core/time';
import { Modal } from '../../ui/modal';

/**
 * Nova najava (menadžer): naslov, opis i opcioni termin, pa kome ide: cele uloge i/ili pojedinačne osobe.
 * Primaoci su zbir oba izbora, bez autora.
 */
@Component({
  selector: 'app-announcement-dialog',
  imports: [FormsModule, Modal],
  template: `
    <app-modal title="Nova najava" [subtitle]="'Primaoci: ' + recipientCount()" (closed)="closed.emit()">
      <form id="announcement-form" class="space-y-4" (ngSubmit)="save()">
        <div>
          <label class="label" for="ann-title">Naslov</label>
          <input id="ann-title" name="title" class="field" maxlength="100" required placeholder="npr. Sastanak sale" [(ngModel)]="title" />
        </div>

        <div>
          <label class="label" for="ann-body">Opis <span class="font-normal text-slate-400">(nije obavezno)</span></label>
          <textarea id="ann-body" name="body" class="field min-h-24" maxlength="2000" [(ngModel)]="body"></textarea>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="hasMeeting" class="h-4 w-4 rounded border-slate-300 text-brand-600" [(ngModel)]="hasMeeting" />
            Sastanak ima termin
          </label>
          @if (hasMeeting()) {
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="ann-date">Datum</label>
                <input id="ann-date" name="date" type="date" class="field" required [min]="today()" [(ngModel)]="date" />
              </div>
              <div>
                <label class="label" for="ann-time">Vreme</label>
                <input id="ann-time" name="time" type="time" class="field" required [(ngModel)]="time" />
              </div>
            </div>
          }
        </div>

        <fieldset>
          <legend class="label">Uloge koje prisustvuju</legend>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Uloge">
            @for (position of positions(); track position.id) {
              <button
                type="button"
                class="rounded-full border px-3 py-1 text-sm font-medium transition"
                [class]="selectedPositions().has(position.id) ? color(position.name).chip + ' ring-2 ring-brand-600/40' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
                [attr.aria-pressed]="selectedPositions().has(position.id)"
                (click)="togglePosition(position.id)"
              >
                {{ position.name }}
              </button>
            }
          </div>
        </fieldset>

        <fieldset>
          <legend class="label">Pojedinačne osobe <span class="font-normal text-slate-400">(pored uloga)</span></legend>
          <input class="field mb-2" name="search" type="search" placeholder="Traži po imenu…" aria-label="Traži zaposlenog" [(ngModel)]="search" />
          <ul class="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            @for (employee of shownEmployees(); track employee.id) {
              <li>
                <label class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300 text-brand-600"
                    [checked]="isChecked(employee)"
                    [disabled]="coveredByRole(employee)"
                    [attr.aria-label]="employee.firstName + ' ' + employee.lastName"
                    (change)="toggleEmployee(employee.id)"
                  />
                  <span class="flex-1">{{ employee.firstName }} {{ employee.lastName }}</span>
                  <span class="text-xs text-slate-500">{{ coveredByRole(employee) ? 'preko uloge' : roles(employee) }}</span>
                </label>
              </li>
            }
            @if (shownEmployees().length === 0) {
              <li class="px-3 py-3 text-center text-sm text-slate-500">Nema rezultata.</li>
            }
          </ul>
        </fieldset>

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
      </form>

      <ng-container modal-actions>
        <button type="button" class="btn-secondary" (click)="closed.emit()">Otkaži</button>
        <button type="submit" form="announcement-form" class="btn-primary" [disabled]="busy()">
          {{ busy() ? 'Slanje…' : 'Objavi najavu' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class AnnouncementDialog {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);

  readonly positions = input.required<Position[]>();
  readonly employees = input.required<Employee[]>();

  readonly created = output<Announcement>();
  readonly closed = output<void>();

  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly hasMeeting = signal(false);
  protected readonly date = signal(addDays(todayIn(this.auth.timeZone()), 1));
  protected readonly time = signal('15:00');
  protected readonly search = signal('');
  protected readonly selectedPositions = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedEmployees = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly today = computed(() => todayIn(this.auth.timeZone()));

  /** Aktivni zaposleni koji mogu da dobiju najavu: bez autora, koji je sam sebi ne šalje. */
  private readonly candidates = computed(() =>
    this.employees()
      .filter((e) => e.status === 'Active' && e.id !== this.auth.user()?.employeeId)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'sr-Latn')),
  );

  protected readonly shownEmployees = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.candidates().filter((e) => !query || `${e.firstName} ${e.lastName}`.toLowerCase().includes(query));
  });

  protected readonly recipientCount = computed(
    () => this.candidates().filter((e) => this.coveredByRole(e) || this.selectedEmployees().has(e.id)).length,
  );

  protected color(name: string) {
    return positionColor(name);
  }

  protected roles(employee: Employee): string {
    return positionsLabel(employee.positions.map((p) => p.name));
  }

  protected coveredByRole(employee: Employee): boolean {
    return employee.positions.some((p) => this.selectedPositions().has(p.id));
  }

  protected isChecked(employee: Employee): boolean {
    return this.coveredByRole(employee) || this.selectedEmployees().has(employee.id);
  }

  protected togglePosition(id: string): void {
    this.selectedPositions.update((set) => toggled(set, id));
  }

  protected toggleEmployee(id: string): void {
    this.selectedEmployees.update((set) => toggled(set, id));
  }

  protected async save(): Promise<void> {
    if (!this.title().trim()) {
      this.error.set('Upiši naslov najave.');
      return;
    }
    if (this.selectedPositions().size === 0 && this.selectedEmployees().size === 0) {
      this.error.set('Izaberi uloge ili osobe kojima je najava namenjena.');
      return;
    }
    if (this.recipientCount() === 0) {
      this.error.set('Izabrane uloge nemaju nijednog aktivnog zaposlenog. Izaberi druge ili dodaj osobe.');
      return;
    }

    let meetingAt: string | null = null;
    if (this.hasMeeting()) {
      const at = localToUtc(this.date(), this.time(), this.auth.timeZone());
      if (at.getTime() <= Date.now()) {
        this.error.set('Termin sastanka mora biti u budućnosti.');
        return;
      }
      meetingAt = at.toISOString();
    }

    this.busy.set(true);
    this.error.set('');
    try {
      const announcement = await this.api.createAnnouncement({
        title: this.title().trim(),
        body: this.body().trim() || null,
        meetingAt,
        positionIds: [...this.selectedPositions()],
        // Osobe koje već dobijaju najavu preko uloge se ne šalju posebno.
        employeeIds: [...this.selectedEmployees()].filter((id) => !this.coveredByRole(this.candidates().find((e) => e.id === id)!)),
      });
      this.created.emit(announcement);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) {
    next.add(id);
  }
  return next;
}
