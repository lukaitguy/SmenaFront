import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncementsStore } from './announcements';
import { AuthService } from './auth';
import { BoardConnection } from './board';
import { Announcement, CurrentUser } from './models';
import { ToastService } from '../ui/toast';

const announcement = (overrides: Partial<Announcement> = {}): Announcement => ({
  id: 'a-1', title: 'Sastanak sale', body: null, meetingAt: null, createdByEmployeeId: 'boss', createdByName: 'Nikola',
  createdAt: '2026-11-05T10:00:00Z', audience: ['Konobar'], forMe: true, readAt: null, recipients: null, ...overrides,
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('AnnouncementsStore', () => {
  let http: HttpTestingController;
  let store: AnnouncementsStore;
  let board: BoardConnection;
  let toast: ToastService;

  function signIn(role: CurrentUser['role']): void {
    TestBed.inject(AuthService).user.set({
      employeeId: 'me', firstName: 'A', lastName: 'B', role, restaurantId: 'r', restaurantName: 'R',
      restaurantTimeZoneId: 'Europe/Belgrade', positions: [],
    });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AnnouncementsStore);
    board = TestBed.inject(BoardConnection);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => http.verify());

  async function startAs(role: CurrentUser['role'], items: Announcement[]): Promise<void> {
    signIn(role);
    store.start();
    http.expectOne(role === 'Staff' ? '/api/announcements/mine' : '/api/announcements').flush(items);
    await tick();
  }

  it('loads only what an employee received, and everything for a manager', async () => {
    await startAs('Staff', [announcement()]);
    expect(store.items()).toHaveLength(1);
  });

  it('asks the manager endpoint for managers', async () => {
    await startAs('Manager', [announcement({ forMe: false, recipients: [] })]);
    expect(store.items()[0].forMe).toBe(false);
  });

  it('counts only unread announcements meant for me', async () => {
    await startAs('Manager', [
      announcement({ id: 'a-1' }),
      announcement({ id: 'a-2', readAt: '2026-11-05T11:00:00Z' }),
      announcement({ id: 'a-3', forMe: false, recipients: [] }),
    ]);

    expect(store.unreadCount()).toBe(1);
  });

  it('confirms reading on the server and then clears the unread mark', async () => {
    await startAs('Staff', [announcement()]);

    const done = store.markRead(store.items()[0]);
    http.expectOne('/api/announcements/a-1/read').flush(null);
    await done;

    expect(store.items()[0].readAt).not.toBeNull();
    expect(store.unreadCount()).toBe(0);
  });

  it('keeps it unread when the server refuses', async () => {
    await startAs('Staff', [announcement()]);

    const done = store.markRead(store.items()[0]);
    http.expectOne('/api/announcements/a-1/read').flush({}, { status: 404, statusText: 'Not Found' });

    await expect(done).rejects.toBeTruthy();
    expect(store.unreadCount()).toBe(1);
  });

  it('shows a new announcement live, unread and newest first, with a notice', async () => {
    await startAs('Staff', [announcement({ id: 'old', createdAt: '2026-11-01T10:00:00Z' })]);

    board.announcementCreated.next(announcement({ id: 'new', title: 'Sastanak u 15h', createdAt: '2026-11-05T12:00:00Z', forMe: false }));

    expect(store.items().map((a) => a.id)).toEqual(['new', 'old']);
    expect(store.items()[0].forMe).toBe(true);
    expect(store.unreadCount()).toBe(2);
    expect(toast.toasts().some((t) => t.text.includes('Sastanak u 15h'))).toBe(true);
  });

  it('does not duplicate an announcement that arrives twice', async () => {
    await startAs('Staff', []);

    board.announcementCreated.next(announcement());
    board.announcementCreated.next(announcement());

    expect(store.items()).toHaveLength(1);
  });

  it('removes a deleted announcement live', async () => {
    await startAs('Staff', [announcement()]);

    board.announcementDeleted.next('a-1');

    expect(store.items()).toEqual([]);
  });

  it('reloads the manager list when it changes elsewhere', async () => {
    await startAs('Manager', []);

    board.announcementsChanged.next();
    http.expectOne('/api/announcements').flush([announcement({ forMe: false, recipients: [] })]);
    await tick();

    expect(store.items()).toHaveLength(1);
  });

  it('shows who has just read it to the manager', async () => {
    await startAs('Manager', [
      announcement({ forMe: false, recipients: [{ employeeId: 'e-1', name: 'Ana', readAt: null }, { employeeId: 'e-2', name: 'Jelena', readAt: null }] }),
    ]);

    board.announcementRead.next({ announcementId: 'a-1', employeeId: 'e-2', readAt: '2026-11-05T13:00:00Z' });

    const recipients = store.items()[0].recipients!;
    expect(recipients.find((r) => r.employeeId === 'e-2')?.readAt).toBe('2026-11-05T13:00:00Z');
    expect(recipients.find((r) => r.employeeId === 'e-1')?.readAt).toBeNull();
  });

  it('pulls the whole list again after the connection comes back', async () => {
    await startAs('Staff', []);

    board.reconnected.next();
    http.expectOne('/api/announcements/mine').flush([announcement()]);
    await tick();

    expect(store.items()).toHaveLength(1);
  });

  it('forgets everything on sign-out and works again for the next person without duplicate listeners', async () => {
    await startAs('Staff', [announcement()]);

    store.stop();
    expect(store.items()).toEqual([]);
    board.announcementCreated.next(announcement({ id: 'ghost' }));
    expect(store.items()).toEqual([]);

    store.start();
    http.expectOne('/api/announcements/mine').flush([]);
    await tick();
    board.announcementCreated.next(announcement({ id: 'b-1' }));

    expect(store.items()).toHaveLength(1);
    // Jedno obaveštenje: ni duh pretplate pre odjave ni dupla pretplata posle ponovnog starta.
    expect(toast.toasts().filter((t) => t.text.includes('Sastanak sale'))).toHaveLength(1);
  });
});
