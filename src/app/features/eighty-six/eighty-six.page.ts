import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { BoardConnection } from '../../core/board';
import { EightySixItem, Position } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { formatDayShort, utcToLocal } from '../../core/time';

/** Odeljci liste su pozicije sa ovim imenima; naslov je ono što gost zna ("Kuhinja", "Šank"). */
export const SECTIONS = [
  { positionName: 'Kuvar', title: 'Kuhinja' },
  { positionName: 'Šanker', title: 'Šank' },
] as const;

interface Section {
  position: Position;
  title: string;
  items: EightySixItem[];
  editable: boolean;
}

/**
 * 86 lista: šta nema na stanju. Vide je svi zaposleni da ne nude gostima ono čega nema, a stavke dodaju i
 * skidaju kuvari i šankeri (svoj odeljak) i menadžer.
 */
@Component({
  selector: 'app-eighty-six-page',
  imports: [FormsModule],
  template: `
    <div class="mb-5">
      <h1 class="text-xl font-semibold tracking-tight">86 lista</h1>
      <p class="text-sm text-slate-500">
        Ovoga trenutno nema. Ne nudi gostima dok se ne vrati na listu ponude.
        @if (live()) {
          <span class="ml-1 inline-flex items-center gap-1 text-emerald-700"><span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>uživo</span>
        } @else {
          <span class="ml-1 inline-flex items-center gap-1 text-amber-700" role="status"><span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>povezivanje…</span>
        }
      </p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    @if (!loading() && sections().length === 0) {
      <p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
        Restoran nema pozicije Kuvar i Šanker, pa nema ni 86 liste.
      </p>
    }

    <div class="grid gap-5 md:grid-cols-2">
      @for (section of sections(); track section.position.id) {
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" [attr.aria-label]="section.title">
          <h2 class="mb-3 flex items-center gap-2 font-semibold">
            {{ section.title }}
            <span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{{ section.items.length }}</span>
          </h2>

          @if (section.editable) {
            <form class="mb-3 flex gap-2" (ngSubmit)="add(section)">
              <input
                class="field flex-1"
                [name]="'name-' + section.position.id"
                maxlength="100"
                placeholder="Šta je nestalo (npr. Pljeskavica)"
                [attr.aria-label]="'Nova stavka, ' + section.title"
                [ngModel]="draft(section)"
                (ngModelChange)="setDraft(section, $event)"
              />
              <button type="submit" class="btn-primary shrink-0" [disabled]="busy() || !draft(section).trim()">Dodaj</button>
            </form>
          }

          @if (section.items.length === 0) {
            <p class="py-3 text-center text-sm text-slate-500">Sve je na stanju.</p>
          }
          <ul class="divide-y divide-slate-100">
            @for (item of section.items; track item.id) {
              <li class="flex items-center gap-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-slate-900 line-through decoration-red-400">{{ item.name }}</div>
                  <div class="text-xs text-slate-500">{{ item.createdByName }} · {{ since(item) }}@if (item.note) { · {{ item.note }} }</div>
                </div>
                @if (section.editable) {
                  <button type="button" class="btn-secondary shrink-0 px-3 py-1.5" [disabled]="busy()" (click)="remove(item)">Vratilo se</button>
                }
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class EightySixPage {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly board = inject(BoardConnection);

  protected readonly live = computed(() => this.board.status() === 'connected');
  protected readonly positions = signal<Position[]>([]);
  protected readonly items = signal<EightySixItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly drafts = signal<Record<string, string>>({});

  protected readonly sections = computed<Section[]>(() => {
    const mine = new Set((this.auth.user()?.positions ?? []).map((p) => p.id));
    const manager = this.auth.isManager();
    return SECTIONS.flatMap(({ positionName, title }) => {
      const position = this.positions().find((p) => p.name === positionName);
      return position
        ? [{ position, title, items: this.items().filter((i) => i.positionId === position.id), editable: manager || mine.has(position.id) }]
        : [];
    });
  });

  constructor() {
    void this.load();

    // Promene koje su napravili drugi stižu odmah. Dupli red se ne dodaje: i onaj ko menja dobija svoj događaj.
    this.board.eightySixAdded.pipe(takeUntilDestroyed()).subscribe((added) =>
      this.items.update((list) => (list.some((i) => i.id === added.id) ? list : [...list, added])),
    );
    this.board.eightySixRemoved.pipe(takeUntilDestroyed()).subscribe((id) =>
      this.items.update((list) => list.filter((i) => i.id !== id)),
    );
    // Posle prekida veze (ili tek uspostavljene) se ne veruje da ništa nije propušteno: povlači se ceo snimak stanja.
    this.board.reconnected.pipe(takeUntilDestroyed()).subscribe(() => void this.refresh());
  }

  protected draft(section: Section): string {
    return this.drafts()[section.position.id] ?? '';
  }

  protected setDraft(section: Section, value: string): void {
    this.drafts.update((d) => ({ ...d, [section.position.id]: value }));
  }

  /** "Danas 14:05" ili "Pon, 9. 11. 14:05", u zoni restorana. */
  protected since(item: EightySixItem): string {
    const timeZone = this.auth.timeZone();
    const at = utcToLocal(item.createdAt, timeZone);
    const today = utcToLocal(new Date(), timeZone).date;
    return `${at.date === today ? 'danas' : formatDayShort(at.date)} ${at.time}`;
  }

  protected async add(section: Section): Promise<void> {
    const name = this.draft(section).trim();
    if (!name) {
      return;
    }
    await this.run(async () => {
      await this.api.addEightySix(section.position.id, name);
      this.setDraft(section, '');
    });
  }

  protected async remove(item: EightySixItem): Promise<void> {
    await this.run(() => this.api.removeEightySix(item.id));
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [positions, items] = await Promise.all([this.api.positions(), this.api.eightySix()]);
      this.positions.set(positions);
      this.items.set(items);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.items.set(await this.api.eightySix());
    } catch {
      // Sledeći događaj ili ponovno povezivanje će ispraviti prikaz.
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.items.set(await this.api.eightySix());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
