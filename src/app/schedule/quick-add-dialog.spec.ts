import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FIRST, SECOND, WAITER, shift } from './schedule.fixtures';
import { QuickAddDialog, QuickGroup } from './quick-add-dialog';

const GROUPS: QuickGroup[] = [{ position: WAITER, templates: [FIRST, SECOND] }];

describe('QuickAddDialog', () => {
  let fixture: ComponentFixture<QuickAddDialog>;
  let http: HttpTestingController;
  let created: string[];
  let others: number;

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
    created = [];
    others = 0;

    fixture = TestBed.createComponent(QuickAddDialog);
    fixture.componentRef.setInput('who', 'Ana Petrović');
    fixture.componentRef.setInput('date', '2026-11-05');
    fixture.componentRef.setInput('employeeId', 'e-ana');
    fixture.componentRef.setInput('groups', GROUPS);
    fixture.componentRef.setInput('timeZone', 'Europe/Belgrade');
    fixture.componentInstance.created.subscribe((message) => created.push(message));
    fixture.componentInstance.other.subscribe(() => others++);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  function button(text: string): HTMLButtonElement {
    const found = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!found) {
      throw new Error(`Dugme "${text}" ne postoji.`);
    }
    return found as HTMLButtonElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows who and which day, and one button per shift of the position', () => {
    expect(root().textContent).toContain('Ana Petrović');
    expect(root().textContent).toContain('Četvrtak, 5. novembar');
    expect(root().textContent).toContain('08:00–16:00');
    expect(root().textContent).toContain('16:00–00:00');
  });

  it('creates the shift with one click on the template', async () => {
    button('II').click();

    const request = http.expectOne('/api/shifts');
    expect(request.request.body).toEqual({
      employeeId: 'e-ana',
      positionId: WAITER.id,
      startsAt: '2026-11-05T15:00:00.000Z',
      endsAt: '2026-11-05T23:00:00.000Z',
      note: null,
      templateId: SECOND.id,
    });
    request.flush(shift());
    await settle();
    expect(created).toEqual(['Dodata smena II: Ana Petrović.']);
  });

  it('creates an open shift when there is no employee', async () => {
    fixture.componentRef.setInput('employeeId', null);
    await settle();

    button('I').click();

    const request = http.expectOne('/api/shifts');
    expect(request.request.body).toMatchObject({ employeeId: null, templateId: FIRST.id });
    request.flush(shift({ employeeId: null }));
  });

  it('keeps the dialog open and shows the reason when the shift is refused', async () => {
    button('I').click();
    http.expectOne('/api/shifts').flush(
      { title: 'Conflict', detail: 'Zaposleni ima odobren slobodan dan 05.11.2026.', code: 'shifts.day_off' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(root().querySelector('[role=alert]')?.textContent).toContain('slobodan dan');
    expect(created).toEqual([]);
  });

  it('hands over to the full dialog for another time', () => {
    button('Drugo vreme').click();

    expect(others).toBe(1);
    http.expectNone('/api/shifts');
  });

  it('labels the sections by position when the employee has several', async () => {
    fixture.componentRef.setInput('groups', [
      ...GROUPS,
      { position: { id: 'p-cook', name: 'Kuvar' }, templates: [{ ...FIRST, id: 't-cook', positionId: 'p-cook', positionName: 'Kuvar' }] },
    ]);
    await settle();

    expect(root().textContent).toContain('Konobar');
    expect(root().textContent).toContain('Kuvar');
  });
});
