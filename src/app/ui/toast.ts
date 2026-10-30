import { Component, Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(text: string): void {
    this.show('success', text, 4000);
  }

  error(text: string): void {
    this.show('error', text, 7000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(kind: Toast['kind'], text: string, ms: number): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}

@Component({
  selector: 'app-toasts',
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      @for (toast of service.toasts(); track toast.id) {
        <div
          role="status"
          class="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1"
          [class]="
            toast.kind === 'success'
              ? 'bg-emerald-600 text-white ring-emerald-700/30'
              : 'bg-red-600 text-white ring-red-700/30'
          "
        >
          <span class="flex-1">{{ toast.text }}</span>
          <button type="button" class="opacity-80 hover:opacity-100" aria-label="Zatvori" (click)="service.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  constructor(protected readonly service: ToastService) {}
}
