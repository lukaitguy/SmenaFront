import { Component, inject } from '@angular/core';
import { PushService } from '../../core/push';

/**
 * Obaveštenja na ovom uređaju: uključivanje i isključivanje web pusha, uz objašnjenje šta kad nešto ne radi.
 * Na iPhone-u obaveštenja rade tek kad se aplikacija doda na početni ekran.
 */
@Component({
  selector: 'app-notifications-page',
  template: `
    <div class="mb-5">
      <h1 class="text-xl font-semibold tracking-tight">Obaveštenja</h1>
      <p class="text-sm text-slate-500">Nova najava, zamena smene ili objavljen raspored stižu ti na telefon i kad aplikacija nije otvorena.</p>
    </div>

    <section class="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
      @switch (push.state()) {
        @case ('loading') {
          <p class="text-sm text-slate-500">Provera…</p>
        }
        @case ('needs-install') {
          <h2 class="font-semibold">Dodaj Smenu na početni ekran</h2>
          <p class="mt-1 text-sm text-slate-600">Na iPhone-u obaveštenja rade samo iz aplikacije sa početnog ekrana, ne iz Safari-ja.</p>
          <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Otvori ovu stranicu u <strong>Safari</strong>-ju.</li>
            <li>Dodirni dugme <strong>Deli</strong> (kvadrat sa strelicom).</li>
            <li>Izaberi <strong>Dodaj na početni ekran</strong>, pa <strong>Dodaj</strong>.</li>
            <li>Otvori Smenu <strong>sa nove ikonice</strong> i vrati se na ovu stranicu.</li>
          </ol>
          <p class="mt-3 text-xs text-slate-500">Potrebno je iOS 16.4 ili novije.</p>
        }
        @case ('unsupported') {
          <h2 class="font-semibold">Ovaj uređaj ne može da prima obaveštenja</h2>
          <p class="mt-1 text-sm text-slate-600">
            Browser ne podržava obaveštenja ili je aplikacija otvorena bez zaštićene veze (https). Mejlovi i dalje stižu.
          </p>
        }
        @case ('server-off') {
          <h2 class="font-semibold">Obaveštenja nisu uključena na serveru</h2>
          <p class="mt-1 text-sm text-slate-600">Javi administratoru da podesi push ključeve. Do tada obaveštenja stižu mejlom.</p>
        }
        @case ('blocked') {
          <h2 class="font-semibold">Obaveštenja su blokirana</h2>
          <p class="mt-1 text-sm text-slate-600">
            Dozvolu si ranije odbio/la. Uključi je u podešavanjima browsera ili telefona za ovu aplikaciju, pa se vrati ovde.
          </p>
        }
        @case ('off') {
          <h2 class="font-semibold">Obaveštenja su isključena</h2>
          <p class="mt-1 text-sm text-slate-600">Browser će te pitati za dozvolu. Možeš da je povučeš kad god hoćeš.</p>
          <button type="button" class="btn-primary mt-4" [disabled]="push.busy()" (click)="push.enable()">
            {{ push.busy() ? 'Uključivanje…' : 'Uključi obaveštenja' }}
          </button>
        }
        @case ('on') {
          <h2 class="flex items-center gap-2 font-semibold">
            <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true"></span> Obaveštenja su uključena na ovom uređaju
          </h2>
          <p class="mt-1 text-sm text-slate-600">Svaki uređaj se uključuje posebno. Odjava iz aplikacije isključuje obaveštenja na ovom uređaju.</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" (click)="push.sendTest()">Pošalji probno obaveštenje</button>
            <button type="button" class="btn-ghost" [disabled]="push.busy()" (click)="push.disable()">Isključi</button>
          </div>
        }
      }

      @if (push.error()) {
        <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ push.error() }}</p>
      }
    </section>
  `,
})
export class NotificationsPage {
  protected readonly push = inject(PushService);

  constructor() {
    void this.push.refresh();
  }
}
