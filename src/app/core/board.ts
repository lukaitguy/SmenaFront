import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, IRetryPolicy } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AuthService } from './auth';
import { EightySixItem } from './models';

/** Delovi HubConnection-a koje koristimo; lak za zamenu u testovima. */
export type BoardHub = Pick<HubConnection, 'on' | 'start' | 'stop' | 'onreconnecting' | 'onreconnected' | 'onclose' | 'state'>;

export const BOARD_HUB_FACTORY = new InjectionToken<(accessToken: () => Promise<string>) => BoardHub>('BOARD_HUB_FACTORY', {
  providedIn: 'root',
  factory: () => (accessToken) =>
    new HubConnectionBuilder()
      .withUrl('/hubs/board', { accessTokenFactory: accessToken })
      .withAutomaticReconnect(retryForever)
      .build(),
});

/** Telefoni u restoranu stalno gube WiFi, pa se povezivanje pokušava dok god ima smisla: odmah, pa na 2, 5, 10 i na kraju na svakih 30 s. */
const retryForever: IRetryPolicy = {
  nextRetryDelayInMilliseconds: ({ previousRetryCount }) => [0, 2_000, 5_000, 10_000][previousRetryCount] ?? 30_000,
};

const REFRESH_BEFORE_EXPIRY_MS = 30_000;
const FIRST_CONNECT_RETRY_MS = 5_000;

export type BoardStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Veza ka zajedničkom ekranu smene (SignalR). Komande idu običnim REST pozivima, a ovde stižu samo promene
 * koje je neko drugi napravio. Baza je izvor istine: posle ponovnog povezivanja se javlja `reconnected`, a ekran
 * tada sam povuče ceo snimak stanja umesto da veruje da nije ništa propustio.
 */
@Injectable({ providedIn: 'root' })
export class BoardConnection {
  private readonly auth = inject(AuthService);
  private readonly createHub = inject(BOARD_HUB_FACTORY);

  readonly status = signal<BoardStatus>('disconnected');
  readonly eightySixAdded = new Subject<EightySixItem>();
  readonly eightySixRemoved = new Subject<string>();
  /** Veza je vraćena posle prekida: ekrani treba da povuku snimak stanja. */
  readonly reconnected = new Subject<void>();

  private hub: BoardHub | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => void this.stop());
  }

  /** Povezuje se ako već nije; bezbedno je zvati više puta. */
  start(): void {
    if (this.hub) {
      return;
    }
    const hub = this.createHub(() => this.freshToken());
    this.hub = hub;

    hub.on('eightySixAdded', (item: EightySixItem) => this.eightySixAdded.next(item));
    hub.on('eightySixRemoved', (id: string) => this.eightySixRemoved.next(id));
    hub.onreconnecting(() => this.status.set('reconnecting'));
    hub.onreconnected(() => {
      this.status.set('connected');
      this.reconnected.next();
    });
    hub.onclose(() => {
      // Automatsko povezivanje je odustalo (ili je veza zatvorena namerno): pokušaj iz početka ako još treba.
      if (this.hub === hub) {
        this.status.set('disconnected');
        this.scheduleConnect(hub);
      }
    });

    void this.connect(hub);
  }

  async stop(): Promise<void> {
    const hub = this.hub;
    this.hub = null;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.status.set('disconnected');
    if (hub && hub.state !== HubConnectionState.Disconnected) {
      await hub.stop();
    }
  }

  private async connect(hub: BoardHub): Promise<void> {
    this.status.set('connecting');
    try {
      await hub.start();
      if (this.hub !== hub) {
        await hub.stop();
        return;
      }
      this.status.set('connected');
      // Poruke poslate dok veza nije bila gotova su propuštene; ekran treba da povuče stanje.
      this.reconnected.next();
    } catch {
      if (this.hub === hub) {
        this.status.set('disconnected');
        this.scheduleConnect(hub);
      }
    }
  }

  private scheduleConnect(hub: BoardHub): void {
    if (this.retryTimer || this.hub !== hub) {
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.hub === hub) {
        void this.connect(hub);
      }
    }, FIRST_CONNECT_RETRY_MS);
  }

  /** Access token živi kratko, a SignalR ga traži pri svakom (ponovnom) povezivanju: istekao se osvežava pre upotrebe. */
  private async freshToken(): Promise<string> {
    const token = this.auth.token();
    if (token && !expiresSoon(token)) {
      return token;
    }
    return (await this.auth.refresh()) ? (this.auth.token() ?? '') : '';
  }
}

function expiresSoon(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return payload.exp !== undefined && payload.exp * 1000 - Date.now() < REFRESH_BEFORE_EXPIRY_MS;
  } catch {
    return false;
  }
}
