import { TestBed } from '@angular/core/testing';
import { HubConnectionState } from '@microsoft/signalr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth';
import { BOARD_HUB_FACTORY, BoardConnection, BoardHub } from './board';
import { EightySixItem } from './models';

class FakeHub implements BoardHub {
  state = HubConnectionState.Disconnected;
  handlers = new Map<string, (...args: never[]) => void>();
  reconnecting: (() => void)[] = [];
  reconnected: (() => void)[] = [];
  closed: (() => void)[] = [];
  startResults: (Error | null)[] = [];
  starts = 0;
  stops = 0;

  on(name: string, handler: (...args: never[]) => void): void {
    this.handlers.set(name, handler);
  }
  onreconnecting(cb: () => void): void {
    this.reconnecting.push(cb);
  }
  onreconnected(cb: () => void): void {
    this.reconnected.push(cb);
  }
  onclose(cb: () => void): void {
    this.closed.push(cb);
  }
  async start(): Promise<void> {
    this.starts++;
    const failure = this.startResults.shift();
    if (failure) {
      throw failure;
    }
    this.state = HubConnectionState.Connected;
  }
  async stop(): Promise<void> {
    this.stops++;
    this.state = HubConnectionState.Disconnected;
  }
  emit(name: string, payload: unknown): void {
    (this.handlers.get(name) as (p: unknown) => void)(payload);
  }
}

const item: EightySixItem = {
  id: 'i-1', positionId: 'p', positionName: 'Kuvar', name: 'Brancin', note: null,
  createdByEmployeeId: 'e', createdByName: 'Milan', createdAt: '2026-11-05T20:00:00Z',
};

function jwt(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  return `x.${payload}.y`;
}

describe('BoardConnection', () => {
  let hub: FakeHub;
  let tokenFactory: () => Promise<string>;
  let board: BoardConnection;
  let auth: AuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new FakeHub();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BOARD_HUB_FACTORY,
          useValue: (accessToken: () => Promise<string>) => {
            tokenFactory = accessToken;
            return hub;
          },
        },
      ],
    });
    auth = TestBed.inject(AuthService);
    board = TestBed.inject(BoardConnection);
  });

  afterEach(() => vi.useRealTimers());

  it('connects once, however many times it is started', async () => {
    board.start();
    board.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(hub.starts).toBe(1);
    expect(board.status()).toBe('connected');
  });

  it('turns hub messages into events', async () => {
    const added: EightySixItem[] = [];
    const removed: string[] = [];
    board.eightySixAdded.subscribe((i) => added.push(i));
    board.eightySixRemoved.subscribe((id) => removed.push(id));
    board.start();
    await vi.advanceTimersByTimeAsync(0);

    hub.emit('eightySixAdded', item);
    hub.emit('eightySixRemoved', 'i-1');

    expect(added).toEqual([item]);
    expect(removed).toEqual(['i-1']);
  });

  it('asks screens for a fresh snapshot after the first connect and after every reconnect', async () => {
    let snapshots = 0;
    board.reconnected.subscribe(() => snapshots++);
    board.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots).toBe(1);

    hub.reconnecting.forEach((cb) => cb());
    expect(board.status()).toBe('reconnecting');
    hub.reconnected.forEach((cb) => cb());

    expect(board.status()).toBe('connected');
    expect(snapshots).toBe(2);
  });

  it('keeps trying when the first connection fails', async () => {
    hub.startResults = [new Error('offline'), new Error('offline')];
    board.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(board.status()).toBe('disconnected');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(hub.starts).toBe(2);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(hub.starts).toBe(3);
    expect(board.status()).toBe('connected');
  });

  it('reconnects from scratch when automatic reconnect gives up', async () => {
    board.start();
    await vi.advanceTimersByTimeAsync(0);

    hub.state = HubConnectionState.Disconnected;
    hub.closed.forEach((cb) => cb());
    await vi.advanceTimersByTimeAsync(5_000);

    expect(hub.starts).toBe(2);
    expect(board.status()).toBe('connected');
  });

  it('stops for good on sign-out and does not retry', async () => {
    board.start();
    await vi.advanceTimersByTimeAsync(0);

    await board.stop();
    hub.closed.forEach((cb) => cb());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(hub.stops).toBe(1);
    expect(hub.starts).toBe(1);
    expect(board.status()).toBe('disconnected');
  });

  it('uses the current token while it is valid', async () => {
    const token = jwt(600);
    auth.token.set(token);
    board.start();

    expect(await tokenFactory()).toBe(token);
  });

  it('refreshes a token that is about to expire before connecting', async () => {
    auth.token.set(jwt(5));
    const fresh = jwt(900);
    vi.spyOn(auth, 'refresh').mockImplementation(async () => {
      auth.token.set(fresh);
      return true;
    });
    board.start();

    expect(await tokenFactory()).toBe(fresh);
    expect(auth.refresh).toHaveBeenCalledOnce();
  });

  it('gives an empty token when the session can no longer be refreshed', async () => {
    auth.token.set(jwt(-10));
    vi.spyOn(auth, 'refresh').mockResolvedValue(false);
    board.start();

    expect(await tokenFactory()).toBe('');
  });
});
