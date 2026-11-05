import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { errorMessage, isStatus } from '../../core/problem';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout heading="Prijava" subheading="Prijavi se na svoj nalog u Smeni.">
      <form class="space-y-4" (ngSubmit)="submit()">
        <div>
          <label class="label" for="email">Email</label>
          <input id="email" name="email" type="email" class="field" autocomplete="username" required [(ngModel)]="email" />
        </div>
        <div>
          <label class="label" for="password">Lozinka</label>
          <input id="password" name="password" type="password" class="field" autocomplete="current-password" required [(ngModel)]="password" />
        </div>

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn-primary w-full" [disabled]="busy()">
          {{ busy() ? 'Prijavljivanje…' : 'Prijavi se' }}
        </button>
        <p class="text-center text-sm">
          <a routerLink="/zaboravljena-lozinka" class="text-slate-600 hover:text-brand-700 hover:underline">Zaboravio/la si lozinku?</a>
        </p>
      </form>

      <span footer>Nemaš restoran u Smeni? <a routerLink="/registracija" class="font-medium text-brand-600 hover:underline">Registruj ga</a></span>
    </app-auth-layout>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email().trim(), this.password());
      await this.router.navigate(['/']);
    } catch (e) {
      this.error.set(isStatus(e, 401) ? 'Pogrešan email ili lozinka.' : errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
