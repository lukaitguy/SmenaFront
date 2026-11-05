import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fragmentParams, fragmentValue } from '../../core/fragment';
import { ForgotPasswordPage } from './forgot-password.page';
import { InvitationPage } from './invitation.page';
import { ResetPasswordPage } from './reset-password.page';

@Component({ template: '' })
class Blank {}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('fragment helpers', () => {
  it('decodes the whole fragment', () => {
    expect(fragmentValue('#abc%2Bdef%3D')).toBe('abc+def=');
    expect(fragmentValue('')).toBe('');
    expect(fragmentValue('#%E0%A4%A')).toBe(''); // pokvaren zapis ne ruši stranicu
  });

  it('keeps a literal plus in the token, as the router leaves it', () => {
    const params = fragmentParams('#email=ana%40demo.rs&token=a+b/c=');
    expect(params.get('token')).toBe('a+b/c=');
    expect(params.get('email')).toBe('ana@demo.rs');
  });

  it('skips broken pairs instead of failing', () => {
    expect(fragmentParams('#x&=y&token=%E0%A4%A&email=a').get('email')).toBe('a');
    expect(fragmentParams('#x&=y&token=%E0%A4%A').has('token')).toBe(false);
  });

  it('reads key=value pairs without turning an encoded plus into a space', () => {
    const params = fragmentParams('#email=ana%40demo.rs&token=a%2Bb%2Fc');
    expect(params.get('email')).toBe('ana@demo.rs');
    expect(params.get('token')).toBe('a+b/c');
  });
});

describe('account recovery pages', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', component: Blank }])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    window.location.hash = '';
  });

  async function open<T>(page: Type<T>, hash: string): Promise<{ fixture: ComponentFixture<T>; root: HTMLElement }> {
    window.location.hash = hash;
    const fixture = TestBed.createComponent(page);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function type(fixture: ComponentFixture<unknown>, root: HTMLElement, selector: string, value: string): Promise<void> {
    const input = root.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  }

  const submit = async (fixture: ComponentFixture<unknown>, root: HTMLElement) => {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };

  const alert = (root: HTMLElement) => root.querySelector('[role=alert]')?.textContent?.trim() ?? '';

  describe('invitation', () => {
    const PREVIEW = { restaurantName: 'Bistro Demo', email: 'nova@demo.rs', role: 'Staff', expiresAt: '2026-12-01T00:00:00Z' };

    it('shows who invited you and to which role, asking for the token in the body and not in the URL', async () => {
      const { fixture, root } = await open(InvitationPage, '#tajni%2Btoken');

      const request = http.expectOne('/api/invitations/preview');
      expect(request.request.body).toEqual({ token: 'tajni+token' });
      request.flush(PREVIEW);
      await settle(fixture);

      expect(root.textContent).toContain('Bistro Demo te poziva kao: zaposleni');
      expect((root.querySelector('#email') as HTMLInputElement).value).toBe('nova@demo.rs');
    });

    it('says so when the invitation is no longer valid and shows no form', async () => {
      const { fixture, root } = await open(InvitationPage, '#istekao');

      http.expectOne('/api/invitations/preview').flush(
        { detail: 'Poziv ne postoji, iskorišćen je ili je istekao.' }, { status: 404, statusText: 'Not Found' });
      await settle(fixture);

      expect(alert(root)).toContain('istekao');
      expect(root.querySelector('form')).toBeNull();
    });

    it('does not even call the server for a link without a token', async () => {
      const { fixture, root } = await open(InvitationPage, '');
      await settle(fixture);

      http.expectNone('/api/invitations/preview');
      expect(alert(root)).toContain('nije potpun');
    });

    it('refuses different passwords before calling the server', async () => {
      const { fixture, root } = await open(InvitationPage, '#tok');
      http.expectOne('/api/invitations/preview').flush(PREVIEW);
      await settle(fixture);
      await type(fixture, root, '#first', 'Ana');
      await type(fixture, root, '#last', 'Petrović');
      await type(fixture, root, '#password', 'lozinka123');
      await type(fixture, root, '#confirm', 'lozinka124');

      await submit(fixture, root);

      expect(alert(root)).toContain('ne poklapaju');
      http.expectNone('/api/invitations/accept');
    });

    it('creates the account, signs in and goes to the start page', async () => {
      const { fixture, root } = await open(InvitationPage, '#tok');
      http.expectOne('/api/invitations/preview').flush(PREVIEW);
      await settle(fixture);
      await type(fixture, root, '#first', ' Ana ');
      await type(fixture, root, '#last', 'Petrović');
      await type(fixture, root, '#password', 'lozinka123');
      await type(fixture, root, '#confirm', 'lozinka123');
      const navigate = TestBed.inject(Router).navigate.bind(TestBed.inject(Router));
      let target: unknown;
      TestBed.inject(Router).navigate = ((commands: unknown) => { target = commands; return navigate(['/']); }) as Router['navigate'];

      await submit(fixture, root);

      const accept = http.expectOne('/api/invitations/accept');
      expect(accept.request.body).toEqual({ token: 'tok', firstName: 'Ana', lastName: 'Petrović', password: 'lozinka123' });
      accept.flush({ accessToken: 'jwt', expiresAt: '2026-11-05T20:00:00Z' });
      await tick();
      http.expectOne('/api/auth/me').flush({
        employeeId: 'e', firstName: 'Ana', lastName: 'Petrović', role: 'Staff', restaurantId: 'r', restaurantName: 'Bistro Demo',
        restaurantTimeZoneId: 'Europe/Belgrade', positions: [],
      });
      await tick();

      expect(target).toEqual(['/']);
    });

    it('shows the server refusal, e.g. a weak password', async () => {
      const { fixture, root } = await open(InvitationPage, '#tok');
      http.expectOne('/api/invitations/preview').flush(PREVIEW);
      await settle(fixture);
      await type(fixture, root, '#first', 'Ana');
      await type(fixture, root, '#last', 'P');
      await type(fixture, root, '#password', 'kratko1');
      await type(fixture, root, '#confirm', 'kratko1');

      await submit(fixture, root);
      http.expectOne('/api/invitations/accept').flush({ detail: 'Lozinka je prekratka.' }, { status: 400, statusText: 'Bad Request' });
      await settle(fixture);

      expect(alert(root)).toContain('prekratka');
    });
  });

  describe('forgot password', () => {
    it('sends the email and always shows the same neutral message', async () => {
      const { fixture, root } = await open(ForgotPasswordPage, '');
      await type(fixture, root, '#email', ' ana@demo.rs ');

      await submit(fixture, root);
      const request = http.expectOne('/api/auth/forgot-password');
      expect(request.request.body).toEqual({ email: 'ana@demo.rs' });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle(fixture);

      expect(root.textContent).toContain('Ako nalog sa tim emailom postoji');
      expect(root.querySelector('form')).toBeNull();
    });

    it('shows an error when the server cannot be reached', async () => {
      const { fixture, root } = await open(ForgotPasswordPage, '');
      await type(fixture, root, '#email', 'ana@demo.rs');

      await submit(fixture, root);
      http.expectOne('/api/auth/forgot-password').error(new ProgressEvent('error'), { status: 0 });
      await settle(fixture);

      expect(alert(root)).toContain('Server nije dostupan');
    });
  });

  describe('reset password', () => {
    const HASH = '#email=ana%40demo.rs&token=a%2Bb';

    it('sends email, token and the new password in the body', async () => {
      const { fixture, root } = await open(ResetPasswordPage, HASH);
      expect(root.textContent).toContain('ana@demo.rs');
      await type(fixture, root, '#password', 'novalozinka1');
      await type(fixture, root, '#confirm', 'novalozinka1');

      await submit(fixture, root);
      const request = http.expectOne('/api/auth/reset-password');
      expect(request.request.body).toEqual({ email: 'ana@demo.rs', token: 'a+b', newPassword: 'novalozinka1' });
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle(fixture);

      expect(root.textContent).toContain('Lozinka je promenjena');
      expect(root.querySelector('a[href="/prijava"]')).not.toBeNull();
    });

    it('refuses different passwords before calling the server', async () => {
      const { fixture, root } = await open(ResetPasswordPage, HASH);
      await type(fixture, root, '#password', 'novalozinka1');
      await type(fixture, root, '#confirm', 'drugalozinka1');

      await submit(fixture, root);

      expect(alert(root)).toContain('ne poklapaju');
      http.expectNone('/api/auth/reset-password');
    });

    it('shows that the link expired and offers a new one', async () => {
      const { fixture, root } = await open(ResetPasswordPage, HASH);
      await type(fixture, root, '#password', 'novalozinka1');
      await type(fixture, root, '#confirm', 'novalozinka1');

      await submit(fixture, root);
      http.expectOne('/api/auth/reset-password').flush(
        { detail: 'Link za reset lozinke je neispravan ili je istekao.' }, { status: 400, statusText: 'Bad Request' });
      await settle(fixture);

      expect(alert(root)).toContain('istekao');
    });

    it('does not show a form for an incomplete link', async () => {
      const { root } = await open(ResetPasswordPage, '#email=ana%40demo.rs');

      expect(root.querySelector('form')).toBeNull();
      expect(alert(root)).toContain('nije potpun');
      expect(root.querySelector('a[href="/zaboravljena-lozinka"]')).not.toBeNull();
    });
  });
});
