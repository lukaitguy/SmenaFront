import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreatedInvitation, Position, Role } from '../../core/models';
import { errorMessage } from '../../core/problem';
import { SmenaApi } from '../../core/smena-api';
import { Modal } from '../../ui/modal';

/**
 * Pozivanje novog zaposlenog mejlom. Link iz pozivnice se pokazuje odmah i kad je mejl poslat, jer ga server vraća
 * samo jednom: ako mejl ne stigne (ili SMTP nije podešen), menadžer ga šalje sam.
 */
@Component({
  selector: 'app-invite-dialog',
  imports: [FormsModule, Modal],
  template: `
    <app-modal title="Pozovi zaposlenog" [subtitle]="result() ? '' : 'Pozivnica stiže mejlom i važi ograničeno vreme.'" (closed)="closed.emit()">
      @if (result(); as done) {
        <div class="space-y-3">
          @if (done.emailSent) {
            <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              Pozivnica je poslata na <strong>{{ done.invitation.email }}</strong>.
            </p>
          } @else {
            <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
              Mejl nije mogao da se pošalje. Pošalji ovaj link <strong>{{ done.invitation.email }}</strong> sam (poruka, Viber…).
            </p>
          }
          <div>
            <label class="label" for="invite-link">Link za prihvatanje</label>
            <div class="flex gap-2">
              <input id="invite-link" class="field flex-1 font-mono text-xs" readonly [value]="done.acceptUrl" (focus)="$any($event.target).select()" />
              <button type="button" class="btn-secondary shrink-0" (click)="copy(done.acceptUrl)">{{ copied() ? 'Kopirano ✓' : 'Kopiraj' }}</button>
            </div>
            <p class="mt-1 text-xs text-slate-500">Link se prikazuje samo sada i važi za jednu osobu.</p>
          </div>
        </div>
      } @else {
        <form id="invite-form" class="space-y-4" (ngSubmit)="send()">
          <div>
            <label class="label" for="invite-email">Email</label>
            <input id="invite-email" name="email" type="email" class="field" required maxlength="256" autocomplete="off" [(ngModel)]="email" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="invite-role">Uloga u aplikaciji</label>
              <select id="invite-role" name="role" class="field" [(ngModel)]="role">
                <option value="Staff">Zaposleni</option>
                <option value="Manager">Menadžer</option>
              </select>
            </div>
            <div>
              <label class="label" for="invite-position">Pozicija</label>
              <select id="invite-position" name="position" class="field" [(ngModel)]="positionId">
                <option value="">Bez pozicije</option>
                @for (position of positions(); track position.id) {
                  <option [value]="position.id">{{ position.name }}</option>
                }
              </select>
            </div>
          </div>
          <p class="text-xs text-slate-500">Dodatne pozicije dodaješ posle, kad zaposleni prihvati pozivnicu.</p>

          @if (error()) {
            <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error() }}</p>
          }
        </form>
      }

      <ng-container modal-actions>
        @if (result()) {
          <button type="button" class="btn-primary" (click)="closed.emit()">Gotovo</button>
        } @else {
          <button type="button" class="btn-secondary" (click)="closed.emit()">Otkaži</button>
          <button type="submit" form="invite-form" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Slanje…' : 'Pošalji pozivnicu' }}</button>
        }
      </ng-container>
    </app-modal>
  `,
})
export class InviteDialog {
  private readonly api = inject(SmenaApi);

  readonly positions = input.required<Position[]>();
  /** Zove se čim je pozivnica napravljena, da roditelj osveži spisak dok je link još na ekranu. */
  readonly created = output<CreatedInvitation>();
  readonly closed = output<void>();

  protected readonly email = signal('');
  protected readonly role = signal<Role>('Staff');
  protected readonly positionId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<CreatedInvitation | null>(null);
  protected readonly copied = signal(false);

  protected async send(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const created = await this.api.createInvitation({
        email: this.email().trim(),
        role: this.role(),
        positionId: this.positionId() || null,
      });
      this.result.set(created);
      this.created.emit(created);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      // Bez dozvole za clipboard (npr. običan http): polje je izabrano pa se kopira ručno.
      (document.getElementById('invite-link') as HTMLInputElement | null)?.select();
    }
  }
}
