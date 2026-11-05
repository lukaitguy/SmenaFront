import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../core/auth';
import { Employee, Position } from '../../core/models';
import { AnnouncementDialog } from './announcement-dialog';

const WAITER: Position = { id: 'p-waiter', name: 'Konobar' };
const COOK: Position = { id: 'p-cook', name: 'Kuvar' };
const BAR: Position = { id: 'p-bar', name: 'Šanker' };

const person = (id: string, firstName: string, positions: Position[], status: Employee['status'] = 'Active'): Employee => ({
  id, firstName, lastName: 'Test', role: 'Staff', status, positions,
});

const EMPLOYEES = [
  person('me', 'Nikola', []),
  person('ana', 'Ana', [WAITER]),
  person('jelena', 'Jelena', [WAITER]),
  person('milan', 'Milan', [COOK]),
  person('nemanja', 'Nemanja', [BAR]),
  person('gone', 'Bivši', [WAITER], 'Inactive'),
];

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('AnnouncementDialog', () => {
  let fixture: ComponentFixture<AnnouncementDialog>;
  let http: HttpTestingController;
  let created: unknown[];

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).user.set({
      employeeId: 'me', firstName: 'Nikola', lastName: 'L', role: 'Manager', restaurantId: 'r', restaurantName: 'R',
      restaurantTimeZoneId: 'Europe/Belgrade', positions: [],
    });
    created = [];

    fixture = TestBed.createComponent(AnnouncementDialog);
    fixture.componentRef.setInput('positions', [WAITER, COOK, BAR]);
    fixture.componentRef.setInput('employees', EMPLOYEES);
    fixture.componentInstance.created.subscribe((a) => created.push(a));
    await settle();
  });

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(text: string): HTMLButtonElement {
    const found = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim().includes(text));
    if (!found) {
      throw new Error(`Dugme "${text}" ne postoji.`);
    }
    return found as HTMLButtonElement;
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = root().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function check(name: string): Promise<void> {
    const box = root().querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;
    box.click();
    await settle();
  }

  async function submit(): Promise<void> {
    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  const error = () => root().querySelector('[role=alert]')?.textContent ?? '';

  it('lists active employees except the author', () => {
    const names = Array.from(root().querySelectorAll('li label span:nth-child(2)')).map((s) => s.textContent?.trim());

    expect(names).toEqual(['Ana Test', 'Jelena Test', 'Milan Test', 'Nemanja Test']);
  });

  it('counts the people a role covers and shows them as covered', async () => {
    button('Konobar').click();
    await settle();

    expect(root().textContent).toContain('Primaoci: 2');
    const ana = root().querySelector('input[aria-label="Ana Test"]') as HTMLInputElement;
    expect(ana.checked).toBe(true);
    expect(ana.disabled).toBe(true);
    expect(root().textContent).toContain('preko uloge');
  });

  it('adds single people on top of the roles without counting anyone twice', async () => {
    button('Konobar').click();
    await settle();
    await check('Milan Test');

    expect(root().textContent).toContain('Primaoci: 3');
  });

  it('filters people by name', async () => {
    await type('input[type=search]', 'jele');

    expect(root().querySelectorAll('li label')).toHaveLength(1);
  });

  it('asks for a title and for an audience before sending', async () => {
    await submit();
    expect(error()).toContain('naslov');

    await type('#ann-title', 'Sastanak');
    await submit();
    expect(error()).toContain('uloge ili osobe');
    http.expectNone('/api/announcements');
  });

  it('sends the roles and only the people not already covered by a role', async () => {
    await type('#ann-title', '  Sastanak sale ');
    await type('#ann-body', 'Dolazite svi');
    button('Konobar').click();
    await settle();
    await check('Milan Test');

    await submit();

    const request = http.expectOne('/api/announcements');
    expect(request.request.body).toEqual({
      title: 'Sastanak sale', body: 'Dolazite svi', meetingAt: null, positionIds: ['p-waiter'], employeeIds: ['milan'],
    });
    request.flush({ id: 'a-1' });
    await tick();
    expect(created).toHaveLength(1);
  });

  it('sends the meeting time in UTC from restaurant time', async () => {
    await type('#ann-title', 'Sastanak');
    button('Kuvar').click();
    await settle();
    (root().querySelector('input[name=hasMeeting]') as HTMLInputElement).click();
    await settle();
    await type('#ann-date', '2030-01-15');
    await type('#ann-time', '15:30');

    await submit();

    const request = http.expectOne('/api/announcements');
    expect((request.request.body as { meetingAt: string }).meetingAt).toBe('2030-01-15T14:30:00.000Z'); // zima: UTC+1
    request.flush({ id: 'a-1' });
  });

  it('refuses a meeting in the past before calling the server', async () => {
    await type('#ann-title', 'Sastanak');
    button('Kuvar').click();
    await settle();
    (root().querySelector('input[name=hasMeeting]') as HTMLInputElement).click();
    await settle();
    await type('#ann-date', '2020-01-01');

    await submit();

    expect(error()).toContain('budućnosti');
    http.expectNone('/api/announcements');
  });

  it('refuses a role nobody active has', async () => {
    fixture.componentRef.setInput('employees', [person('me', 'Nikola', []), person('gone', 'Bivši', [WAITER], 'Inactive')]);
    await settle();
    await type('#ann-title', 'Sastanak');
    button('Konobar').click();
    await settle();

    await submit();

    expect(error()).toContain('nijednog aktivnog');
    http.expectNone('/api/announcements');
  });

  it('shows the server refusal and does not close', async () => {
    await type('#ann-title', 'Sastanak');
    button('Kuvar').click();
    await settle();

    await submit();
    http.expectOne('/api/announcements').flush({ detail: 'Nema nikoga.' }, { status: 400, statusText: 'Bad Request' });
    await tick();
    fixture.detectChanges();

    expect(error()).toContain('Nema nikoga.');
    expect(created).toEqual([]);
  });
});
