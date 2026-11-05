import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { fragmentParams } from '../../core/fragment';
import { errorMessage } from '../../core/problem';
import { AuthLayout } from './auth-layout';

/**
 * Nova lozinka iz mejla (`/nova-lozinka#email=…&token=…`). Posle uspeha su sve sesije poništene,
 * pa se korisnik prijavljuje novom lozinkom.
 */
@Component({
  selector: 'app-reset-password-page',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout heading="Nova lozinka" [subheading]="email ? 'Izaberi novu lozinku za ' + email + '.' : ''">
      @if (done()) {
        <p class="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800" role="status">
          Lozinka je promenjena. Prijavi se novom lozinkom.
        </p>
        <a routerLink="/prijava" class="btn-primary mt-4 block text-center">Na prijavu</a>
      } @else if (!valid) {
        <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          Ovaj link nije potpun. Zatraži novi na stranici „Zaboravljena lozinka".
        </p>
        <a routerLink="/zaboravljena-lozinka" class="btn-secondary mt-4 block text-center">Zatraži novi link</a>
      } @else {
        <form class="space-y-4" (ngSubmit)="submit()">
          <div>
            <label class="label" for="password">Nova lozinka</label>
            <input id="password" name="password" type="password" class="field" autocomplete="new-password" required minlength="8" [(ngModel)]="password" />
            <p class="mt-1 text-xs text-slate-500">Najmanje 8 znakova.</p>
          </div>
          <div>
            <label class="label" for="confirm">Ponovi lozinku</label>
            <input id="confirm" name="confirm" type="password" class="field" autocomplete="new-password" required [(ngModel)]="confirm" />
          </div>

          @if (error()) {
            <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="btn-primary w-full" [disabled]="busy()">
            {{ busy() ? 'Čuvanje…' : 'Sačuvaj lozinku' }}
          </button>
        </form>
      }

      <span footer><a routerLink="/prijava" class="font-medium text-brand-600 hover:underline">Nazad na prijavu</a></span>
    </app-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly params = fragmentParams(inject(DOCUMENT).location.hash);

  protected readonly email = this.params.get('email') ?? '';
  private readonly token = this.params.get('token') ?? '';
  protected readonly valid = this.email !== '' && this.token !== '';

  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    if (this.password() !== this.confirm()) {
      this.error.set('Lozinke se ne poklapaju.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.resetPassword(this.email, this.token, this.password());
      this.done.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
