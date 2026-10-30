import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth';
import { authInterceptor } from './auth.interceptor';
import { CurrentUser } from './models';

const USER: CurrentUser = {
  employeeId: 'e1',
  firstName: 'Ana',
  lastName: 'Petrović',
  role: 'Staff',
  restaurantId: 'r1',
  restaurantName: 'Bistro Demo',
  restaurantTimeZoneId: 'Europe/Belgrade',
  positions: [{ id: 'p1', name: 'Konobar' }],
};

/** Pušta da se završe obećanja pre sledećeg koraka testa (firstValueFrom resolve-uje asinhrono). */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('AuthService and authInterceptor', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let client: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  async function signIn(user: CurrentUser = USER): Promise<void> {
    const login = auth.login('ana@demo.rs', 'lozinka123');
    http.expectOne('/api/auth/login').flush({ accessToken: 'token-1', expiresAt: '2026-11-01T00:00:00Z' });
    await tick();
    http.expectOne('/api/auth/me').flush(user);
    await login;
  }

  it('stores the token and the user after login and remembers the session', async () => {
    await signIn();

    expect(auth.token()).toBe('token-1');
    expect(auth.user()?.firstName).toBe('Ana');
    expect(auth.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('smena.session')).toBe('1');
  });

  it('knows who is a manager', async () => {
    await signIn({ ...USER, role: 'Manager' });
    expect(auth.isManager()).toBe(true);
    expect(auth.timeZone()).toBe('Europe/Belgrade');
  });

  it('does not call refresh for a visitor who never signed in', async () => {
    await auth.restore();

    http.expectNone('/api/auth/refresh');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restores the session from the refresh cookie when this browser signed in before', async () => {
    localStorage.setItem('smena.session', '1');

    const restore = auth.restore();
    http.expectOne('/api/auth/refresh').flush({ accessToken: 'token-2', expiresAt: '2026-11-01T00:00:00Z' });
    await tick();
    http.expectOne('/api/auth/me').flush(USER);
    await restore;

    expect(auth.token()).toBe('token-2');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('forgets the session when the refresh cookie is no longer valid', async () => {
    localStorage.setItem('smena.session', '1');

    const restore = auth.restore();
    http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await restore;

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('smena.session')).toBeNull();
  });

  it('adds the access token to API calls', async () => {
    await signIn();

    const call = new Promise((resolve) => client.get('/api/positions').subscribe(resolve));
    const request = http.expectOne('/api/positions');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush([]);
    await call;
  });

  it('does not touch requests to other hosts', async () => {
    await signIn();

    client.get('https://example.com/data').subscribe();
    const request = http.expectOne('https://example.com/data');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('refreshes the token once on 401 and repeats the request', async () => {
    await signIn();

    const result = new Promise((resolve) => client.get('/api/positions').subscribe(resolve));
    http.expectOne('/api/positions').flush(null, { status: 401, statusText: 'Unauthorized' });
    await tick();
    http.expectOne('/api/auth/refresh').flush({ accessToken: 'token-3', expiresAt: '2026-11-01T00:00:00Z' });
    await tick();
    http.expectOne('/api/auth/me').flush(USER);
    await tick();

    const retried = http.expectOne('/api/positions');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer token-3');
    retried.flush([{ id: 'p1', name: 'Konobar' }]);
    expect(await result).toEqual([{ id: 'p1', name: 'Konobar' }]);
  });

  it('shares one refresh between simultaneous 401 responses', async () => {
    await signIn();

    client.get('/api/positions').subscribe();
    client.get('/api/employees').subscribe();
    http.expectOne('/api/positions').flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/employees').flush(null, { status: 401, statusText: 'Unauthorized' });
    await tick();

    http.expectOne('/api/auth/refresh').flush({ accessToken: 'token-4', expiresAt: '2026-11-01T00:00:00Z' });
    await tick();
    http.expectOne('/api/auth/me').flush(USER);
    await tick();
    http.expectOne('/api/positions').flush([]);
    http.expectOne('/api/employees').flush([]);
  });

  it('signs the user out and goes to login when the refresh fails', async () => {
    await signIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    let failed = false;
    client.get('/api/positions').subscribe({ error: () => (failed = true) });
    http.expectOne('/api/positions').flush(null, { status: 401, statusText: 'Unauthorized' });
    await tick();
    http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await tick();

    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/prijava']);
  });

  it('does not try to refresh when the login itself is rejected', async () => {
    const login = auth.login('ana@demo.rs', 'pogresna');
    http.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(login).rejects.toBeTruthy();
    http.expectNone('/api/auth/refresh');
  });

  it('clears everything on logout even if the server cannot be reached', async () => {
    await signIn();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const logout = auth.logout();
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
    await logout;

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('smena.session')).toBeNull();
  });
});
