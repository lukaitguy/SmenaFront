import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { fragmentValue } from '../../core/fragment';
import { InvitationPreview, Role } from '../../core/models';
import { errorMessage, isStatus } from '../../core/problem';
import { AuthLayout } from './auth-layout';

const ROLE_LABELS: Record<Role, string> = { Owner: 'vlasnik', Manager: 'menadžer', Staff: 'zaposleni' };

/**
 * Prihvatanje pozivnice iz mejla (`/pozivnica#token`). Token se čita iz dela URL-a posle # i šalje u telu
 * zahteva. Posle uspeha nalog je napravljen i novi zaposleni je odmah prijavljen.
 */
@Component({
  selector: 'app-invitation-page',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout [heading]="heading()" [subheading]="subheading()">
      @if (loading()) {
        <p class="text-sm text-slate-500">Provera pozivnice…</p>
      } @else if (invitation(); as invite) {
        <form class="space-y-4" (ngSubmit)="submit()">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="first">Ime</label>
              <input id="first" name="first" class="field" autocomplete="given-name" required maxlength="100" [(ngModel)]="firstName" />
            </div>
            <div>
              <label class="label" for="last">Prezime</label>
              <input id="last" name="last" class="field" autocomplete="family-name" required maxlength="100" [(ngModel)]="lastName" />
            </div>
          </div>
          <div>
            <label class="label" for="email">Email</label>
            <input id="email" class="field bg-slate-50" [value]="invite.email" readonly />
          </div>
          <div>
            <label class="label" for="password">Lozinka</label>
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
            {{ busy() ? 'Pravljenje naloga…' : 'Napravi nalog' }}
          </button>
        </form>
      } @else {
        <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
      }

      <span footer>Već imaš nalog? <a routerLink="/prijava" class="font-medium text-brand-600 hover:underline">Prijavi se</a></span>
    </app-auth-layout>
  `,
})
export class InvitationPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly token = fragmentValue(inject(DOCUMENT).location.hash);

  protected readonly loading = signal(true);
  protected readonly invitation = signal<InvitationPreview | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');

  constructor() {
    void this.load();
  }

  protected heading(): string {
    return this.invitation() ? 'Dobrodošao/la u Smenu' : 'Pozivnica';
  }

  protected subheading(): string {
    const invite = this.invitation();
    return invite ? `${invite.restaurantName} te poziva kao: ${ROLE_LABELS[invite.role]}. Izaberi lozinku i nalog je spreman.` : '';
  }

  protected async submit(): Promise<void> {
    if (this.password() !== this.confirm()) {
      this.error.set('Lozinke se ne poklapaju.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.acceptInvitation({
        token: this.token,
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        password: this.password(),
      });
      await this.router.navigate(['/']);
    } catch (e) {
      this.error.set(isStatus(e, 409) ? 'Nalog sa ovim emailom već postoji. Prijavi se.' : errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    if (!this.token) {
      this.error.set('Ovaj link nije potpun. Otvori ga ponovo iz mejla ili traži novu pozivnicu od menadžera.');
      this.loading.set(false);
      return;
    }
    try {
      this.invitation.set(await this.auth.previewInvitation(this.token));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
