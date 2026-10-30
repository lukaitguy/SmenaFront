import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { errorMessage, isStatus } from '../../core/problem';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout heading="Registruj restoran" subheading="Napravi restoran i postani njegov vlasnik. Zaposlene kasnije pozivaš mejlom.">
      <form class="space-y-4" (ngSubmit)="submit()">
        <div>
          <label class="label" for="restaurant">Naziv restorana</label>
          <input id="restaurant" name="restaurant" class="field" required maxlength="200" [(ngModel)]="restaurantName" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="first">Ime</label>
            <input id="first" name="first" class="field" autocomplete="given-name" required [(ngModel)]="firstName" />
          </div>
          <div>
            <label class="label" for="last">Prezime</label>
            <input id="last" name="last" class="field" autocomplete="family-name" required [(ngModel)]="lastName" />
          </div>
        </div>
        <div>
          <label class="label" for="email">Email</label>
          <input id="email" name="email" type="email" class="field" autocomplete="username" required [(ngModel)]="email" />
        </div>
        <div>
          <label class="label" for="password">Lozinka</label>
          <input id="password" name="password" type="password" class="field" autocomplete="new-password" minlength="8" required [(ngModel)]="password" />
          <p class="mt-1 text-xs text-slate-500">Najmanje 8 znakova.</p>
        </div>

        @if (error()) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn-primary w-full" [disabled]="busy()">
          {{ busy() ? 'Pravljenje…' : 'Napravi restoran' }}
        </button>
      </form>

      <span footer>Već imaš nalog? <a routerLink="/prijava" class="font-medium text-brand-600 hover:underline">Prijavi se</a></span>
    </app-auth-layout>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly restaurantName = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.register({
        restaurantName: this.restaurantName().trim(),
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        email: this.email().trim(),
        password: this.password(),
      });
      await this.router.navigate(['/']);
    } catch (e) {
      this.error.set(isStatus(e, 409) ? 'Nalog sa ovim emailom već postoji.' : errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
