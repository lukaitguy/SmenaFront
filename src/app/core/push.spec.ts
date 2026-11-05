import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth';
import { PUSH_ENVIRONMENT, PushEnvironment, PushService } from './push';

const fakeSubscription = (endpoint: string) =>
  ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'BKey', auth: 'AuthKey' } }) }) as unknown as PushSubscription;

class FakeSwPush {
  isEnabled = true;
  subscription = new BehaviorSubject<PushSubscription | null>(null);
  requestSubscription = vi.fn(async (_options: { serverPublicKey: string }) => {
    const created = fakeSubscription('https://push.example/device-1');
    this.subscription.next(created);
    return created;
  });
  unsubscribe = vi.fn(async () => this.subscription.next(null));
}

@Component({ template: '' })
class Blank {}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('PushService', () => {
  let http: HttpTestingController;
  let sw: FakeSwPush;
  let env: PushEnvironment & { permission: NotificationPermission | 'unsupported'; ios: boolean; standalone: boolean };
  let push: PushService;

  beforeEach(() => {
    sw = new FakeSwPush();
    env = {
      permission: 'default', ios: false, standalone: false,
      notificationPermission() { return this.permission; },
      isIos() { return this.ios; },
      isStandalone() { return this.standalone; },
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', component: Blank }]),
        { provide: SwPush, useValue: sw },
        { provide: PUSH_ENVIRONMENT, useValue: env },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    push = TestBed.inject(PushService);
  });

  afterEach(() => http.verify());

  const config = (enabled = true) => http.expectOne('/api/push/config').flush({ enabled, publicKey: enabled ? 'PUBLIC-KEY' : null });

  async function refresh(enabled = true): Promise<void> {
    const done = push.refresh();
    await tick();
    config(enabled);
    await done;
  }

  describe('what is possible on this device', () => {
    it('asks an iPhone in a Safari tab to install the app first, without calling the server', async () => {
      env.ios = true;

      await push.refresh();

      expect(push.state()).toBe('needs-install');
      http.expectNone('/api/push/config');
    });

    it('does not ask an installed iPhone app to install again', async () => {
      env.ios = true;
      env.standalone = true;

      await refresh();

      expect(push.state()).toBe('off');
    });

    it('says unsupported without a service worker or without the notification api', async () => {
      sw.isEnabled = false;
      await push.refresh();
      expect(push.state()).toBe('unsupported');

      sw.isEnabled = true;
      env.permission = 'unsupported';
      await push.refresh();
      expect(push.state()).toBe('unsupported');
      http.expectNone('/api/push/config');
    });

    it('says the server is off when it has no keys', async () => {
      await refresh(false);

      expect(push.state()).toBe('server-off');
    });

    it('says blocked when the user denied notifications in the browser', async () => {
      env.permission = 'denied';

      await refresh();

      expect(push.state()).toBe('blocked');
    });

    it('is off when nothing is subscribed yet', async () => {
      await refresh();

      expect(push.state()).toBe('off');
    });
  });

  describe('an existing subscription', () => {
    it('is registered on the server again, so a device the server forgot is repaired', async () => {
      env.permission = 'granted';
      sw.subscription.next(fakeSubscription('https://push.example/device-1'));

      const done = push.refresh();
      await tick();
      config();
      await tick();
      const request = http.expectOne('/api/push/subscriptions');
      expect(request.request.body).toEqual({ endpoint: 'https://push.example/device-1', keys: { p256dh: 'BKey', auth: 'AuthKey' } });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(push.state()).toBe('on');
    });
  });

  describe('turning on', () => {
    it('subscribes with the public key of the server and registers the device', async () => {
      const done = push.enable();
      await tick();
      config();
      await tick();
      const request = http.expectOne('/api/push/subscriptions');
      expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'PUBLIC-KEY' });
      expect(request.request.body.endpoint).toBe('https://push.example/device-1');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(push.state()).toBe('on');
      expect(push.busy()).toBe(false);
    });

    it('takes a fresh subscription when the browser was tied to another restaurant', async () => {
      let n = 0;
      sw.requestSubscription.mockImplementation(async () => fakeSubscription(`https://push.example/device-${++n}`));

      const done = push.enable();
      await tick();
      config();
      await tick();
      http.expectOne('/api/push/subscriptions').flush(
        { code: 'push.endpoint_in_use', detail: 'Ovaj browser je već vezan za nalog drugog restorana.' }, { status: 409, statusText: 'Conflict' });
      await tick();
      const retry = http.expectOne('/api/push/subscriptions');
      expect(retry.request.body.endpoint).toBe('https://push.example/device-2');
      retry.flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(sw.unsubscribe).toHaveBeenCalledOnce();
      expect(push.state()).toBe('on');
    });

    it('becomes blocked, without an error message, when the user refuses the permission', async () => {
      sw.requestSubscription.mockImplementation(async () => {
        env.permission = 'denied';
        throw new Error('Permission denied');
      });

      const done = push.enable();
      await tick();
      config();
      await done;

      expect(push.state()).toBe('blocked');
      expect(push.error()).toBe('');
    });

    it('shows the error and keeps the state when the server refuses', async () => {
      const done = push.enable();
      await tick();
      config();
      await tick();
      http.expectOne('/api/push/subscriptions').flush({ detail: 'Obaveštenja nisu uključena na serveru.' }, { status: 409, statusText: 'Conflict' });
      await done;

      expect(push.error()).toContain('nisu uključena');
      expect(push.state()).toBe('loading');
      expect(push.busy()).toBe(false);
    });

    it('does not subscribe when the server has no keys', async () => {
      const done = push.enable();
      await tick();
      config(false);
      await done;

      expect(sw.requestSubscription).not.toHaveBeenCalled();
      expect(push.state()).toBe('server-off');
    });
  });

  describe('turning off', () => {
    it('removes the device from the server and from the browser', async () => {
      sw.subscription.next(fakeSubscription('https://push.example/device-1'));

      const done = push.disable();
      await tick();
      const request = http.expectOne((r) => r.url === '/api/push/subscriptions' && r.method === 'DELETE');
      expect(request.request.params.get('endpoint')).toBe('https://push.example/device-1');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(sw.unsubscribe).toHaveBeenCalledOnce();
      expect(push.state()).toBe('off');
    });

    it('still unsubscribes the browser when the server cannot be reached', async () => {
      sw.subscription.next(fakeSubscription('https://push.example/device-1'));

      const done = push.disable();
      await tick();
      http.expectOne((r) => r.method === 'DELETE').error(new ProgressEvent('error'), { status: 0 });
      await done;

      expect(sw.unsubscribe).toHaveBeenCalledOnce();
      expect(push.state()).toBe('off');
    });

    it('does nothing when the device was not subscribed', async () => {
      await push.disable();

      http.expectNone((r) => r.method === 'DELETE');
      expect(sw.unsubscribe).not.toHaveBeenCalled();
    });
  });

  it('asks the server for a test notification', async () => {
    const done = push.sendTest();
    await tick();
    http.expectOne('/api/push/test').flush(null, { status: 204, statusText: 'No Content' });
    await done;

    expect(push.error()).toBe('');
  });

  describe('signing out', () => {
    it('takes the device off the account before the session ends, and sign-out succeeds even if that fails', async () => {
      TestBed.inject(AuthService).token.set('jwt');
      sw.subscription.next(fakeSubscription('https://push.example/device-1'));
      const order: string[] = [];

      const done = TestBed.inject(AuthService).logout();
      await tick();
      const remove = http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/push/subscriptions');
      order.push('uređaj skinut');
      remove.error(new ProgressEvent('error'), { status: 0 });   // čak i kad ne uspe
      await tick();
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      order.push('odjava');
      await done;

      expect(order).toEqual(['uređaj skinut', 'odjava']);
      expect(sw.unsubscribe).toHaveBeenCalledOnce();
      expect(TestBed.inject(AuthService).token()).toBeNull();
    });
  });
});
