import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { errorMessage } from './problem';
import { SmenaApi } from './smena-api';

/** Šta uređaj dozvoljava; izdvojeno da se u testovima lako zameni. */
export interface PushEnvironment {
  /** Stanje dozvole za obaveštenja, ili 'unsupported' kad browser nema Notification API (npr. Safari bez instalacije). */
  notificationPermission(): NotificationPermission | 'unsupported';
  isIos(): boolean;
  /** Aplikacija je otvorena sa ikonice na početnom ekranu, ne iz Safari kartice. */
  isStandalone(): boolean;
}

export const PUSH_ENVIRONMENT = new InjectionToken<PushEnvironment>('PUSH_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => ({
    notificationPermission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
    isIos: () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    isStandalone: () =>
      (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches,
  }),
});

/**
 * - `loading`: još se proverava.
 * - `needs-install`: iPhone/iPad, aplikacija nije dodata na početni ekran (Apple ne daje obaveštenja iz Safari kartice).
 * - `unsupported`: browser nema service worker ili obaveštenja, ili stranica nije preko https-a.
 * - `server-off`: server nema VAPID ključeve.
 * - `blocked`: korisnik je zabranio obaveštenja u podešavanjima browsera.
 * - `off`: moguće je uključiti, još nije.
 * - `on`: ovaj uređaj prima obaveštenja.
 */
export type PushState = 'loading' | 'needs-install' | 'unsupported' | 'server-off' | 'blocked' | 'off' | 'on';

/**
 * Web push na ovom uređaju: pretplata u browseru (preko Angular service worker-a) i njena registracija na serveru.
 * Server šalje obaveštenja (nova najava, zamena, objava rasporeda…), a service worker ih prikazuje.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly env = inject(PUSH_ENVIRONMENT);

  readonly state = signal<PushState>('loading');
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    // Pri odjavi se uređaj skida sa naloga (dok je token još važeći), da sledeća osoba na istom telefonu ne dobija tuđa obaveštenja.
    this.auth.addLogoutHook(() => this.leave());
  }

  /** Proverava šta je moguće i šta je već uključeno; ako jeste, osvežava registraciju na serveru. */
  async refresh(): Promise<void> {
    if (this.env.isIos() && !this.env.isStandalone()) {
      this.state.set('needs-install');
      return;
    }
    if (!this.swPush.isEnabled || this.env.notificationPermission() === 'unsupported') {
      this.state.set('unsupported');
      return;
    }

    try {
      const config = await this.api.pushConfig();
      if (!config.enabled) {
        this.state.set('server-off');
        return;
      }
      if (this.env.notificationPermission() === 'denied') {
        this.state.set('blocked');
        return;
      }

      const existing = await firstValueFrom(this.swPush.subscription);
      if (existing) {
        // Ponovna registracija je bezbedna i popravlja slučaj da je server u međuvremenu izgubio uređaj.
        await this.register(existing);
        this.state.set('on');
      } else {
        this.state.set('off');
      }
    } catch (e) {
      this.error.set(errorMessage(e));
      this.state.set(this.env.notificationPermission() === 'denied' ? 'blocked' : 'off');
    }
  }

  /** Mora da se zove iz klika: tada browser pita korisnika za dozvolu. */
  async enable(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const { enabled, publicKey } = await this.api.pushConfig();
      if (!enabled || !publicKey) {
        this.state.set('server-off');
        return;
      }

      const subscription = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      try {
        await this.register(subscription);
      } catch (e) {
        if (!isEndpointInUse(e)) {
          throw e;
        }
        // Isti browser je bio vezan za drugi restoran: nova pretplata (nova adresa) rešava stvar.
        await this.swPush.unsubscribe();
        await this.register(await this.swPush.requestSubscription({ serverPublicKey: publicKey }));
      }
      this.state.set('on');
    } catch (e) {
      if (this.env.notificationPermission() === 'denied') {
        this.state.set('blocked');
      } else {
        this.error.set(errorMessage(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.leave();
      this.state.set('off');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Server šalje probno obaveštenje na uređaje prijavljenog korisnika. */
  async sendTest(): Promise<void> {
    this.error.set('');
    try {
      await this.api.sendTestPush();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  /** Skida ovaj uređaj sa servera i iz browsera. Ne baca grešku kad nije bio uključen. */
  private async leave(): Promise<void> {
    if (!this.swPush.isEnabled) {
      return;
    }
    const subscription = await firstValueFrom(this.swPush.subscription);
    if (!subscription) {
      return;
    }
    try {
      await this.api.unsubscribePush(subscription.endpoint);
    } catch {
      // Server će ionako ukloniti nevažeću adresu pri sledećem slanju.
    }
    await this.swPush.unsubscribe();
  }

  private async register(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    await this.api.subscribePush({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
    });
  }
}

function isEndpointInUse(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409 && (error.error as { code?: string } | null)?.code === 'push.endpoint_in_use';
}
