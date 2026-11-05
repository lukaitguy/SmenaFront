import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../core/auth';
import { Employee, Invitation, Position } from '../../core/models';
import { EmployeeDialog } from './employee-dialog';
import { EmployeesPage } from './employees.page';
import { InviteDialog } from './invite-dialog';

const WAITER: Position = { id: 'p-waiter', name: 'Konobar' };
const COOK: Position = { id: 'p-cook', name: 'Kuvar' };
const BAR: Position = { id: 'p-bar', name: 'Šanker' };

const person = (id: string, firstName: string, role: Employee['role'], positions: Position[], status: Employee['status'] = 'Active'): Employee => ({
  id, firstName, lastName: 'Test', role, status, positions,
});

const OWNER = person('owner', 'Marija', 'Owner', []);
const ME = person('me', 'Nikola', 'Manager', []);
const ANA = person('ana', 'Ana', 'Staff', [WAITER]);
const MARKO = person('marko', 'Marko', 'Staff', [WAITER, BAR]);
const GONE = person('gone', 'Bivši', 'Staff', [], 'Inactive');

const INVITATION: Invitation = {
  id: 'inv-1', email: 'nova@demo.rs', role: 'Staff', positionId: COOK.id, createdAt: '2026-11-05T10:00:00Z', expiresAt: '2026-11-12T10:00:00Z',
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

function setup(): HttpTestingController {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(AuthService).user.set({
    employeeId: 'me', firstName: 'Nikola', lastName: 'Test', role: 'Manager', restaurantId: 'r', restaurantName: 'R',
    restaurantTimeZoneId: 'Europe/Belgrade', positions: [],
  });
  return TestBed.inject(HttpTestingController);
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await tick();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim().includes(text));
  if (!found) {
    throw new Error(`Dugme "${text}" ne postoji.`);
  }
  return found as HTMLButtonElement;
}

async function type(fixture: ComponentFixture<unknown>, root: HTMLElement, selector: string, value: string): Promise<void> {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  await settle(fixture);
}

const alertText = (root: HTMLElement) => root.querySelector('[role=alert]')?.textContent?.trim() ?? '';

describe('EmployeesPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EmployeesPage>;
  let root: HTMLElement;

  beforeEach(async () => {
    http = setup();
    fixture = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    http.expectOne('/api/employees').flush([OWNER, ME, ANA, MARKO, GONE]);
    http.expectOne('/api/invitations').flush([INVITATION]);
    http.expectOne('/api/positions').flush([WAITER, COOK, BAR]);
    root = fixture.nativeElement as HTMLElement;
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('lists active employees with their role and positions, and counts the pending invitations', () => {
    expect(root.textContent).toContain('4 aktivnih · 1 pozivnica na čekanju');
    expect(root.textContent).toContain('Ana Test');
    expect(root.textContent).toContain('Menadžer');
    expect(root.textContent).toContain('Vlasnik');
    expect(root.textContent).toContain('Konobar');
    expect(root.textContent).toContain('Bez pozicije');
    expect(root.textContent).not.toContain('Bivši');
  });

  it('marks the signed-in person', () => {
    const rows = Array.from(root.querySelectorAll('section:first-of-type li'));
    const me = rows.find((r) => r.textContent?.includes('Nikola'));
    const ana = rows.find((r) => r.textContent?.includes('Ana'));

    expect(me?.textContent).toContain('(ti)');
    expect(ana?.textContent).not.toContain('(ti)');
  });

  it('lets the owner and yourself be edited but never deactivated', () => {
    const rows = Array.from(root.querySelectorAll('section:first-of-type li'));
    const deactivate = (name: string) => rows.find((r) => r.textContent?.includes(name))?.textContent?.includes('Deaktiviraj');

    expect(deactivate('Marija')).toBe(false);
    expect(deactivate('Nikola')).toBe(false);
    expect(deactivate('Ana')).toBe(true);
  });

  it('asks for confirmation before deactivating and then moves the person to the inactive list', async () => {
    const row = Array.from(root.querySelectorAll('section:first-of-type li')).find((r) => r.textContent?.includes('Ana')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Deaktiviraj')) as HTMLButtonElement).click();
    await settle(fixture);
    http.expectNone('/api/employees/ana/status');

    button(root, 'Da, deaktiviraj').click();
    await settle(fixture);
    const request = http.expectOne('/api/employees/ana/status');
    expect(request.request.body).toEqual({ status: 'Inactive' });
    request.flush({ ...ANA, status: 'Inactive' });
    await settle(fixture);

    expect(root.textContent).toContain('3 aktivnih');
    expect(root.textContent).toContain('Neaktivni (2)');
  });

  it('reactivates someone from the inactive list', async () => {
    button(root, 'Neaktivni (1)').click();
    await settle(fixture);

    button(root, 'Aktiviraj').click();
    await settle(fixture);
    const request = http.expectOne('/api/employees/gone/status');
    expect(request.request.body).toEqual({ status: 'Active' });
    request.flush({ ...GONE, status: 'Active' });
    await settle(fixture);

    expect(root.textContent).toContain('5 aktivnih');
  });

  it('keeps the person and shows the server refusal in their row', async () => {
    const row = Array.from(root.querySelectorAll('section:first-of-type li')).find((r) => r.textContent?.includes('Ana')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Deaktiviraj')) as HTMLButtonElement).click();
    await settle(fixture);
    button(root, 'Da, deaktiviraj').click();
    await settle(fixture);

    http.expectOne('/api/employees/ana/status').flush({ detail: 'Nije dozvoljeno.' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);

    expect(alertText(root)).toContain('Nije dozvoljeno.');
    expect(root.textContent).toContain('4 aktivnih');
  });

  it('shows pending invitations with role, position and expiry', () => {
    expect(root.textContent).toContain('nova@demo.rs');
    expect(root.textContent).toContain('Zaposleni · Kuvar');
    expect(root.textContent).toContain('važi do 12.11.');
  });

  it('withdraws an invitation', async () => {
    button(root, 'Povuci').click();
    await settle(fixture);

    const request = http.expectOne('/api/invitations/inv-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(root.textContent).not.toContain('nova@demo.rs');
    expect(root.textContent).toContain('0 pozivnica na čekanju');
  });

  it('sends an invitation again with the same data and reloads the list', async () => {
    button(root, 'Pošalji ponovo').click();
    await settle(fixture);

    const request = http.expectOne('/api/invitations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'nova@demo.rs', role: 'Staff', positionId: 'p-cook' });
    request.flush({ invitation: INVITATION, acceptUrl: 'http://x/pozivnica#t', emailSent: true });
    await tick();
    http.expectOne('/api/invitations').flush([INVITATION]);
    await settle(fixture);

    expect(root.textContent).toContain('nova@demo.rs');
  });

  it('opens the edit dialog for the chosen employee', async () => {
    const row = Array.from(root.querySelectorAll('section:first-of-type li')).find((r) => r.textContent?.includes('Marko')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Izmeni')) as HTMLButtonElement).click();
    await settle(fixture);

    expect(root.querySelector('app-employee-dialog')).not.toBeNull();
    expect(root.textContent).toContain('Izmena zaposlenog');
  });
});

describe('EmployeeDialog', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EmployeeDialog>;
  let root: HTMLElement;
  let saved: Employee[];

  async function open(employee: Employee): Promise<void> {
    http = setup();
    saved = [];
    fixture = TestBed.createComponent(EmployeeDialog);
    fixture.componentRef.setInput('employee', employee);
    fixture.componentRef.setInput('positions', [WAITER, COOK, BAR]);
    fixture.componentInstance.saved.subscribe((e) => saved.push(e));
    root = fixture.nativeElement as HTMLElement;
    await settle(fixture);
  }

  afterEach(() => http.verify());

  const roleSelect = () => root.querySelector('#emp-role') as HTMLSelectElement;
  const submit = async () => {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };

  it('starts from the current data', async () => {
    await open(MARKO);

    expect((root.querySelector('#emp-first') as HTMLInputElement).value).toBe('Marko');
    expect(roleSelect().value).toBe('Staff');
    expect(root.querySelector('[aria-pressed=true]')?.textContent).toContain('Konobar');
    expect(root.querySelectorAll('[aria-pressed=true]')).toHaveLength(2);
    expect(root.textContent).toContain('Radi više uloga');
  });

  it('locks the role of the owner and of yourself', async () => {
    await open(OWNER);
    expect(roleSelect().disabled).toBe(true);
    expect(root.textContent).toContain('Ulogu vlasnika ne može niko da menja.');
    TestBed.resetTestingModule();

    await open(ME);
    expect(roleSelect().disabled).toBe(true);
    expect(root.textContent).toContain('Sopstvenu ulogu ne možeš da menjaš.');
  });

  it('lets the role of someone else be changed', async () => {
    await open(ANA);

    expect(roleSelect().disabled).toBe(false);
  });

  it('warns when someone has no position', async () => {
    await open(ME);

    expect(root.textContent).toContain('Bez pozicije se zaposleni ne može rasporediti');
  });

  it('sends the edited name, role and positions', async () => {
    await open(ANA);
    await type(fixture, root, '#emp-first', ' Anica ');
    await type(fixture, root, '#emp-role', 'Manager');
    button(root, 'Kuvar').click();
    await settle(fixture);
    button(root, 'Konobar').click(); // skida konobara
    await settle(fixture);

    await submit();

    const request = http.expectOne('/api/employees/ana');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ firstName: 'Anica', lastName: 'Test', role: 'Manager', positionIds: ['p-cook'] });
    request.flush({ ...ANA, firstName: 'Anica' });
    await tick();
    expect(saved).toHaveLength(1);
  });

  it('shows the server refusal and stays open', async () => {
    await open(ANA);

    await submit();
    http.expectOne('/api/employees/ana').flush({ detail: 'Pozicija nije pronađena.' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(alertText(root)).toContain('Pozicija nije pronađena.');
    expect(saved).toEqual([]);
  });
});

describe('InviteDialog', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<InviteDialog>;
  let root: HTMLElement;
  let created: unknown[];

  beforeEach(async () => {
    http = setup();
    created = [];
    fixture = TestBed.createComponent(InviteDialog);
    fixture.componentRef.setInput('positions', [WAITER, COOK, BAR]);
    fixture.componentInstance.created.subscribe((c) => created.push(c));
    root = fixture.nativeElement as HTMLElement;
    await settle(fixture);
  });

  afterEach(() => http.verify());

  const submit = async () => {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };

  it('offers only employee and manager, never owner', () => {
    const options = Array.from(root.querySelectorAll('#invite-role option')).map((o) => (o as HTMLOptionElement).value);

    expect(options).toEqual(['Staff', 'Manager']);
  });

  it('sends the invitation and shows the link even when the mail went out', async () => {
    await type(fixture, root, '#invite-email', ' nova@demo.rs ');
    await type(fixture, root, '#invite-position', 'p-cook');
    await type(fixture, root, '#invite-role', 'Manager');

    await submit();
    const request = http.expectOne('/api/invitations');
    expect(request.request.body).toEqual({ email: 'nova@demo.rs', role: 'Manager', positionId: 'p-cook' });
    request.flush({ invitation: INVITATION, acceptUrl: 'http://localhost:4200/pozivnica#tok', emailSent: true });
    await settle(fixture);

    expect(root.textContent).toContain('Pozivnica je poslata na');
    expect((root.querySelector('#invite-link') as HTMLInputElement).value).toBe('http://localhost:4200/pozivnica#tok');
    expect(created).toHaveLength(1);
  });

  it('sends no position when none is chosen', async () => {
    await type(fixture, root, '#invite-email', 'nova@demo.rs');

    await submit();

    expect((http.expectOne('/api/invitations').request.body as { positionId: unknown }).positionId).toBeNull();
  });

  it('tells the manager to send the link himself when the mail could not be sent', async () => {
    await type(fixture, root, '#invite-email', 'nova@demo.rs');

    await submit();
    http.expectOne('/api/invitations').flush({ invitation: INVITATION, acceptUrl: 'http://x/pozivnica#tok', emailSent: false });
    await settle(fixture);

    expect(alertText(root)).toContain('Mejl nije mogao da se pošalje');
    expect((root.querySelector('#invite-link') as HTMLInputElement).value).toBe('http://x/pozivnica#tok');
  });

  it('shows the server refusal, e.g. an account that already exists', async () => {
    await type(fixture, root, '#invite-email', 'ana@demo.rs');

    await submit();
    http.expectOne('/api/invitations').flush({ detail: 'Nalog sa ovim emailom već postoji.' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(alertText(root)).toContain('već postoji');
    expect(created).toEqual([]);
  });
});

