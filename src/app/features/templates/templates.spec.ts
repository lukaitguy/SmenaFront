import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Position, ShiftTemplate } from '../../core/models';
import { TemplatesPage, formatTemplateDuration, templateMinutes } from './templates.page';

const WAITER: Position = { id: 'p-waiter', name: 'Konobar' };
const HOSTESS: Position = { id: 'p-hostess', name: 'Hostesa' };

const template = (id: string, position: Position, name: string, startTime: string, endTime: string): ShiftTemplate => ({
  id, positionId: position.id, positionName: position.name, name, startTime, endTime, endsNextDay: endTime <= startTime,
});
const FIRST = template('t1', WAITER, 'I', '08:00:00', '16:00:00');
const SECOND = template('t2', WAITER, 'II', '16:00:00', '00:00:00');

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('template duration', () => {
  it('counts a shift that ends the next day', () => {
    expect(templateMinutes('08:00', '16:00')).toBe(480);
    expect(templateMinutes('16:00', '00:00')).toBe(480);
    expect(templateMinutes('22:00', '06:00')).toBe(480);
    expect(templateMinutes('08:00:00', '16:30:00')).toBe(510);
  });

  it('formats hours the way the schedule does', () => {
    expect(formatTemplateDuration(480)).toBe('8 h');
    expect(formatTemplateDuration(510)).toBe('8,5 h');
  });
});

describe('TemplatesPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TemplatesPage>;
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TemplatesPage);
    fixture.detectChanges();
    http.expectOne('/api/positions').flush([WAITER, HOSTESS]);
    http.expectOne('/api/shift-templates').flush([SECOND, FIRST]);
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

  const section = (name: string) => root.querySelector(`section[aria-label="${name}"]`) as HTMLElement;

  function click(scope: ParentNode, text: string): void {
    const found = Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim().includes(text));
    if (!found) {
      throw new Error(`Dugme "${text}" ne postoji.`);
    }
    (found as HTMLButtonElement).click();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = root.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  const submit = async () => {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  };

  const alertText = () => root.querySelector('[role=alert]')?.textContent?.trim() ?? '';

  it('groups templates by position in time order and marks the ones that end the next day', () => {
    const waiter = section('Konobar').textContent ?? '';

    expect(waiter.indexOf('08:00–16:00')).toBeGreaterThan(-1);
    expect(waiter.indexOf('08:00–16:00')).toBeLessThan(waiter.indexOf('16:00–00:00'));
    expect(waiter).toContain('8 h · završava se sutradan');
    expect(section('Hostesa').textContent).toContain('Nema šablona');
  });

  it('adds a template to the position', async () => {
    click(section('Hostesa'), '+ Nova smena');
    await settle();
    await type('#tpl-name', ' II ');
    await type('#tpl-start', '16:00');
    await type('#tpl-end', '00:00');
    expect(root.textContent).toContain('Traje 8 h i završava se sutradan');

    await submit();
    const request = http.expectOne('/api/shift-templates');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ positionId: 'p-hostess', name: 'II', startTime: '16:00:00', endTime: '00:00:00' });
    request.flush(template('t3', HOSTESS, 'II', '16:00:00', '00:00:00'));
    await settle();

    expect(section('Hostesa').textContent).toContain('16:00–00:00');
    expect(section('Hostesa').textContent).not.toContain('Nema šablona');
    expect(root.querySelector('form')).toBeNull();
  });

  it('edits a template and says the change only applies to new shifts', async () => {
    click(section('Konobar'), 'Izmeni');
    await settle();
    expect(root.textContent).toContain('važi za nove smene');
    expect((root.querySelector('#tpl-name') as HTMLInputElement).value).toBe('I');
    expect((root.querySelector('#tpl-start') as HTMLInputElement).value).toBe('08:00');
    await type('#tpl-start', '09:00');

    await submit();
    const request = http.expectOne('/api/shift-templates/t1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'I', startTime: '09:00:00', endTime: '16:00:00' });
    request.flush({ ...FIRST, startTime: '09:00:00' });
    await settle();

    expect(section('Konobar').textContent).toContain('09:00–16:00');
    expect(section('Konobar').textContent).toContain('7 h');
  });

  it('refuses an empty name, equal times and too long shifts before calling the server', async () => {
    click(section('Hostesa'), '+ Nova smena');
    await settle();

    await submit();
    expect(alertText()).toContain('Naziv je obavezan');

    await type('#tpl-name', 'III');
    await type('#tpl-end', '08:00'); // početak je 08:00 podrazumevano
    await submit();
    expect(alertText()).toContain('ne mogu biti isti');

    await type('#tpl-start', '06:00');
    await type('#tpl-end', '23:00');
    await submit();
    expect(alertText()).toContain('duže od 16 sati');
    http.expectNone('/api/shift-templates');
  });

  it('shows the server refusal for a duplicate name and keeps the form open', async () => {
    click(section('Konobar'), '+ Nova smena');
    await settle();
    await type('#tpl-name', 'I');

    await submit();
    http.expectOne('/api/shift-templates').flush(
      { detail: 'Ova pozicija već ima smenu sa tim nazivom.' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(alertText()).toContain('već ima smenu');
    expect(root.querySelector('form')).not.toBeNull();
  });

  it('explains what deleting does to existing shifts and only then deletes', async () => {
    click(section('Konobar'), 'Obriši');
    await settle();
    expect(section('Konobar').textContent).toContain('ostaju u rasporedu, samo gube oznaku');
    http.expectNone('/api/shift-templates/t1');

    click(section('Konobar'), 'Da, obriši');
    await settle();
    const request = http.expectOne('/api/shift-templates/t1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(section('Konobar').textContent).not.toContain('08:00–16:00');
    expect(section('Konobar').textContent).toContain('16:00–00:00');
  });

  it('can cancel the form and the deletion', async () => {
    click(section('Hostesa'), '+ Nova smena');
    await settle();
    click(root, 'Otkaži');
    await settle();
    expect(root.querySelector('form')).toBeNull();

    click(section('Konobar'), 'Obriši');
    await settle();
    click(section('Konobar'), 'Ne');
    await settle();
    http.expectNone('/api/shift-templates/t1');
    expect(section('Konobar').textContent).not.toContain('Da, obriši');
  });
});
