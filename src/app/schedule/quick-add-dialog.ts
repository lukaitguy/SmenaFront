import { Component, inject, input, output, signal } from '@angular/core';
import { positionColor } from '../core/colors';
import { Position, ShiftTemplate } from '../core/models';
import { errorMessage } from '../core/problem';
import { SmenaApi } from '../core/smena-api';
import { addDays, formatDayLong, localToUtc, shortTime } from '../core/time';
import { Modal } from '../ui/modal';

export interface QuickGroup {
  position: Position;
  templates: ShiftTemplate[];
}

/**
 * Brzo dodavanje: za izabranog zaposlenog i dan nudi smene (šablone) njegovih pozicija, a jedan klik pravi smenu.
 * "Drugo vreme" otvara pun dijalog sa Od-Do za izuzetke.
 */
@Component({
  selector: 'app-quick-add-dialog',
  imports: [Modal],
  template: `
    <app-modal title="Dodaj smenu" [subtitle]="who() + ' · ' + dayLabel()" (closed)="closed.emit()">
      <div class="space-y-4">
        @for (group of groups(); track group.position.id) {
          <section>
            @if (groups().length > 1) {
              <h3 class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span class="h-2 w-2 rounded-full" [class]="color(group.position.name).dot"></span>
                {{ group.position.name }}
              </h3>
            }
            <div class="grid grid-cols-2 gap-2">
              @for (template of group.templates; track template.id) {
                <button
                  type="button"
                  class="rounded-xl border px-4 py-3 text-left transition hover:shadow disabled:opacity-60"
                  [class]="color(group.position.name).chip"
                  [disabled]="busy()"
                  (click)="create(group.position, template)"
                >
                  <span class="block text-2xl font-bold leading-none">{{ template.name }}</span>
                  <span class="mt-1.5 block text-sm tabular-nums opacity-80">{{ time(template.startTime) }}–{{ time(template.endTime) }}</span>
                  @if (groups().length === 1) {
                    <span class="mt-0.5 block text-xs opacity-70">{{ group.position.name }}</span>
                  }
                </button>
              }
            </div>
          </section>
        }

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
      </div>

      <ng-container modal-actions>
        <button type="button" class="btn-secondary mr-auto" [disabled]="busy()" (click)="other.emit()">Drugo vreme (Od – Do)…</button>
        <button type="button" class="btn-ghost" (click)="closed.emit()">Otkaži</button>
      </ng-container>
    </app-modal>
  `,
})
export class QuickAddDialog {
  private readonly api = inject(SmenaApi);

  readonly who = input.required<string>();
  readonly date = input.required<string>();
  readonly employeeId = input<string | null>(null);
  readonly groups = input.required<QuickGroup[]>();
  readonly timeZone = input.required<string>();

  readonly created = output<string>();
  readonly other = output<void>();
  readonly closed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected dayLabel(): string {
    return formatDayLong(this.date());
  }

  protected color(name: string) {
    return positionColor(name);
  }

  protected time(value: string): string {
    return shortTime(value);
  }

  protected async create(position: Position, template: ShiftTemplate): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const endDate = template.endsNextDay ? addDays(this.date(), 1) : this.date();
      const timeZone = this.timeZone();
      await this.api.createShift({
        employeeId: this.employeeId(),
        positionId: position.id,
        startsAt: localToUtc(this.date(), shortTime(template.startTime), timeZone).toISOString(),
        endsAt: localToUtc(endDate, shortTime(template.endTime), timeZone).toISOString(),
        note: null,
        templateId: template.id,
      });
      this.created.emit(`Dodata smena ${template.name}: ${this.who()}.`);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
