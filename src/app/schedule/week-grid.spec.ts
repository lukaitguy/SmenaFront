import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Shift } from '../core/models';
import { weekDays } from '../core/time';
import { ANA, FIRST, SECOND, shift } from './schedule.fixtures';
import { GridRow, WeekGrid } from './week-grid';

const ROWS: GridRow[] = [
  { id: ANA.id, label: 'Ana Petrović', hint: 'Konobar' },
  { id: null, label: 'Otvorene smene' },
];

describe('WeekGrid', () => {
  let fixture: ComponentFixture<WeekGrid>;

  function render(shifts: Shift[], editable = false): HTMLElement {
    fixture.componentRef.setInput('days', weekDays('2026-11-02'));
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('shifts', shifts);
    fixture.componentRef.setInput('timeZone', 'Europe/Belgrade');
    fixture.componentRef.setInput('today', '2026-11-04');
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Kolona (0 = ponedeljak) u kojoj se nalazi dugme smene u prvom redu. */
  function columnOf(root: HTMLElement, label: string): number {
    const cells = Array.from(root.querySelectorAll('.group')).slice(0, 7);
    return cells.findIndex((cell) => cell.querySelector(`button[aria-label^="${label}"]`));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(WeekGrid);
  });

  it('shows the template name for a shift made from a template, with the time next to it', () => {
    const root = render([shift({ templateId: FIRST.id, templateName: 'I' })]);

    const chip = root.querySelector('button[aria-label^="I smena"]')!;
    expect(chip.textContent).toContain('I');
    expect(chip.textContent).toContain('08:00–16:00');
  });

  it('shows only the time for a custom shift', () => {
    const root = render([shift({ startsAt: '2026-11-02T08:30:00+00:00', endsAt: '2026-11-02T16:30:00+00:00' })]);

    const chip = root.querySelector('button[aria-label="09:30 do 17:30, Konobar"]')!;
    expect(chip.textContent).toContain('09:30–17:30');
    expect(root.querySelector('button[aria-label*="smena,"]')).toBeNull();
  });

  it('does not show +1 for a shift that ends exactly at midnight, but does for one that ends later', () => {
    const second = shift({
      id: 's-2',
      templateId: SECOND.id,
      templateName: 'II',
      startsAt: '2026-11-02T15:00:00+00:00',
      endsAt: '2026-11-02T23:00:00+00:00', // 16:00-00:00 lokalno
    });
    const late = shift({
      id: 's-3',
      startsAt: '2026-11-03T16:00:00+00:00',
      endsAt: '2026-11-04T00:00:00+00:00', // 17:00-01:00 lokalno
    });
    const root = render([second, late]);

    expect(root.querySelector('button[aria-label^="II smena"]')!.querySelector('sup')).toBeNull();
    expect(root.querySelector('button[aria-label="17:00 do 01:00, Konobar"]')!.querySelector('sup')?.textContent).toBe('+1');
  });

  it('places a shift on the day it starts in the restaurant zone, not in UTC', () => {
    // 23:30 UTC je već utorak, 00:30, u Beogradu
    const root = render([shift({ startsAt: '2026-11-02T23:30:00+00:00', endsAt: '2026-11-03T07:30:00+00:00' })]);

    expect(columnOf(root, '00:30')).toBe(1);
  });

  it('marks drafts only for the manager', () => {
    const draft = shift({ publishedAt: null });

    expect(render([draft], true).textContent).toContain('nacrt');
    fixture = TestBed.createComponent(WeekGrid);
    expect(render([draft], false).textContent).not.toContain('nacrt');
  });

  it('puts open shifts in the open row', () => {
    const root = render([shift({ employeeId: null, employeeName: null })]);

    const openRowCells = Array.from(root.querySelectorAll('.group')).slice(7, 14);
    expect(openRowCells.some((cell) => cell.querySelector('button[aria-label]'))).toBe(true);
    expect(Array.from(root.querySelectorAll('.group')).slice(0, 7).some((cell) => cell.querySelector('button[aria-label*=" do "]'))).toBe(false);
  });

  it('offers adding a shift only when editable, with the employee and the day', () => {
    const emitted: unknown[] = [];
    expect(render([], false).querySelector('button[aria-label^="Dodaj smenu"]')).toBeNull();

    fixture = TestBed.createComponent(WeekGrid);
    const root = render([], true);
    fixture.componentInstance.addShift.subscribe((value) => emitted.push(value));
    (root.querySelectorAll('button[aria-label^="Dodaj smenu: Ana"]')[2] as HTMLButtonElement).click();

    expect(emitted).toEqual([{ employeeId: ANA.id, date: '2026-11-04' }]);
  });

  it('emits the shift when its chip is clicked', () => {
    const clicked: Shift[] = [];
    const original = shift({ templateId: FIRST.id, templateName: 'I' });
    const root = render([original]);
    fixture.componentInstance.openShift.subscribe((s) => clicked.push(s));

    (root.querySelector('button[aria-label^="I smena"]') as HTMLButtonElement).click();

    expect(clicked).toEqual([original]);
  });
});
