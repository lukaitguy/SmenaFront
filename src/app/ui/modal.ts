import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

/**
 * Modalni prozor nad native <dialog> elementom (fokus, Escape i pozadina rade sami od sebe).
 * Roditelj ga prikazuje sa @if i prijavljuje zatvaranje preko (closed).
 */
@Component({
  selector: 'app-modal',
  template: `
    <dialog
      #dialog
      class="m-auto w-full backdrop:backdrop-blur-[1px]"
      [class]="wide() ? 'max-w-2xl' : 'max-w-md'"
      (close)="closed.emit()"
      (click)="onBackdropClick($event)"
    >
      <div class="mx-3 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 sm:mx-0">
        <header class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 class="text-base font-semibold text-slate-900">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="mt-0.5 text-sm text-slate-500">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" class="btn-ghost -mr-2 -mt-1 px-2 py-1" aria-label="Zatvori" (click)="close()">✕</button>
        </header>
        <div class="max-h-[75vh] overflow-y-auto px-5 py-4">
          <ng-content />
        </div>
        <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 rounded-b-2xl empty:hidden">
          <ng-content select="[modal-actions]" />
        </footer>
      </div>
    </dialog>
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly wide = input(false);
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    // Klik na pozadinu (sam <dialog>), ne na sadržaj, zatvara prozor.
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }
}
