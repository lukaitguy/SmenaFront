import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { positionColor } from '../../core/colors';
import { Position, ShiftTemplate } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { shortTime } from '../../core/time';
import { ToastService } from '../../ui/toast';

const MAX_NAME = 20;
const MAX_HOURS = 16;

/** Trajanje u minutima; kraj pre ili jednak početku znači da se smena završava sutradan. */
export function templateMinutes(start: string, end: string): number {
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? diff : diff + 24 * 60;
}

export function formatTemplateDuration(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} h`;
}

type Editor = { kind: 'new'; positionId: string } | { kind: 'edit'; templateId: string };

/**
 * Šabloni smena (menadžer): uobičajene smene po poziciji ("I" 08:00–16:00, "II" 16:00–00:00) koje se u rasporedu
 * prave jednim klikom. Izmena važi za ubuduće, a već napravljene smene zadržavaju svoje vreme.
 */
@Component({
  selector: 'app-templates-page',
  imports: [FormsModule, NgTemplateOutlet, RouterLink],
  template: `
    <div class="mb-5">
      <a routerLink="/raspored" class="text-sm text-slate-500 hover:text-brand-700">‹ Raspored</a>
      <h1 class="mt-1 text-xl font-semibold tracking-tight">Šabloni smena</h1>
      <p class="text-sm text-slate-500">Uobičajene smene svake pozicije. Vreme je lokalno vreme restorana.</p>
    </div>

    @if (error()) {
      <div class="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        <span class="flex-1">{{ error() }}</span>
        <button type="button" class="btn-secondary px-3 py-1" (click)="load()">Pokušaj ponovo</button>
      </div>
    }

    <div class="space-y-4">
      @for (group of groups(); track group.position.id) {
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" [attr.aria-label]="group.position.name">
          <div class="mb-3 flex items-center gap-3">
            <span class="rounded-full border px-2.5 py-0.5 text-sm font-semibold" [class]="color(group.position.name).chip">{{ group.position.name }}</span>
            <button type="button" class="btn-secondary ml-auto px-3 py-1.5" (click)="startNew(group.position)">+ Nova smena</button>
          </div>

          <ul class="divide-y divide-slate-100">
            @for (template of group.templates; track template.id) {
              <li class="py-2.5">
                @if (isEditing(template)) {
                  <ng-container [ngTemplateOutlet]="form" />
                } @else {
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-bold" [class]="color(group.position.name).chip">{{ template.name }}</span>
                    <span class="font-medium tabular-nums text-slate-800">{{ time(template.startTime) }}–{{ time(template.endTime) }}</span>
                    <span class="text-xs text-slate-500">{{ duration(template) }}@if (template.endsNextDay) { · završava se sutradan }</span>
                    <span class="flex-1"></span>
                    <button type="button" class="btn-secondary px-3 py-1.5" (click)="startEdit(template)">Izmeni</button>
                    @if (confirming() === template.id) {
                      <button type="button" class="btn-danger px-3 py-1.5" [disabled]="busy()" (click)="remove(template)">Da, obriši</button>
                      <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(null)">Ne</button>
                    } @else {
                      <button type="button" class="btn-ghost px-3 py-1.5" (click)="confirming.set(template.id)">Obriši</button>
                    }
                  </div>
                  @if (confirming() === template.id) {
                    <p class="mt-2 text-xs text-slate-600">Smene napravljene po ovom šablonu ostaju u rasporedu, samo gube oznaku „{{ template.name }}".</p>
                  }
                  @if (rowError()[template.id]; as message) {
                    <p class="mt-2 text-sm text-red-600" role="alert">{{ message }}</p>
                  }
                }
              </li>
            }
            @if (group.templates.length === 0 && !isNewIn(group.position)) {
              <li class="py-3 text-sm text-slate-500">Nema šablona. Smene ove pozicije se prave sa proizvoljnim vremenom.</li>
            }
            @if (isNewIn(group.position)) {
              <li class="py-2.5">
                <ng-container [ngTemplateOutlet]="form" />
              </li>
            }
          </ul>
        </section>
      }
    </div>

    <ng-template #form>
      <form class="space-y-2" (ngSubmit)="save()">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="label" for="tpl-name">Naziv</label>
            <input id="tpl-name" name="name" class="field w-28" maxlength="20" required placeholder="npr. III" [(ngModel)]="name" />
          </div>
          <div>
            <label class="label" for="tpl-start">Od</label>
            <input id="tpl-start" name="start" type="time" class="field" required [(ngModel)]="start" />
          </div>
          <div>
            <label class="label" for="tpl-end">Do</label>
            <input id="tpl-end" name="end" type="time" class="field" required [(ngModel)]="end" />
          </div>
          <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Čuvanje…' : 'Sačuvaj' }}</button>
          <button type="button" class="btn-ghost" (click)="editor.set(null)">Otkaži</button>
        </div>
        <p class="text-xs text-slate-500">
          @if (start() && end() && start() !== end()) {
            Traje {{ previewDuration() }}@if (previewOvernight()) { i završava se sutradan }.
          }
          @if (editor()?.kind === 'edit') {
            Izmena važi za nove smene; postojeće zadržavaju vreme.
          }
        </p>
        @if (formError()) {
          <p class="text-sm text-red-600" role="alert">{{ formError() }}</p>
        }
      </form>
    </ng-template>
  `,
})
export class TemplatesPage {
  private readonly api = inject(SmenaApi);
  private readonly toast = inject(ToastService);

  protected readonly positions = signal<Position[]>([]);
  protected readonly templates = signal<ShiftTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly rowError = signal<Record<string, string>>({});
  protected readonly confirming = signal<string | null>(null);
  protected readonly editor = signal<Editor | null>(null);

  protected readonly name = signal('');
  protected readonly start = signal('08:00');
  protected readonly end = signal('16:00');

  protected readonly groups = computed(() =>
    [...this.positions()]
      .sort((a, b) => a.name.localeCompare(b.name, 'sr-Latn'))
      .map((position) => ({
        position,
        templates: this.templates()
          .filter((t) => t.positionId === position.id)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      })),
  );

  protected readonly previewDuration = computed(() => formatTemplateDuration(templateMinutes(this.start(), this.end())));
  protected readonly previewOvernight = computed(() => this.end() <= this.start());

  constructor() {
    void this.load();
  }

  protected color(name: string) {
    return positionColor(name);
  }

  protected time(value: string): string {
    return shortTime(value);
  }

  protected duration(template: ShiftTemplate): string {
    return formatTemplateDuration(templateMinutes(template.startTime, template.endTime));
  }

  protected isEditing(template: ShiftTemplate): boolean {
    const editor = this.editor();
    return editor?.kind === 'edit' && editor.templateId === template.id;
  }

  protected isNewIn(position: Position): boolean {
    const editor = this.editor();
    return editor?.kind === 'new' && editor.positionId === position.id;
  }

  protected startNew(position: Position): void {
    this.editor.set({ kind: 'new', positionId: position.id });
    this.name.set('');
    this.start.set('08:00');
    this.end.set('16:00');
    this.formError.set('');
    this.confirming.set(null);
  }

  protected startEdit(template: ShiftTemplate): void {
    this.editor.set({ kind: 'edit', templateId: template.id });
    this.name.set(template.name);
    this.start.set(shortTime(template.startTime));
    this.end.set(shortTime(template.endTime));
    this.formError.set('');
    this.confirming.set(null);
  }

  protected async save(): Promise<void> {
    const editor = this.editor();
    const name = this.name().trim();
    if (!editor) {
      return;
    }
    if (!name || name.length > MAX_NAME) {
      this.formError.set(`Naziv je obavezan i najviše ${MAX_NAME} znakova.`);
      return;
    }
    if (this.start() === this.end()) {
      this.formError.set('Početak i kraj smene ne mogu biti isti.');
      return;
    }
    if (templateMinutes(this.start(), this.end()) > MAX_HOURS * 60) {
      this.formError.set(`Smena ne može trajati duže od ${MAX_HOURS} sati.`);
      return;
    }

    this.busy.set(true);
    this.formError.set('');
    try {
      const start = `${this.start()}:00`;
      const end = `${this.end()}:00`;
      if (editor.kind === 'new') {
        const created = await this.api.createShiftTemplate(editor.positionId, name, start, end);
        this.templates.update((list) => [...list, created]);
        this.toast.success(`Dodata smena ${created.name} (${created.positionName}).`);
      } else {
        const updated = await this.api.updateShiftTemplate(editor.templateId, name, start, end);
        this.templates.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        this.toast.success(`Sačuvana smena ${updated.name} (${updated.positionName}).`);
      }
      this.editor.set(null);
    } catch (e) {
      this.formError.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(template: ShiftTemplate): Promise<void> {
    this.busy.set(true);
    this.rowError.update(({ [template.id]: _, ...rest }) => rest);
    try {
      await this.api.deleteShiftTemplate(template.id);
      this.templates.update((list) => list.filter((t) => t.id !== template.id));
      this.confirming.set(null);
      this.toast.success(`Obrisana smena ${template.name} (${template.positionName}).`);
    } catch (e) {
      this.rowError.update((errors) => ({ ...errors, [template.id]: errorMessage(e) }));
    } finally {
      this.busy.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [positions, templates] = await Promise.all([this.api.positions(), this.api.shiftTemplates()]);
      this.positions.set(positions);
      this.templates.set(templates);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
