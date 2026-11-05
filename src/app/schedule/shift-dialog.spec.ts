import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Shift, Wish } from '../core/models';
import { ANA, BARTENDER, BARTENDER_FIRST, BARTENDER_SECOND, FIRST, MARKO, NEMANJA, SECOND, WAITER, shift } from './schedule.fixtures';
import { ShiftDialog } from './shift-dialog';

const WISH_I: Wish = {
  id: 'w1', employeeId: ANA.id, employeeName: 'Ana', date: '2026-11-05', preferredShift: 'I', createdAt: '2026-11-01T00:00:00Z',
};

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
    templates?: typeof TEMPLATES;
    defaultPositionId?: string | null;
    wishes?: Wish[];
  }): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ShiftDialog);
    fixture.componentRef.setInput('shift', inputs.shift ?? null);
    fixture.componentRef.setInput('prefill', inputs.prefill ?? null);
    fixture.componentRef.setInput('employees', [ANA, NEMANJA, MARKO]);
    fixture.componentRef.setInput('positions', [WAITER, BARTENDER]);
    fixture.componentRef.setInput('templates', inputs.templates ?? TEMPLATES);
    fixture.componentRef.setInput('timeZone', 'Europe/Belgrade');
    fixture.componentRef.setInput('defaultPositionId', inputs.defaultPositionId ?? null);
    fixture.componentRef.setInput('preferences', { wishes: inputs.wishes ?? [], pendingDayOffs: [] });
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

  it('warns when the employee wished another shift, and the button then says it is deliberate', async () => {
    const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' }, wishes: [WISH_I] });
    expect(root.querySelector('[role=alert]')).toBeNull(); // I je upravo ono što je tražila

    button(root, 'II').click();
    await settle();

    expect(root.querySelector('[role=alert]')?.textContent).toContain('Da li ste sigurni');
    expect(button(root, 'Ipak postavi')).toBeTruthy();

    // Upozorenje ne blokira: potvrda je upis.
    await submit(root);
    http.expectOne('/api/shifts').flush(shift());
  });

  it('does not warn for an open shift', async () => {
    const root = await open({ prefill: { employeeId: null, date: '2026-11-05' }, wishes: [WISH_I] });

    expect(root.querySelector('[role=alert]')).toBeNull();
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

  describe('who can be picked for the chosen position', () => {
    const employeeOptions = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('#employee option')).map((o) => o.textContent?.trim());

    async function pickPosition(root: HTMLElement, positionId: string): Promise<void> {
      const select = root.querySelector('#position') as HTMLSelectElement;
      select.value = Array.from(select.options).find((o) => o.value.includes(positionId))!.value;
      select.dispatchEvent(new Event('change'));
      await settle();
    }

    async function pickEmployee(root: HTMLElement, employeeId: string): Promise<void> {
      const select = root.querySelector('#employee') as HTMLSelectElement;
      select.value = Array.from(select.options).find((o) => o.value.includes(employeeId))!.value;
      select.dispatchEvent(new Event('change'));
      await settle();
    }

    it('offers only the people who have the position, and the open shift', async () => {
      const root = await open({ prefill: { employeeId: null, date: '2026-11-05' } });

      expect(employeeOptions(root)).toEqual(['Otvorena smena', 'Ana Petrović', 'Marko Jovanović (Konobar/Šanker)']);
    });

    it('changes the list when another position is chosen', async () => {
      const root = await open({ prefill: { employeeId: null, date: '2026-11-05' } });

      await pickPosition(root, BARTENDER.id);

      expect(employeeOptions(root)).toEqual(['Otvorena smena', 'Nemanja Popović', 'Marko Jovanović (Konobar/Šanker)']);
    });

    it('starts on the position from the active filter', async () => {
      const root = await open({ prefill: { employeeId: null, date: '2026-11-05' }, defaultPositionId: BARTENDER.id });

      expect(employeeOptions(root)).not.toContain('Ana Petrović');
      expect(employeeOptions(root)).toContain('Nemanja Popović');
    });

    it('assigns an open shift to someone with that position', async () => {
      const open1 = shift({ employeeId: null, employeeName: null });
      const root = await open({ shift: open1 });

      expect(employeeOptions(root)).not.toContain('Nemanja Popović');
      await pickEmployee(root, ANA.id);
      await submit(root);

      const request = http.expectOne(`/api/shifts/${open1.id}`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toMatchObject({ employeeId: ANA.id, positionId: WAITER.id });
      request.flush(shift());
    });

    it('lets go of the chosen person when the position changes to one they do not have', async () => {
      const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' } });

      await pickPosition(root, BARTENDER.id);

      expect((root.querySelector('#employee') as HTMLSelectElement).value).toBe('');
      expect(root.querySelector('[role=status]')?.textContent).toContain('Ana Petrović nema ovu poziciju');
      await submit(root);
      const request = http.expectOne('/api/shifts');
      expect(request.request.body).toMatchObject({ employeeId: null, positionId: BARTENDER.id });
      request.flush(shift());
    });

    it('keeps someone who works both roles when switching between them', async () => {
      const root = await open({ prefill: { employeeId: MARKO.id, date: '2026-11-05' } });

      await pickPosition(root, BARTENDER.id);

      expect((root.querySelector('#employee') as HTMLSelectElement).value).toContain(MARKO.id);
      expect(root.querySelector('[role=status]')).toBeNull();
    });

    it('keeps the current assignee in the list when editing, even without the position', async () => {
      const existing = shift({ employeeId: NEMANJA.id, employeeName: 'Nemanja Popović' });   // konobarska smena, a on je šanker
      const root = await open({ shift: existing });

      expect(employeeOptions(root)).toContain('Nemanja Popović');
      expect((root.querySelector('#employee') as HTMLSelectElement).value).toContain(NEMANJA.id);
    });
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

  describe('someone who works two roles', () => {
    const ALL_TEMPLATES = [FIRST, SECOND, BARTENDER_FIRST, BARTENDER_SECOND];

    async function pickPosition(root: HTMLElement, positionId: string): Promise<void> {
      const select = root.querySelector('#position') as HTMLSelectElement;
      select.value = Array.from(select.options).find((o) => o.value.includes(positionId))!.value;
      select.dispatchEvent(new Event('change'));
      await settle();
    }

    it('shows both roles next to the name and asks as which one they work', async () => {
      const root = await open({ prefill: { employeeId: MARKO.id, date: '2026-11-05' }, templates: ALL_TEMPLATES });

      const options = Array.from(root.querySelectorAll('#employee option')).map((o) => o.textContent?.trim());
      expect(options).toContain('Marko Jovanović (Konobar/Šanker)');
      expect(options).toContain('Ana Petrović');
      expect(root.querySelector('label[for=position]')?.textContent).toContain('Radi kao');
      expect(Array.from(root.querySelectorAll('#position option')).map((o) => o.textContent?.trim())).toEqual(['Konobar', 'Šanker']);
    });

    it('keeps the plain "Pozicija" label for someone with one role', async () => {
      const root = await open({ prefill: { employeeId: ANA.id, date: '2026-11-05' }, templates: ALL_TEMPLATES });

      expect(root.querySelector('label[for=position]')?.textContent).toContain('Pozicija');
    });

    it('works that day as a bartender with the bartender shifts', async () => {
      const root = await open({ prefill: { employeeId: MARKO.id, date: '2026-11-05' }, templates: ALL_TEMPLATES });
      expect(button(root, 'I').getAttribute('aria-pressed')).toBe('true'); // konobarska I

      await pickPosition(root, BARTENDER.id);
      await submit(root);

      const request = http.expectOne('/api/shifts');
      expect(request.request.body).toMatchObject({
        employeeId: MARKO.id,
        positionId: BARTENDER.id,
        templateId: BARTENDER_FIRST.id,
        startsAt: '2026-11-05T07:00:00.000Z',
      });
      request.flush(shift());
    });

    it('can pick the second bartender shift, which ends the next day at midnight', async () => {
      const root = await open({ prefill: { employeeId: MARKO.id, date: '2026-11-05' }, templates: ALL_TEMPLATES });

      await pickPosition(root, BARTENDER.id);
      button(root, 'II').click();
      await settle();
      await submit(root);

      const request = http.expectOne('/api/shifts');
      expect(request.request.body).toMatchObject({
        positionId: BARTENDER.id,
        templateId: BARTENDER_SECOND.id,
        endsAt: '2026-11-05T23:00:00.000Z',
      });
      request.flush(shift());
    });

    it('never offers the other role template for the chosen role', async () => {
      const root = await open({ prefill: { employeeId: MARKO.id, date: '2026-11-05' }, templates: ALL_TEMPLATES });

      await pickPosition(root, BARTENDER.id);
      button(root, 'II').click();
      await pickPosition(root, WAITER.id);
      await submit(root);

      const request = http.expectOne('/api/shifts');
      expect(request.request.body).toMatchObject({ positionId: WAITER.id, templateId: FIRST.id });
      request.flush(shift());
    });
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
