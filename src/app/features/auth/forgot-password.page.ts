import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { errorMessage } from '../../core/problem';
import { AuthLayout } from './auth-layout';

/** Zaboravljena lozinka: odgovor je uvek isti, da se ne otkrije koji nalozi postoje. */
@Component({
  selector: 'app-forgot-password-page',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout heading="Zaboravljena lozinka" subheading="Upiši email naloga i poslaćemo ti link za novu lozinku.">
      @if (sent()) {
        <p class="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800" role="status">
          Ako nalog sa tim emailom postoji, poslali smo link za novu lozinku. Link važi sat vremena. Proveri i neželjenu poštu.
        </p>
      } @else {
        <form class="space-y-4" (ngSubmit)="submit()">
          <div>
            <label class="label" for="email">Email</label>
            <input id="email" name="email" type="email" class="field" autocomplete="username" required [(ngModel)]="email" />
          </div>

          @if (error()) {
            <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="btn-primary w-full" [disabled]="busy()">
            {{ busy() ? 'Slanje…' : 'Pošalji link' }}
          </button>
        </form>
      }

      <span footer><a routerLink="/prijava" class="font-medium text-brand-600 hover:underline">Nazad na prijavu</a></span>
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.forgotPassword(this.email().trim());
      this.sent.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
