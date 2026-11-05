import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../core/auth';
import { ANA, WAITER, shift } from '../../schedule/schedule.fixtures';
import { SwapDialog } from './swap-dialog';

const FUTURE = Date.now() + 3 * 86_400_000;
const at = (offsetHours: number) => new Date(FUTURE + offsetHours * 3_600_000).toISOString();

const MINE = shift({ id: 's-mine', startsAt: at(0), endsAt: at(8) });
const JELENA = shift({ id: 's-jelena', employeeId: 'e-jelena', employeeName: 'Jelena Nikolić', startsAt: at(24), endsAt: at(32) });
const STEFAN = shift({ id: 's-stefan', employeeId: 'e-stefan', employeeName: 'Stefan Ilić', startsAt: at(48), endsAt: at(56) });
const OPEN = shift({ id: 's-open', employeeId: null, employeeName: null, startsAt: at(72), endsAt: at(80) });
const COOK = shift({ id: 's-cook', employeeId: 'e-ivana', employeeName: 'Ivana', positionId: 'p-cook', positionName: 'Kuvar', startsAt: at(24), endsAt: at(32) });

describe('SwapDialog', () => {
  let fixture: ComponentFixture<SwapDialog>;
  let http: HttpTestingController;
  let sent: string[];

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
      employeeId: ANA.id, firstName: 'Ana', lastName: 'Petrović', role: 'Staff', restaurantId: 'r', restaurantName: 'R',
      restaurantTimeZoneId: 'Europe/Belgrade', positions: [WAITER],
    });
    sent = [];

    fixture = TestBed.createComponent(SwapDialog);
    fixture.componentRef.setInput('shift', MINE);
    fixture.componentInstance.sent.subscribe((m) => sent.push(m));
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/schedule' && r.params.get('positionId') === WAITER.id)
      .flush([MINE, JELENA, STEFAN, OPEN, COOK]);
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
    const found = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!found) {
      throw new Error(`Dugme "${text}" ne postoji.`);
    }
    return found as HTMLButtonElement;
  }

  async function choose(selector: string, value: string): Promise<void> {
    const select = root().querySelector(selector) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  it('offers only colleagues\' shifts of the same role, not mine, not open and not other roles', () => {
    const options = Array.from(root().querySelectorAll('#their-shift option')).map((o) => (o as HTMLOptionElement).value);

    expect(options).toEqual(['', 's-jelena', 's-stefan']);
  });

  it('cannot be sent before a shift is chosen', () => {
    expect(button('Pošalji zahtev').disabled).toBe(true);
  });

  it('sends an exchange for the chosen colleague shift', async () => {
    await choose('#their-shift', 's-stefan');
    button('Pošalji zahtev').click();
    await settle();

    const request = http.expectOne('/api/swaps');
    expect(request.request.body).toEqual({ shiftId: 's-mine', targetEmployeeId: null, targetShiftId: 's-stefan', note: null });
    request.flush({});
    await settle();
    expect(sent[0]).toContain('Stefan Ilić');
  });

  it('sends a handover to the chosen colleague without asking for a shift back', async () => {
    button('Prepusti').click();
    await settle();
    expect(Array.from(root().querySelectorAll('#colleague option')).map((o) => (o as HTMLOptionElement).textContent?.trim()))
      .toEqual(['Izaberi kolegu…', 'Jelena Nikolić', 'Stefan Ilić']);

    await choose('#colleague', 'e-jelena');
    button('Pošalji zahtev').click();
    await settle();

    const request = http.expectOne('/api/swaps');
    expect(request.request.body).toEqual({ shiftId: 's-mine', targetEmployeeId: 'e-jelena', targetShiftId: null, note: null });
    request.flush({});
  });

  it('shows the server refusal inside the dialog and stays open', async () => {
    await choose('#their-shift', 's-jelena');
    button('Pošalji zahtev').click();
    await settle();

    http.expectOne('/api/swaps').flush({ detail: 'Za ovu smenu već postoji otvoren zahtev.' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(root().querySelector('[role=alert]')?.textContent).toContain('već postoji otvoren zahtev');
    expect(sent).toEqual([]);
  });
});

