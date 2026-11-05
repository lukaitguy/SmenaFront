import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PushService, PushState } from '../../core/push';
import { NotificationsPage } from './notifications.page';

function open(state: PushState, error = '') {
  const push = {
    state: signal<PushState>(state),
    busy: signal(false),
    error: signal(error),
    refresh: vi.fn(async () => undefined),
    enable: vi.fn(async () => undefined),
    disable: vi.fn(async () => undefined),
    sendTest: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: PushService, useValue: push }] });
  const fixture = TestBed.createComponent(NotificationsPage);
  fixture.detectChanges();
  return { push, root: fixture.nativeElement as HTMLElement, fixture };
}

function click(root: HTMLElement, text: string): void {
  const found = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!found) {
    throw new Error(`Dugme "${text}" ne postoji.`);
  }
  (found as HTMLButtonElement).click();
}

describe('NotificationsPage', () => {
  it('checks the state when opened', () => {
    const { push } = open('loading');

    expect(push.refresh).toHaveBeenCalledOnce();
  });

  it('explains how to add the app to the home screen on an iPhone', () => {
    const { root } = open('needs-install');

    expect(root.textContent).toContain('Dodaj Smenu na početni ekran');
    expect(root.textContent).toContain('Dodaj na početni ekran');
    expect(root.textContent).toContain('iOS 16.4');
    expect(root.querySelector('button')).toBeNull();
  });

  it('offers to turn notifications on, and does so only on a click', () => {
    const { root, push } = open('off');
    expect(push.enable).not.toHaveBeenCalled();

    click(root, 'Uključi obaveštenja');

    expect(push.enable).toHaveBeenCalledOnce();
  });

  it('shows what to do when they were blocked in the browser', () => {
    const { root } = open('blocked');

    expect(root.textContent).toContain('blokirana');
    expect(root.textContent).toContain('podešavanjima');
    expect(root.querySelector('button')).toBeNull();
  });

  it('says plainly when the device or the server cannot do it and that mail still works', () => {
    expect(open('unsupported').root.textContent).toContain('Mejlovi i dalje stižu');
    TestBed.resetTestingModule();
    expect(open('server-off').root.textContent).toContain('stižu mejlom');
  });

  it('lets the user test and turn off notifications when they are on', () => {
    const { root, push } = open('on');
    expect(root.textContent).toContain('uključena na ovom uređaju');

    click(root, 'Pošalji probno obaveštenje');
    click(root, 'Isključi');

    expect(push.sendTest).toHaveBeenCalledOnce();
    expect(push.disable).toHaveBeenCalledOnce();
  });

  it('shows an error under the card', () => {
    const { root } = open('off', 'Server nije dostupan.');

    expect(root.querySelector('[role=alert]')?.textContent).toContain('Server nije dostupan.');
  });
});
