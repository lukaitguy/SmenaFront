import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { positionColor } from '../../core/colors';
import { Employee, Position } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { ToastService } from '../../ui/toast';

/** Pozicije čije ime koristi 86 lista (odeljci Kuhinja i Šank); preimenovanjem odeljak nestaje sa liste. */
export const LINKED_TO_EIGHTY_SIX = ['Kuvar', 'Šanker'];

/**
 * Pozicije (menadžer): uloge u smeni (konobar, kuvar…). Pravi se nova, preimenuje se i briše. Pozicija koja već
 * ima smene ne može da se obriše; brisanjem se ona skida sa zaposlenih, a brišu se i njeni šabloni smena.
 */
@Component({
  selector: 'app-positions-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mb-5">
      <a routerLink="/zaposleni" class="text-sm text-slate-500 hover:text-brand-700">‹ Zaposleni</a>
      <h1 class="mt-1 text-xl font-semibold tracking-tight">Pozicije</h1>
      <p class="text-sm text-slate-500">Uloge u smeni. Zaposleni može da ima više pozicija.</p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    <form class="mb-4 flex gap-2" (ngSubmit)="add()">
      <input class="field flex-1" name="new" maxlength="100" placeholder="Nova pozicija (npr. Barista)" aria-label="Nova pozicija" [(ngModel)]="newName" />
      <button type="submit" class="btn-primary shrink-0" [disabled]="busy() || !newName().trim()">Dodaj</button>
    </form>
    @if (addError()) {
      <p class="-mt-2 mb-4 text-sm text-red-600" role="alert">{{ addError() }}</p>
    }

    <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
      @for (position of positions(); track position.id) {
        <li class="px-4 py-3">
          @if (editing() === position.id) {
            <form class="flex flex-wrap items-center gap-2" (ngSubmit)="rename(position)">
              <input class="field flex-1" name="rename" maxlength="100" aria-label="Novi naziv pozicije" [(ngModel)]="editName" />
              <button type="submit" class="btn-primary px-3 py-1.5" [disabled]="busy() || !editName().trim()">
                {{ linked(position) && editName().trim() !== position.name ? 'Ipak preimenuj' : 'Sačuvaj' }}
              </button>
              <button type="button" class="btn-ghost px-3 py-1.5" (click)="editing.set(null)">Otkaži</button>
            </form>
            @if (linked(position)) {
              <p class="mt-2 text-xs text-amber-800">
                Naziv „{{ position.name }}" koristi 86 lista. Ako ga promeniš, odeljak
                {{ position.name === 'Kuvar' ? 'Kuhinja' : 'Šank' }} nestaje sa liste.
              </p>
            }
          } @else {
            <div class="flex flex-wrap items-center gap-3">
              <span class="rounded-full border px-2.5 py-0.5 text-sm font-medium" [class]="color(position.name).chip">{{ position.name }}</span>
              <span class="flex-1 text-xs text-slate-500">{{ usage(position) }}</span>
              <button type="button" class="btn-secondary px-3 py-1.5" (click)="startEdit(position)">Preimenuj</button>
              @if (confirming() === position.id) {
                <button type="button" class="btn-danger px-3 py-1.5" [disabled]="busy()" (click)="remove(position)">Da, obriši</button>
                <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(null)">Ne</button>
              } @else {
                <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(position.id)">Obriši</button>
              }
            </div>
            @if (confirming() === position.id) {
              <p class="mt-2 text-xs text-slate-600">{{ consequences(position) }}</p>
            }
          }
          @if (rowError()[position.id]; as message) {
            <p class="mt-2 text-sm text-red-600" role="alert">{{ message }}</p>
          }
        </li>
      } @empty {
        @if (!loading()) {
          <li class="px-4 py-6 text-center text-sm text-slate-500">Nema pozicija. Dodaj prvu iznad.</li>
        }
      }
    </ul>
  `,
})
export class PositionsPage {
  private readonly api = inject(SmenaApi);
  private readonly toast = inject(ToastService);

  protected readonly positions = signal<Position[]>([]);
  protected readonly employees = signal<Employee[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly addError = signal('');
  protected readonly rowError = signal<Record<string, string>>({});
  protected readonly newName = signal('');
  protected readonly editing = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly confirming = signal<string | null>(null);

  /** Koliko aktivnih zaposlenih ima pojedinu poziciju. */
  private readonly activeCounts = computed(() => this.countBy((e) => e.status === 'Active'));
  private readonly allCounts = computed(() => this.countBy(() => true));

  constructor() {
    void this.load();
  }

  protected color(name: string) {
    return positionColor(name);
  }

  protected linked(position: Position): boolean {
    return LINKED_TO_EIGHTY_SIX.includes(position.name);
  }

  protected usage(position: Position): string {
    const count = this.activeCounts().get(position.id) ?? 0;
    const people = count === 1 ? '1 zaposleni' : `${count} zaposlenih`;
    return this.linked(position) ? `${people} · odeljak 86 liste` : people;
  }

  protected consequences(position: Position): string {
    const count = this.allCounts().get(position.id) ?? 0;
    const parts = [
      count > 0 ? `skida se sa ${count} zaposlenih` : 'nema zaposlenih sa ovom pozicijom',
      'brišu se njeni šabloni smena',
      ...(this.linked(position) ? ['briše se odeljak 86 liste'] : []),
    ];
    return `Brisanjem: ${parts.join(', ')}. Ne može ako pozicija već ima smene u rasporedu.`;
  }

  protected startEdit(position: Position): void {
    this.editing.set(position.id);
    this.editName.set(position.name);
    this.confirming.set(null);
  }

  protected async add(): Promise<void> {
    const name = this.newName().trim();
    if (!name) {
      return;
    }
    this.busy.set(true);
    this.addError.set('');
    try {
      const created = await this.api.createPosition(name);
      this.positions.update((list) => this.sorted([...list, created]));
      this.newName.set('');
      this.toast.success(`Dodata pozicija: ${created.name}.`);
    } catch (e) {
      this.addError.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async rename(position: Position): Promise<void> {
    const name = this.editName().trim();
    if (name === position.name) {
      this.editing.set(null);
      return;
    }
    await this.run(position.id, async () => {
      const updated = await this.api.renamePosition(position.id, name);
      this.positions.update((list) => this.sorted(list.map((p) => (p.id === updated.id ? updated : p))));
      this.editing.set(null);
      this.toast.success(`Preimenovano u: ${updated.name}.`);
    });
  }

  protected async remove(position: Position): Promise<void> {
    await this.run(position.id, async () => {
      await this.api.deletePosition(position.id);
      this.positions.update((list) => list.filter((p) => p.id !== position.id));
      this.confirming.set(null);
      this.toast.success(`Obrisana pozicija: ${position.name}.`);
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [positions, employees] = await Promise.all([this.api.positions(), this.api.employees()]);
      this.positions.set(this.sorted(positions));
      this.employees.set(employees);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private countBy(include: (employee: Employee) => boolean): Map<string, number> {
    const counts = new Map<string, number>();
    for (const employee of this.employees().filter(include)) {
      for (const position of employee.positions) {
        counts.set(position.id, (counts.get(position.id) ?? 0) + 1);
      }
    }
    return counts;
  }

  private sorted(list: Position[]): Position[] {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'sr-Latn'));
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
