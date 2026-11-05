import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { positionColor } from '../../core/colors';
import { Employee, Position, Role } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { ROLE_LABELS } from '../../core/roles';
import { SmenaApi } from '../../core/smena-api';
import { Modal } from '../../ui/modal';

/**
 * Izmena zaposlenog: ime, uloga u sistemu i pozicije (može ih biti više, npr. Konobar i Šanker).
 * Ulogu vlasnika niko ne menja, a niko ne menja ni sopstvenu.
 */
@Component({
  selector: 'app-employee-dialog',
  imports: [FormsModule, Modal],
  template: `
    <app-modal title="Izmena zaposlenog" [subtitle]="employee().firstName + ' ' + employee().lastName" (closed)="closed.emit()">
      <form id="employee-form" class="space-y-4" (ngSubmit)="save()">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="emp-first">Ime</label>
            <input id="emp-first" name="first" class="field" required maxlength="100" [(ngModel)]="firstName" />
          </div>
          <div>
            <label class="label" for="emp-last">Prezime</label>
            <input id="emp-last" name="last" class="field" required maxlength="100" [(ngModel)]="lastName" />
          </div>
        </div>

        <div>
          <label class="label" for="emp-role">Uloga u aplikaciji</label>
          <select id="emp-role" name="role" class="field" [disabled]="roleLocked()" [(ngModel)]="role">
            @if (employee().role === 'Owner') {
              <option value="Owner">{{ roleLabels.Owner }}</option>
            }
            <option value="Staff">{{ roleLabels.Staff }}</option>
            <option value="Manager">{{ roleLabels.Manager }}</option>
          </select>
          <p class="mt-1 text-xs text-slate-500">
            @if (lockReason()) {
              {{ lockReason() }}
            } @else {
              Menadžer pravi raspored, odobrava zahteve i pravi najave. Zaposleni vidi svoje smene i traži zamene.
            }
          </p>
        </div>

        <fieldset>
          <legend class="label">Pozicije u smeni</legend>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Pozicije">
            @for (position of positions(); track position.id) {
              <button
                type="button"
                class="rounded-full border px-3 py-1 text-sm font-medium transition"
                [class]="selected().has(position.id) ? color(position.name).chip + ' ring-2 ring-brand-600/40' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
                [attr.aria-pressed]="selected().has(position.id)"
                (click)="toggle(position.id)"
              >
                {{ position.name }}
              </button>
            }
          </div>
          @if (selected().size === 0) {
            <p class="mt-2 text-xs text-amber-700">Bez pozicije se zaposleni ne može rasporediti u smenu.</p>
          } @else if (selected().size > 1) {
            <p class="mt-2 text-xs text-slate-500">Radi više uloga: menadžer bira koju radi svaki dan posebno.</p>
          }
        </fieldset>

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
      </form>

      <ng-container modal-actions>
        <button type="button" class="btn-secondary" (click)="closed.emit()">Otkaži</button>
        <button type="submit" form="employee-form" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Čuvanje…' : 'Sačuvaj' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class EmployeeDialog implements OnInit {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);

  readonly employee = input.required<Employee>();
  readonly positions = input.required<Position[]>();

  readonly saved = output<Employee>();
  readonly closed = output<void>();

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly role = signal<Role>('Staff');
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly lockReason = computed(() => {
    if (this.employee().role === 'Owner') {
      return 'Ulogu vlasnika ne može niko da menja.';
    }
    if (this.employee().id === this.auth.user()?.employeeId) {
      return 'Sopstvenu ulogu ne možeš da menjaš.';
    }
    return '';
  });
  protected readonly roleLocked = computed(() => this.lockReason() !== '');

  ngOnInit(): void {
    const e = this.employee();
    this.firstName.set(e.firstName);
    this.lastName.set(e.lastName);
    this.role.set(e.role);
    this.selected.set(new Set(e.positions.map((p) => p.id)));
  }

  protected color(name: string) {
    return positionColor(name);
  }

  protected toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await this.api.updateEmployee(this.employee().id, {
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        role: this.role(),
        positionIds: [...this.selected()],
      });
      this.saved.emit(updated);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
