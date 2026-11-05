import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';
import { AnnouncementsStore } from '../core/announcements';
import { BoardConnection } from '../core/board';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-6 sm:px-4">
        <a routerLink="/" class="flex items-center gap-2 font-semibold text-slate-900">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
              <path d="M3 9.5h18M8 3v3M16 3v3" />
            </svg>
          </span>
          <span class="hidden text-lg tracking-tight sm:inline">Smena</span>
        </a>

        <nav class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Glavna navigacija">
          @for (item of nav(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-brand-50 text-brand-700"
              class="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:px-3"
            >
              {{ item.label }}
              @if (item.path === '/najave' && announcements.unreadCount() > 0) {
                <span
                  class="ml-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold leading-none text-white"
                  [attr.aria-label]="announcements.unreadCount() + ' nepročitanih najava'"
                >{{ announcements.unreadCount() }}</span>
              }
            </a>
          }
        </nav>

        <div class="flex items-center gap-3">
          <div class="hidden text-right leading-tight sm:block">
            <div class="text-sm font-medium text-slate-900">{{ auth.user()?.firstName }} {{ auth.user()?.lastName }}</div>
            <div class="text-xs text-slate-500">{{ auth.user()?.restaurantName }} · {{ roleLabel() }}</div>
          </div>
          <button type="button" class="btn-secondary px-3 py-1.5" (click)="auth.logout()">Odjava</button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly board = inject(BoardConnection);
  protected readonly announcements = inject(AnnouncementsStore);

  constructor() {
    // Dok je neko prijavljen, ekran smene prima promene uživo; odjava (uništen shell) prekida vezu.
    this.board.start();
    this.announcements.start();
    inject(DestroyRef).onDestroy(() => {
      void this.board.stop();
      this.announcements.stop();
    });
  }

  protected readonly nav = computed(() =>
    this.auth.isManager()
      ? [
          { path: '/raspored', label: 'Raspored' },
          { path: '/zahtevi', label: 'Zahtevi' },
          { path: '/moje-smene', label: 'Moje smene' },
          { path: '/najave', label: 'Najave' },
          { path: '/zamene', label: 'Zamene' },
          { path: '/slobodni-dani', label: 'Slobodni dani' },
          { path: '/86-lista', label: '86 lista' },
        ]
      : [
          { path: '/moje-smene', label: 'Moje smene' },
          { path: '/raspored', label: 'Raspored' },
          { path: '/najave', label: 'Najave' },
          { path: '/zamene', label: 'Zamene' },
          { path: '/slobodni-dani', label: 'Slobodni dani' },
          { path: '/86-lista', label: '86 lista' },
        ],
  );

  protected readonly roleLabel = computed(() => {
    switch (this.auth.user()?.role) {
      case 'Owner':
        return 'Vlasnik';
      case 'Manager':
        return 'Menadžer';
      default:
        return 'Zaposleni';
    }
  });
}
