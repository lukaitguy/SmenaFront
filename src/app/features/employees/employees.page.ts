import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { positionColor } from '../../core/colors';
import { Employee, Invitation, Position } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { ROLE_BADGES, ROLE_LABELS } from '../../core/roles';
import { SmenaApi } from '../../core/smena-api';
import { utcToLocal } from '../../core/time';
import { ToastService } from '../../ui/toast';
import { EmployeeDialog } from './employee-dialog';
import { InviteDialog } from './invite-dialog';

/**
 * Zaposleni (menadžer): ko radi u restoranu, koje uloge ima, izmena, deaktivacija i pozivanje novih.
 * Neaktivan zaposleni ostaje u istoriji, ali se ne može rasporediti i ne prima najave.
 */
@Component({
  selector: 'app-employees-page',
  imports: [EmployeeDialog, InviteDialog, RouterLink],
  template: `
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Zaposleni</h1>
        <p class="text-sm text-slate-500">{{ active().length }} aktivnih · {{ invitations().length }} pozivnica na čekanju</p>
      </div>
      <a routerLink="/pozicije" class="btn-secondary ml-auto">Pozicije</a>
      <button type="button" class="btn-primary" (click)="inviting.set(true)">+ Pozovi zaposlenog</button>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    <section aria-labelledby="active-title" class="mb-8">
      <h2 id="active-title" class="sr-only">Aktivni zaposleni</h2>
      <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        @for (employee of active(); track employee.id) {
          <li class="flex flex-wrap items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-slate-900">{{ employee.firstName }} {{ employee.lastName }}</span>
                @if (isMe(employee)) {
                  <span class="text-xs text-slate-400">(ti)</span>
                }
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" [class]="badge(employee)">{{ roleLabel(employee) }}</span>
              </div>
              <div class="mt-1 flex flex-wrap gap-1.5">
                @for (position of employee.positions; track position.id) {
                  <span class="rounded-full border px-2 py-0.5 text-xs font-medium" [class]="color(position.name).chip">{{ position.name }}</span>
                } @empty {
                  <span class="text-xs text-amber-700">Bez pozicije, ne može u raspored</span>
                }
              </div>
              @if (rowError()[employee.id]; as message) {
                <div class="mt-1 text-sm text-red-600" role="alert">{{ message }}</div>
              }
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button type="button" class="btn-secondary px-3 py-1.5" (click)="editing.set(employee)">Izmeni</button>
              @if (canDeactivate(employee)) {
                @if (confirming() === employee.id) {
                  <button type="button" class="btn-danger px-3 py-1.5" [disabled]="busy()" (click)="setStatus(employee, 'Inactive')">Da, deaktiviraj</button>
                  <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(null)">Ne</button>
                } @else {
                  <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(employee.id)">Deaktiviraj</button>
                }
              }
            </div>
          </li>
        }
      </ul>
    </section>

    @if (invitations().length > 0) {
      <section aria-labelledby="invitations-title" class="mb-8">
        <h2 id="invitations-title" class="mb-2 text-sm font-semibold text-slate-700">Pozivnice na čekanju ({{ invitations().length }})</h2>
        <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          @for (invitation of invitations(); track invitation.id) {
            <li class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div class="min-w-0 flex-1">
                <div class="font-medium text-slate-900">{{ invitation.email }}</div>
                <div class="text-xs text-slate-500">
                  {{ roleOf(invitation) }}@if (positionName(invitation); as position) { · {{ position }} } · važi do {{ expires(invitation) }}
                </div>
                @if (rowError()[invitation.id]; as message) {
                  <div class="mt-1 text-red-600" role="alert">{{ message }}</div>
                }
              </div>
              <div class="flex shrink-0 gap-2">
                <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="resend(invitation)">Pošalji ponovo</button>
                <button type="button" class="btn-ghost px-3 py-1.5" [disabled]="busy()" (click)="revoke(invitation)">Povuci</button>
              </div>
            </li>
          }
        </ul>
        <p class="mt-2 text-xs text-slate-500">„Pošalji ponovo" pravi novi link i poništava prethodni.</p>
      </section>
    }

    @if (inactive().length > 0) {
      <section aria-labelledby="inactive-title">
        <button type="button" class="mb-2 text-sm font-semibold text-slate-700 hover:text-brand-700" [attr.aria-expanded]="showInactive()" (click)="showInactive.set(!showInactive())">
          Neaktivni ({{ inactive().length }}) <span aria-hidden="true">{{ showInactive() ? '▴' : '▾' }}</span>
        </button>
        @if (showInactive()) {
          <ul id="inactive-title" class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            @for (employee of inactive(); track employee.id) {
              <li class="flex flex-wrap items-center gap-3 px-4 py-3">
                <span class="min-w-0 flex-1 text-slate-500">{{ employee.firstName }} {{ employee.lastName }}</span>
                <button type="button" class="btn-secondary px-3 py-1.5" [disabled]="busy()" (click)="setStatus(employee, 'Active')">Aktiviraj</button>
              </li>
            }
          </ul>
        }
      </section>
    }

    @if (editing(); as employee) {
      <app-employee-dialog [employee]="employee" [positions]="positions()" (saved)="onSaved($event)" (closed)="editing.set(null)" />
    }
    @if (inviting()) {
      <app-invite-dialog [positions]="positions()" (created)="onInvited()" (closed)="inviting.set(false)" />
    }
  `,
})
export class EmployeesPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly employees = signal<Employee[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly positions = signal<Position[]>([]);
  protected readonly editing = signal<Employee | null>(null);
  protected readonly inviting = signal(false);
  protected readonly showInactive = signal(false);
  protected readonly confirming = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly rowError = signal<Record<string, string>>({});

  protected readonly active = computed(() => this.employees().filter((e) => e.status === 'Active'));
  protected readonly inactive = computed(() => this.employees().filter((e) => e.status === 'Inactive'));

  constructor() {
    void this.load();
  }

  protected isMe(employee: Employee): boolean {
    return employee.id === this.auth.user()?.employeeId;
  }

  protected roleLabel(employee: Employee): string {
    return ROLE_LABELS[employee.role];
  }

  protected badge(employee: Employee): string {
    return ROLE_BADGES[employee.role];
  }

  protected roleOf(invitation: Invitation): string {
    return ROLE_LABELS[invitation.role];
  }

  protected color(name: string) {
    return positionColor(name);
  }

  protected positionName(invitation: Invitation): string | null {
    return this.positions().find((p) => p.id === invitation.positionId)?.name ?? null;
  }

  protected expires(invitation: Invitation): string {
    const local = utcToLocal(invitation.expiresAt, this.auth.timeZone());
    return `${local.date.slice(8)}.${local.date.slice(5, 7)}.`;
  }

  /** Vlasnik i prijavljeni korisnik se ne deaktiviraju (server to ionako ne dozvoljava). */
  protected canDeactivate(employee: Employee): boolean {
    return employee.role !== 'Owner' && !this.isMe(employee);
  }

  protected onSaved(updated: Employee): void {
    this.editing.set(null);
    this.employees.update((list) => list.map((e) => (e.id === updated.id ? updated : e)));
    this.toast.success(`Sačuvano: ${updated.firstName} ${updated.lastName}.`);
  }

  /** Spisak se osvežava dok je dijalog sa linkom još otvoren. */
  protected onInvited(): void {
    void this.loadInvitations();
  }

  protected async setStatus(employee: Employee, status: 'Active' | 'Inactive'): Promise<void> {
    await this.run(employee.id, async () => {
      const updated = await this.api.setEmployeeStatus(employee.id, status);
      this.employees.update((list) => list.map((e) => (e.id === updated.id ? updated : e)));
      this.confirming.set(null);
      this.toast.success(status === 'Active' ? `${employee.firstName} je ponovo aktivan.` : `${employee.firstName} je deaktiviran.`);
    });
  }

  protected async revoke(invitation: Invitation): Promise<void> {
    await this.run(invitation.id, async () => {
      await this.api.revokeInvitation(invitation.id);
      this.invitations.update((list) => list.filter((i) => i.id !== invitation.id));
      this.toast.success(`Pozivnica za ${invitation.email} je povučena.`);
    });
  }

  protected async resend(invitation: Invitation): Promise<void> {
    await this.run(invitation.id, async () => {
      const created = await this.api.createInvitation({ email: invitation.email, role: invitation.role, positionId: invitation.positionId });
      await this.loadInvitations();
      this.toast.success(created.emailSent ? `Pozivnica je ponovo poslata: ${invitation.email}.` : 'Mejl nije poslat. Pozovi osobu ponovo da dobiješ link.');
    });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      const [employees, invitations, positions] = await Promise.all([this.api.employees(), this.api.invitations(), this.api.positions()]);
      this.employees.set(employees);
      this.invitations.set(invitations);
      this.positions.set(positions);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  private async loadInvitations(): Promise<void> {
    try {
      this.invitations.set(await this.api.invitations());
    } catch {
      // spisak se osvežava sledećim učitavanjem
    }
  }

  private async run(id: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.rowError.update(({ [id]: _, ...rest }) => rest);
    try {
      await action();
    } catch (e) {
      this.rowError.update((errors) => ({ ...errors, [id]: errorMessage(e) }));
    } finally {
      this.busy.set(false);
    }
  }
}
