import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../core/auth';
import { CurrentUser, EightySixItem, Position } from '../../core/models';
import { EightySixPage } from './eighty-six.page';

const KITCHEN: Position = { id: 'p-cook', name: 'Kuvar' };
const BAR: Position = { id: 'p-bar', name: 'Šanker' };
const WAITER: Position = { id: 'p-waiter', name: 'Konobar' };

const item = (overrides: Partial<EightySixItem>): EightySixItem => ({
  id: 'i-1', positionId: KITCHEN.id, positionName: 'Kuvar', name: 'Pljeskavica', note: null,
  createdByEmployeeId: 'e-1', createdByName: 'Milan Đorđević', createdAt: new Date().toISOString(), ...overrides,
});

/** Pušta da se završe Promise-i iz firstValueFrom/Promise.all pre nego što se proveri ekran. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('EightySixPage', () => {
  let fixture: ComponentFixture<EightySixPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(role: CurrentUser['role'], positions: Position[]): Promise<HTMLElement> {
    TestBed.inject(AuthService).user.set({
      employeeId: 'me', firstName: 'A', lastName: 'B', role, restaurantId: 'r', restaurantName: 'R',
      restaurantTimeZoneId: 'Europe/Belgrade', positions,
    });
    fixture = TestBed.createComponent(EightySixPage);
    fixture.detectChanges();
    http.expectOne('/api/positions').flush([KITCHEN, BAR, WAITER]);
    http.expectOne('/api/eighty-six').flush([item({}), item({ id: 'i-2', positionId: BAR.id, positionName: 'Šanker', name: 'Heineken' })]);
    await tick();
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const sections = (root: HTMLElement) => Array.from(root.querySelectorAll('section'));

  it('shows both sections with their items to everyone', async () => {
    const root = await open('Staff', [WAITER]);

    expect(sections(root).map((s) => s.querySelector('h2')?.textContent?.trim())).toEqual(['Kuhinja 1', 'Šank 1']);
    expect(root.textContent).toContain('Pljeskavica');
    expect(root.textContent).toContain('Heineken');
    expect(root.textContent).toContain('Milan Đorđević');
  });

  it('gives a waiter no way to edit', async () => {
    const root = await open('Staff', [WAITER]);

    expect(root.querySelector('form')).toBeNull();
    expect(root.textContent).not.toContain('Vratilo se');
  });

  it('lets a cook edit only the kitchen section', async () => {
    const root = await open('Staff', [KITCHEN]);
    const [kitchen, bar] = sections(root);

    expect(kitchen.querySelector('form')).not.toBeNull();
    expect(kitchen.textContent).toContain('Vratilo se');
    expect(bar.querySelector('form')).toBeNull();
    expect(bar.textContent).not.toContain('Vratilo se');
  });

  it('lets a manager edit both sections', async () => {
    const root = await open('Manager', []);

    expect(root.querySelectorAll('form')).toHaveLength(2);
  });

  it('adds an item to the section and reloads the list', async () => {
    const root = await open('Staff', [KITCHEN]);
    const input = sections(root)[0].querySelector('input') as HTMLInputElement;
    input.value = '  Limun ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    fixture.detectChanges();

    sections(root)[0].querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne('/api/eighty-six');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ positionId: KITCHEN.id, name: 'Limun', note: null });
    request.flush(item({ id: 'i-3', name: 'Limun' }));
    await tick();
    fixture.detectChanges();
    http.expectOne('/api/eighty-six').flush([item({}), item({ id: 'i-3', name: 'Limun' })]);
    await tick();
    fixture.detectChanges();
    fixture.detectChanges();

    expect(root.textContent).toContain('Limun');
  });

  it('removes an item when it is back in stock', async () => {
    const root = await open('Staff', [KITCHEN]);

    (Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Vratilo se')) as HTMLButtonElement).click();
    fixture.detectChanges();

    const request = http.expectOne('/api/eighty-six/i-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await tick();
    fixture.detectChanges();
    http.expectOne('/api/eighty-six').flush([item({ id: 'i-2', positionId: BAR.id, positionName: 'Šanker', name: 'Heineken' })]);
    await tick();
    fixture.detectChanges();
    fixture.detectChanges();

    expect(root.textContent).not.toContain('Pljeskavica');
  });
});
