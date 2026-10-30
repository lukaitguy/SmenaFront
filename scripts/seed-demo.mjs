#!/usr/bin/env node
/**
 * Pravi demo restoran kroz API: vlasnika, menadžera, zaposlene po pozicijama, raspored za ovu i sledeću
 * nedelju (ova nedelja objavljena osim hostesa, sledeća kao nacrt) i par otvorenih smena.
 * Smene se prave po šablonima pozicija (I, II), a jedna je vanredna sa drugim vremenom (Od-Do).
 *
 * Pokretanje (backend mora da radi):   npm run seed
 * Zameni postojeće demo smene:         npm run seed -- --reset
 * Drugi API:                           API_URL=http://localhost:8080 npm run seed
 *
 * Svi nalozi imaju lozinku "lozinka123". Bez --reset skripta je idempotentna: ako demo restoran već ima
 * zaposlene, samo ispiše naloge.
 */
import { addDays, localToUtc, todayIn, weekStart } from '../src/app/core/time.ts';

const API = process.env.API_URL ?? 'http://localhost:5287';
const TIME_ZONE = 'Europe/Belgrade';
const PASSWORD = 'lozinka123';
const RESET = process.argv.includes('--reset');
const OWNER = { email: 'vlasnik@demo.rs', firstName: 'Marija', lastName: 'Vlasnik' };

/**
 * Radni dani: 1 = ponedeljak ... 7 = nedelja. `template` je naziv smene pozicije ("I" ili "II"); šanker nema
 * šablone, pa ima proizvoljno vreme (from, to).
 */
const STAFF = [
  { email: 'nikola@demo.rs', firstName: 'Nikola', lastName: 'Lazić', role: 'Manager', position: null },
  { email: 'ana@demo.rs', firstName: 'Ana', lastName: 'Petrović', position: 'Konobar', days: [1, 2, 3, 5, 6], template: 'I' },
  { email: 'marko@demo.rs', firstName: 'Marko', lastName: 'Jovanović', position: 'Konobar', days: [2, 4, 5, 6, 7], template: 'II' },
  { email: 'jelena@demo.rs', firstName: 'Jelena', lastName: 'Nikolić', position: 'Konobar', days: [1, 3, 4, 6, 7], template: 'II' },
  { email: 'stefan@demo.rs', firstName: 'Stefan', lastName: 'Ilić', position: 'Konobar', days: [1, 2, 4, 5, 7], template: 'I' },
  { email: 'nemanja@demo.rs', firstName: 'Nemanja', lastName: 'Popović', position: 'Šanker', days: [3, 4, 5, 6, 7], from: '17:00', to: '01:00' },
  { email: 'milan@demo.rs', firstName: 'Milan', lastName: 'Đorđević', position: 'Kuvar', days: [1, 2, 3, 4, 5], template: 'I' },
  { email: 'ivana@demo.rs', firstName: 'Ivana', lastName: 'Stojanović', position: 'Kuvar', days: [3, 4, 5, 6, 7], template: 'II' },
  { email: 'teodora@demo.rs', firstName: 'Teodora', lastName: 'Marković', position: 'Hostesa', days: [4, 5, 6, 7], template: 'II' },
];

/** Vanredne smene sa proizvoljnim vremenom: [e-mail, nedelja (0 = ova), radni dan, od, do, napomena]. */
const EXTRAS = [['stefan@demo.rs', 0, 6, '10:00', '18:00', 'Vanredno: priprema za događaj']];

/** Otvorene smene: [nedelja (0 = ova), radni dan, pozicija, šablon ili null, od, do]. */
const OPEN_SHIFTS = [
  [0, 5, 'Konobar', 'II', null, null],
  [0, 6, 'Šanker', null, '17:00', '01:00'],
  [1, 6, 'Konobar', 'II', null, null],
  [1, 7, 'Kuvar', 'I', null, null],
];

async function call(method, path, { token, body } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after') ?? 5);
      console.log(`  ograničenje broja zahteva, čekam ${wait}s…`);
      await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
      continue;
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text; // npr. "Healthy" sa /health
      }
    }
    return { status: response.status, data };
  }
  throw new Error(`${method} ${path}: previše pokušaja (429)`);
}

async function ok(method, path, options) {
  const result = await call(method, path, options);
  if (result.status >= 400) {
    throw new Error(`${method} ${path} -> ${result.status} ${JSON.stringify(result.data)}`);
  }
  return result.data;
}

function printAccounts() {
  console.log('\nDemo nalozi (lozinka za sve: ' + PASSWORD + '):');
  console.log(`  vlasnik   ${OWNER.email}`);
  for (const person of STAFF) {
    console.log(`  ${(person.role === 'Manager' ? 'menadžer' : (person.position ?? '').toLowerCase()).padEnd(9)} ${person.email}`);
  }
}

async function main() {
  try {
    const health = await call('GET', '/health');
    if (health.status !== 200) {
      throw new Error('health');
    }
  } catch {
    throw new Error(`API nije dostupan na ${API}. Pokreni backend (dotnet run) pa probaj ponovo.`);
  }

  let session = await call('POST', '/api/auth/login', { body: { email: OWNER.email, password: PASSWORD } });
  if (session.status !== 200) {
    console.log('Pravim demo restoran…');
    session = await call('POST', '/api/auth/register', {
      body: { restaurantName: 'Bistro Demo', firstName: OWNER.firstName, lastName: OWNER.lastName, email: OWNER.email, password: PASSWORD },
    });
    if (session.status !== 200) {
      throw new Error(`Registracija nije uspela: ${session.status} ${JSON.stringify(session.data)}`);
    }
  }
  const token = session.data.accessToken;

  const existing = await ok('GET', '/api/employees', { token });
  const fresh = existing.length <= 1;
  if (!fresh && !RESET) {
    console.log('Demo restoran već ima zaposlene, ništa se ne menja. Za nove smene: npm run seed -- --reset');
    printAccounts();
    return;
  }

  const positions = new Map((await ok('GET', '/api/positions', { token })).map((p) => [p.name, p.id]));
  const templates = new Map(
    (await ok('GET', '/api/shift-templates', { token })).map((t) => [`${t.positionName}|${t.name}`, t]),
  );

  if (fresh) {
    console.log('Dodajem zaposlene…');
    for (const person of STAFF) {
      const invitation = await ok('POST', '/api/invitations', { token, body: { email: person.email, role: person.role ?? 'Staff' } });
      const inviteToken = decodeURIComponent(invitation.acceptUrl.split('#')[1]);
      await ok('POST', '/api/invitations/accept', {
        body: { token: inviteToken, firstName: person.firstName, lastName: person.lastName, password: PASSWORD },
      });
    }
  }

  const employees = await ok('GET', '/api/employees', { token });
  const byName = new Map(employees.map((e) => [`${e.firstName} ${e.lastName}`, e]));
  for (const person of STAFF.filter((p) => p.position)) {
    const employee = byName.get(`${person.firstName} ${person.lastName}`);
    if (!employee) {
      throw new Error(`Zaposleni ${person.firstName} ${person.lastName} ne postoji. Obriši demo restoran ili ga napravi iznova.`);
    }
    person.id = employee.id;
    if (fresh) {
      await ok('PUT', `/api/employees/${employee.id}`, {
        token,
        body: { firstName: employee.firstName, lastName: employee.lastName, role: employee.role, positionIds: [positions.get(person.position)] },
      });
    }
  }

  const thisWeek = weekStart(todayIn(TIME_ZONE));

  if (RESET && !fresh) {
    console.log('Brišem postojeće smene…');
    const range = `from=${encodeURIComponent(localToUtc(addDays(thisWeek, -14), '00:00', TIME_ZONE).toISOString())}&to=${encodeURIComponent(localToUtc(addDays(thisWeek, 35), '00:00', TIME_ZONE).toISOString())}`;
    const old = await ok('GET', `/api/shifts?${range}`, { token });
    for (const shift of old) {
      await ok('DELETE', `/api/shifts/${shift.id}`, { token });
    }
    console.log(`  obrisano: ${old.length}`);
  }

  console.log('Pravim raspored…');
  let created = 0;

  /** Smena po šablonu ("I"/"II") ili sa proizvoljnim vremenom (od, do). */
  const shiftBody = (employeeId, positionName, date, { template, from, to, note = null }) => {
    const source = template ? templates.get(`${positionName}|${template}`) : null;
    if (template && !source) {
      throw new Error(`Pozicija ${positionName} nema šablon ${template}.`);
    }
    const start = source ? source.startTime.slice(0, 5) : from;
    const end = source ? source.endTime.slice(0, 5) : to;
    const endDate = end <= start ? addDays(date, 1) : date;
    return {
      employeeId,
      positionId: positions.get(positionName),
      startsAt: localToUtc(date, start, TIME_ZONE).toISOString(),
      endsAt: localToUtc(endDate, end, TIME_ZONE).toISOString(),
      note,
      templateId: source?.id ?? null,
    };
  };
  const create = async (body) => {
    await ok('POST', '/api/shifts', { token, body });
    created++;
  };

  for (const week of [0, 1]) {
    const monday = addDays(thisWeek, week * 7);
    for (const person of STAFF.filter((p) => p.position)) {
      for (const day of person.days) {
        await create(shiftBody(person.id, person.position, addDays(monday, day - 1), person));
      }
    }
  }
  for (const [email, week, day, from, to, note] of EXTRAS) {
    const person = STAFF.find((p) => p.email === email);
    await create(shiftBody(person.id, person.position, addDays(thisWeek, week * 7 + day - 1), { from, to, note }));
  }
  for (const [week, day, position, template, from, to] of OPEN_SHIFTS) {
    await create(shiftBody(null, position, addDays(thisWeek, week * 7 + day - 1), { template, from, to }));
  }

  // Ova nedelja je objavljena za sve osim hostesa (ostaju nacrt), sledeća nedelja je ceo nacrt.
  const publishedPositions = ['Konobar', 'Šanker', 'Kuvar'].map((name) => positions.get(name));
  const published = await ok('POST', '/api/shifts/publish', {
    token,
    body: {
      from: localToUtc(thisWeek, '00:00', TIME_ZONE).toISOString(),
      to: localToUtc(addDays(thisWeek, 7), '00:00', TIME_ZONE).toISOString(),
      positionIds: publishedPositions,
    },
  });

  console.log(`Napravljeno smena: ${created}, objavljeno: ${published.published} (ova nedelja, bez hostesa).`);
  printAccounts();
}

main().catch((error) => {
  console.error(`\nGreška: ${error.message}`);
  process.exit(1);
});
