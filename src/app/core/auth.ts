import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AccessTokenResponse, CurrentUser, RegisterRequest } from './models';

const SESSION_FLAG = 'smena.session';

/**
 * Stanje prijave. Access token živi samo u memoriji (signal), a refresh token je u HttpOnly cookie-ju
 * koji JavaScript ne vidi. Posle osvežavanja stranice sesija se vraća pozivom /api/auth/refresh.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(null);
  readonly user = signal<CurrentUser | null>(null);

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isManager = computed(() => this.user()?.role === 'Manager' || this.user()?.role === 'Owner');
  /** Vremenska zona restorana; sve vreme na ekranu je u njoj. */
  readonly timeZone = computed(() => this.user()?.restaurantTimeZoneId ?? 'Europe/Belgrade');

  private refreshing: Promise<boolean> | null = null;

  /**
   * Pokušava da vrati sesiju pri startu aplikacije. Nikad ne baca grešku. Refresh cookie je HttpOnly pa ga
   * ne vidimo; zato se pamti samo oznaka da je u ovom browseru bilo prijave, da novi posetilac ne pravi
   * zahtev koji sigurno završava sa 401.
   */
  async restore(): Promise<void> {
    if (localStorage.getItem(SESSION_FLAG) === '1') {
      await this.refresh();
    }
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(this.http.post<AccessTokenResponse>('/api/auth/login', { email, password }));
    await this.start(response);
  }

  async register(request: RegisterRequest): Promise<void> {
    const response = await firstValueFrom(this.http.post<AccessTokenResponse>('/api/auth/register', request));
    await this.start(response);
  }

  /** Osvežava token; više istovremenih poziva deli jedan zahtev. Vraća false ako sesija više ne važi. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', null));
    } catch {
      // Odjava lokalno uspeva čak i kad server nije dostupan.
    }
    this.clear();
    await this.router.navigate(['/prijava']);
  }

  /** Sesija je istekla usred rada: čisti stanje i vodi na prijavu. */
  async expire(): Promise<void> {
    this.clear();
    await this.router.navigate(['/prijava']);
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const response = await firstValueFrom(this.http.post<AccessTokenResponse>('/api/auth/refresh', null));
      await this.start(response);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  private async start(response: AccessTokenResponse): Promise<void> {
    this.token.set(response.accessToken);
    this.user.set(await firstValueFrom(this.http.get<CurrentUser>('/api/auth/me')));
    localStorage.setItem(SESSION_FLAG, '1');
  }

  private clear(): void {
    this.token.set(null);
    this.user.set(null);
    localStorage.removeItem(SESSION_FLAG);
  }
}
