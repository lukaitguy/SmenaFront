import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Shift } from '../core/models';
import { ANA, BARTENDER, FIRST, NEMANJA, SECOND, WAITER, shift } from './schedule.fixtures';
import { ShiftDialog } from './shift-dialog';

const TEMPLATES = [FIRST, SECOND];

describe('ShiftDialog', () => {
  let fixture: ComponentFixture<ShiftDialog>;
  let http: HttpTestingController;
  let saved: string[];

  beforeAll(() => {
    // jsdom nema native <dialog> ponašanje.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    saved = [];
  });

  afterEach(() => http.verify());

  async function open(inputs: {
    shift?: Shift | null;
    prefill?: { employeeId: string | null; date: string; custom?: boolean } | null;
  }): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ShiftDialog);
    fixture.componentRef.setInput('shift', inputs.shift ?? null);
    fixture.componentRef.setInput('prefill', inputs.prefill ?? null);
    fixture.componentRef.setInput('employees', [ANA, NEMANJA]);
    fixture.componentRef.setInput('positions', [WAITER, BARTENDER]);
    fixture.componentRef.setInput('templates', TEMPLATES);
    fixture.componentRef.setInput('timeZone', 'Europe/Belgrade');
    fixture.componentInstance.saved.subscribe((message) => saved.push(message));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!found) {
      throw new Error(`Dugme "${text}" ne postoji.`);
    }
    return found as HTMLButtonElement;
  }

  async function submit(root: HTMLElement): Promise<void> {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  async function type(root: HTMLElement, selector: string, value: string): Promise<void> {
    const input = root.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  it('offers the shifts of the position and preselects the first one, without Od/Do fields', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

    expect(button(root, 'I').getAttribute('aria-pressed')).toBe('true');
    expect(button(root, 'II').getAttribute('aria-pressed')).toBe('false');
    expect(root.textContent).toContain('08:00–16:00');
    expect(root.textContent).toContain('16:00–00:00');
    expect(root.querySelector('#start')).toBeNull();
  });

  it('creates a shift from the preselected template', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

    await submit(root);

    const request = http.expectOne('/api/shifts');
    expect(request.request.body).toEqual({
      employeeId: ANA.id,
      positionId: WAITER.id,
      startsAt: '2026-11-05T07:00:00.000Z',
      endsAt: '2026-11-05T15:00:00.000Z',
      note: null,
      templateId: FIRST.id,
    });
    request.flush(shift());
    await settle();
    expect(saved).toEqual(['Smena je dodata.']);
  });

  it('ends the second shift the next day at midnight, restaurant time', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

    button(root, 'II').click();
    await settle();
    await submit(root);

    const request = http.expectOne('/api/shifts');
    expect(request.request.body).toMatchObject({
      startsAt: '2026-11-05T15:00:00.000Z',
      endsAt: '2026-11-05T23:00:00.000Z', // 00:00 6. novembra po lokalnom
      templateId: SECOND.id,
    });
    request.flush(shift());
  });

  it('switches to Od/Do for a custom time and then sends no template', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

    button(root, 'Drugo vreme').click();
    await settle();
    expect(root.querySelector('#start')).not.toBeNull();
    await type(root, '#start', '09:30');
    await type(root, '#end', '17:30');
    await submit(root);

    const request = http.expectOne('/api/shifts');
    expect(request.request.body).toMatchObject({
      startsAt: '2026-11-05T08:30:00.000Z',
      endsAt: '2026-11-05T16:30:00.000Z',
      templateId: null,
    });
    request.flush(shift());
  });

  it('opens straight on Od/Do when asked to (after "Drugo vreme" in quick add)', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05', custom: true } });

    expect(root.querySelector('#start')).not.toBeNull();
    expect(button(root, 'Drugo vreme').getAttribute('aria-pressed')).toBe('true');
  });

  it('goes straight to Od/Do for a position without templates', async () => {
    const root = await open({ prefill: { employeeId: NEMANJA.id, date: '2026-11-05' } });

    expect(root.textContent).toContain('nema unapred definisane smene');
    expect(root.querySelector('#start')).not.toBeNull();
    await submit(root);

    const request = http.expectOne('/api/shifts');
    expect(request.request.body).toMatchObject({ positionId: BARTENDER.id, templateId: null });
    request.flush(shift());
  });

  it('keeps an existing shift on its template when it is opened for editing', async () => {
    const existing = shift({ templateId: SECOND.id, templateName: 'II', startsAt: '2026-11-05T15:00:00+00:00', endsAt: '2026-11-05T23:00:00+00:00' });
    const root = await open({ shift: existing });

    expect(button(root, 'II').getAttribute('aria-pressed')).toBe('true');
    expect(root.textContent).toContain('Izmena smene');
    await submit(root);

    const request = http.expectOne(`/api/shifts/${existing.id}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({ templateId: SECOND.id, startsAt: '2026-11-05T15:00:00.000Z' });
    request.flush(existing);
  });

  it('shows a shift without a template as a custom time and can move it to a template', async () => {
    const existing = shift({ startsAt: '2026-11-05T08:30:00+00:00', endsAt: '2026-11-05T16:30:00+00:00' });
    const root = await open({ shift: existing });

    expect((root.querySelector('#start') as HTMLInputElement).value).toBe('09:30');
    button(root, 'I').click();
    await settle();
    await submit(root);

    const request = http.expectOne(`/api/shifts/${existing.id}`);
    expect(request.request.body).toMatchObject({ templateId: FIRST.id, startsAt: '2026-11-05T07:00:00.000Z' });
    request.flush(existing);
  });

  it('sends the template with a weekly repeat', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

    (root.querySelector('input[name=repeat]') as HTMLInputElement).click();
    await settle();
    await submit(root);

    const request = http.expectOne('/api/shifts/recurring');
    expect(request.request.body).toMatchObject({
      employeeId: ANA.id,
      fromDate: '2026-11-05',
      daysOfWeek: ['Thursday'],
      startTime: '08:00:00',
      endTime: '16:00:00',
      templateId: FIRST.id,
      onConflict: 'Skip',
    });
    request.flush({ seriesId: 'x', created: 4, skipped: ['2026-11-12'], shifts: [] });
    await settle();
    expect(saved[0]).toContain('Napravljeno smena: 4');
    expect(saved[0]).toContain('preskočeno 1');
  });

  it('switches to the first shift of the new position when the employee changes', async () => {
    const root = await open({ prefill: { employeeId: null, date: '2026-11-05' } });
    const employee = root.querySelector('#employee') as HTMLSelectElement;

    employee.value = NEMANJA.id;
    employee.dispatchEvent(new Event('change'));
    await settle();

    expect(root.textContent).toContain('nema unapred definisane smene');
    expect((root.querySelector('#position') as HTMLSelectElement).value).toContain(BARTENDER.id);
  });

  it('shows the API error and stays open', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

    await submit(root);
    http.expectOne('/api/shifts').flush(
      { title: 'Conflict', detail: 'Zaposleni već ima smenu u tom periodu.', code: 'shifts.overlap' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(root.querySelector('[role=alert]')?.textContent).toContain('već ima smenu');
    expect(saved).toEqual([]);
  });

  it('deletes a shift only after confirmation', async () => {
    const existing = shift();
    const root = await open({ shift: existing });

    button(root, 'Obriši').click();
    await settle();
    http.expectNone(`/api/shifts/${existing.id}`);
    expect(root.textContent).toContain('Obrisati ovu smenu?');

    button(root, 'Da, obriši').click();
    await settle();
    const request = http.expectOne(`/api/shifts/${existing.id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(saved).toEqual(['Smena je obrisana.']);
  });
});
