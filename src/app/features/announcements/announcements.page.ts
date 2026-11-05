import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { AnnouncementsStore } from '../../core/announcements';
import { Announcement, Employee, Position } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { formatDayLong, utcToLocal } from '../../core/time';
import { ToastService } from '../../ui/toast';
import { AnnouncementDialog } from './announcement-dialog';

/**
 * Najave: svi vide ono što su primili i potvrđuju "Pročitao sam". Menadžer ih pravi, briše i vidi ko je pročitao.
 */
@Component({
  selector: 'app-announcements-page',
  imports: [AnnouncementDialog],
  template: `
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Najave</h1>
        <p class="text-sm text-slate-500">Sastanci i obaveštenja za tvoju ulogu.</p>
      </div>
      @if (isManager()) {
        <button type="button" class="btn-primary ml-auto" (click)="openDialog()">+ Nova najava</button>
      }
    </div>

    @if (store.error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ store.error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="store.load()">Pokušaj ponovo</button>
      </div>
    }

    @if (!store.loading() && store.items().length === 0 && !store.error()) {
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p class="font-medium text-slate-700">Nema najava.</p>
        <p class="mt-1 text-sm text-slate-500">
          {{ isManager() ? 'Napravi prvu najavu za sastanak ili obaveštenje.' : 'Kad menadžer objavi najavu za tebe, pojaviće se ovde.' }}
        </p>
      </div>
    }

    <ul class="space-y-3">
      @for (item of store.items(); track item.id) {
        <li
          class="rounded-xl border bg-white p-4 shadow-sm"
          [class]="unread(item) ? 'border-brand-300 ring-2 ring-brand-200' : 'border-slate-200'"
        >
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <h2 class="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                {{ item.title }}
                @if (unread(item)) {
                  <span class="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">novo</span>
                }
              </h2>
              @if (item.meetingAt) {
                <p class="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-900">
                  <span aria-hidden="true">📅</span> {{ meeting(item.meetingAt) }}
                </p>
              }
              @if (item.body) {
                <p class="mt-2 whitespace-pre-line text-sm text-slate-700">{{ item.body }}</p>
              }
              <p class="mt-2 text-xs text-slate-500">
                {{ item.createdByName }} · {{ created(item.createdAt) }} · Za: {{ item.audience.join(', ') }}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              @if (item.forMe) {
                @if (item.readAt) {
                  <span class="text-sm font-medium text-emerald-700">✓ Pročitano</span>
                } @else {
                  <button type="button" class="btn-primary px-3 py-1.5" [disabled]="busy()" (click)="markRead(item)">Pročitao sam</button>
                }
              }
              @if (isManager()) {
                @if (confirming() === item.id) {
                  <button type="button" class="btn-danger px-3 py-1.5" [disabled]="busy()" (click)="remove(item)">Da, obriši</button>
                  <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(null)">Ne</button>
                } @else {
                  <button type="button" class="btn-ghost px-3 py-1.5" aria-label="Obriši najavu" (click)="confirming.set(item.id)">Obriši</button>
                }
              }
            </div>
          </div>

          @if (item.recipients; as recipients) {
            <div class="mt-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                class="text-sm font-medium text-slate-700 hover:text-brand-700"
                [attr.aria-expanded]="expanded() === item.id"
                (click)="expanded.set(expanded() === item.id ? null : item.id)"
              >
                Pročitalo {{ readCount(recipients) }} od {{ recipients.length }}
                <span aria-hidden="true">{{ expanded() === item.id ? '▴' : '▾' }}</span>
              </button>
              @if (expanded() === item.id) {
                <ul class="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  @for (r of recipients; track r.employeeId) {
                    <li class="flex items-center gap-2">
                      <span [class]="r.readAt ? 'text-emerald-600' : 'text-slate-300'" aria-hidden="true">{{ r.readAt ? '✓' : '○' }}</span>
                      <span [class]="r.readAt ? 'text-slate-800' : 'text-slate-500'">{{ r.name }}</span>
                      @if (r.readAt) {
                        <span class="text-xs text-slate-400">{{ created(r.readAt) }}</span>
                      } @else {
                        <span class="text-xs text-slate-400">nije pročitao</span>
                      }
                    </li>
                  }
                </ul>
              }
            </div>
          }
        </li>
      }
    </ul>

    @if (dialog()) {
      <app-announcement-dialog [positions]="positions()" [employees]="employees()" (created)="onCreated($event)" (closed)="dialog.set(false)" />
    }
  `,
})
export class AnnouncementsPage {
  protected readonly store = inject(AnnouncementsStore);
  private readonly auth = inject(AuthService);
  private readonly api = inject(SmenaApi);
  private readonly toast = inject(ToastService);

  protected readonly isManager = this.auth.isManager;
  protected readonly dialog = signal(false);
  protected readonly positions = signal<Position[]>([]);
  protected readonly employees = signal<Employee[]>([]);
  protected readonly busy = signal(false);
  protected readonly confirming = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);

  protected unread(item: Announcement): boolean {
    return item.forMe && !item.readAt;
  }

  protected readCount(recipients: { readAt: string | null }[]): number {
    return recipients.filter((r) => r.readAt).length;
  }

  /** "Ponedeljak, 9. novembar u 15:00", u zoni restorana. */
  protected meeting(at: string): string {
    const local = utcToLocal(at, this.auth.timeZone());
    return `${formatDayLong(local.date)} u ${local.time}`;
  }

  protected created(at: string): string {
    const local = utcToLocal(at, this.auth.timeZone());
    return `${local.date.slice(8)}.${local.date.slice(5, 7)}. ${local.time}`;
  }

  protected async openDialog(): Promise<void> {
    try {
      const [positions, employees] = await Promise.all([this.api.positions(), this.api.employees()]);
      this.positions.set(positions);
      this.employees.set(employees);
      this.dialog.set(true);
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  protected onCreated(announcement: Announcement): void {
    this.dialog.set(false);
    this.store.added(announcement);
    this.toast.success(`Najava je poslata: ${announcement.recipients?.length ?? 0} primalaca.`);
  }

  protected async markRead(item: Announcement): Promise<void> {
    await this.run(() => this.store.markRead(item));
  }

  protected async remove(item: Announcement): Promise<void> {
    await this.run(async () => {
      await this.store.delete(item);
      this.confirming.set(null);
      this.toast.success('Najava je obrisana.');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
