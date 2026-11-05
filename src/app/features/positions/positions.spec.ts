import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Employee, Position } from '../../core/models';
import { PositionsPage } from './positions.page';

const WAITER: Position = { id: 'p-waiter', name: 'Konobar' };
const COOK: Position = { id: 'p-cook', name: 'Kuvar' };
const BARISTA: Position = { id: 'p-barista', name: 'Barista' };

const person = (id: string, positions: Position[], status: Employee['status'] = 'Active'): Employee => ({
  id, firstName: id, lastName: 'T', role: 'Staff', status, positions,
});
const EMPLOYEES = [
  person('ana', [WAITER]), person('jelena', [WAITER]), person('marko', [WAITER, COOK]), person('gone', [WAITER], 'Inactive'),
];

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('PositionsPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PositionsPage>;
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PositionsPage);
    fixture.detectChanges();
    http.expectOne('/api/positions').flush([WAITER, COOK, BARISTA]);
    http.expectOne('/api/employees').flush(EMPLOYEES);
    root = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const rowOf = (name: string) =>
    Array.from(root.querySelectorAll('ul > li')).find((li) => li.querySelector('span')?.textContent?.trim() === name) as HTMLElement;

  function click(scope: ParentNode, text: string): void {
    const found = Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim().includes(text));
    if (!found) {
      throw new Error(`Dugme "${text}" ne postoji.`);
    }
    (found as HTMLButtonElement).click();
  }

  async function type(selector: string, value: string, scope: ParentNode = root): Promise<void> {
    const input = scope.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  const alertText = (scope: ParentNode = root) => scope.querySelector('[role=alert]')?.textContent?.trim() ?? '';

  it('lists positions alphabetically with the number of active employees', () => {
    const names = Array.from(root.querySelectorAll('ul > li > div > span:first-child')).map((s) => s.textContent?.trim());

    expect(names).toEqual(['Barista', 'Konobar', 'Kuvar']);
    expect(rowOf('Konobar').textContent).toContain('3 zaposlenih');   // neaktivni se ne broje
    expect(rowOf('Kuvar').textContent).toContain('1 zaposleni');
    expect(rowOf('Kuvar').textContent).toContain('odeljak 86 liste');
    expect(rowOf('Barista').textContent).toContain('0 zaposlenih');
  });

  it('adds a position and keeps the list sorted', async () => {
    await type('input[name=new]', '  Domaćin ');

    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    const request = http.expectOne('/api/positions');
    expect(request.request.body).toEqual({ name: 'Domaćin' });
    request.flush({ id: 'p-new', name: 'Domaćin' });
    await settle();

    expect(Array.from(root.querySelectorAll('ul > li > div > span:first-child')).map((s) => s.textContent?.trim()))
      .toEqual(['Barista', 'Domaćin', 'Konobar', 'Kuvar']);
    expect((root.querySelector('input[name=new]') as HTMLInputElement).value).toBe('');
  });

  it('shows the server refusal for a duplicate name under the field', async () => {
    await type('input[name=new]', 'Konobar');

    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    http.expectOne('/api/positions').flush({ detail: 'Pozicija sa ovim imenom već postoji.' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(alertText()).toContain('već postoji');
  });

  it('renames a position', async () => {
    const row = rowOf('Barista');
    click(row, 'Preimenuj');
    await settle();
    await type('input[name=rename]', 'Glavni barista', row);

    row.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    const request = http.expectOne('/api/positions/p-barista');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Glavni barista' });
    request.flush({ id: 'p-barista', name: 'Glavni barista' });
    await settle();

    expect(rowOf('Glavni barista')).toBeTruthy();
  });

  it('warns that the 86 list depends on the name of Kuvar and asks to confirm the rename', async () => {
    const row = rowOf('Kuvar');
    click(row, 'Preimenuj');
    await settle();

    expect(row.textContent).toContain('koristi 86 lista');
    expect(row.textContent).toContain('Kuhinja nestaje');
    expect(row.textContent).toContain('Sačuvaj');

    await type('input[name=rename]', 'Kuhar', row);
    expect(row.textContent).toContain('Ipak preimenuj');
  });

  it('closes the editor without calling the server when the name did not change', async () => {
    const row = rowOf('Barista');
    click(row, 'Preimenuj');
    await settle();

    row.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();

    http.expectNone('/api/positions/p-barista');
    expect(row.querySelector('form')).toBeNull();
    expect(rowOf('Barista')).toBeTruthy();
  });

  it('explains what deleting does and only then deletes', async () => {
    click(rowOf('Konobar'), 'Obriši');
    await settle();

    expect(rowOf('Konobar').textContent).toContain('skida se sa 4 zaposlenih');
    expect(rowOf('Konobar').textContent).toContain('brišu se njeni šabloni smena');
    http.expectNone('/api/positions/p-waiter');

    click(rowOf('Konobar'), 'Da, obriši');
    await settle();
    const request = http.expectOne('/api/positions/p-waiter');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(rowOf('Konobar')).toBeUndefined();
  });

  it('keeps a position that is used in shifts and shows why', async () => {
    click(rowOf('Kuvar'), 'Obriši');
    await settle();
    expect(rowOf('Kuvar').textContent).toContain('briše se odeljak 86 liste');

    click(rowOf('Kuvar'), 'Da, obriši');
    await settle();
    http.expectOne('/api/positions/p-cook').flush(
      { detail: 'Pozicija se koristi u smenama i ne može se obrisati.' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(alertText(rowOf('Kuvar'))).toContain('koristi u smenama');
    expect(rowOf('Kuvar')).toBeTruthy();
  });

  it('can cancel a deletion', async () => {
    click(rowOf('Barista'), 'Obriši');
    await settle();

    click(rowOf('Barista'), 'Ne');
    await settle();

    http.expectNone('/api/positions/p-barista');
    expect(rowOf('Barista').textContent).not.toContain('Da, obriši');
  });
});
