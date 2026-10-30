# Smena.Front

Angular 22 klijent (standalone komponente, signali, bez zone.js) za [Smena API](../../Backend/SmenaAPI). Stilovi su Tailwind CSS 4, a testovi Vitest.

Prva verzija pokriva:

- prijavu i registraciju restorana (access token u memoriji, refresh token u HttpOnly cookie-ju),
- **menadžer:** nedeljni raspored po zaposlenima (nacrt i objavljeno), smene po šablonima pozicije (I, II) jednim klikom ili sa proizvoljnim vremenom (Od-Do), izmena i brisanje, ponavljanje po danima, otvorene smene, objava i povlačenje objave po pozicijama,
- **zaposleni:** "Moje smene" (narednih 30 dana) i objavljen raspored svoje uloge.

Zahtevi (zamena smena, slobodni dani, preuzimanje otvorenih smena) i upravljanje zaposlenima, pozicijama i pozivnicama dolaze u narednim koracima, a API ih već podržava.

## Pokretanje

Potrebni su Node.js 22.22.3+ (ili 24.15+/26), Docker i .NET 10 SDK.

**1. Baza i mejl (iz foldera backenda):**

```powershell
cd D:\Smena\Backend\SmenaAPI
docker compose up -d db mailpit
```

**2. API na `http://localhost:5287`** (poslednja dva reda su opciona: mejlovi u Mailpit, na http://localhost:8025, i veći limit prijava za razvoj):

```powershell
$env:Email__Host = "localhost"; $env:Email__Port = "1025"; $env:Email__UseTls = "false"
$env:RateLimiting__Auth__PermitLimit = "200"
dotnet run --project Smena.API --launch-profile http
```

**3. Frontend na `http://localhost:4200`:**

```powershell
cd D:\Smena\Frontend\Smena.Front
npm install
npm start
```

Dev server prosleđuje `/api` na `http://localhost:5287` (`proxy.conf.json`), pa je sve na istom originu i ne treba CORS. Ako API radi drugde (npr. u Dockeru na 8080), promeni `target` u tom fajlu.

**4. Demo podaci** (restoran, zaposleni po pozicijama i dve nedelje rasporeda):

```powershell
npm run seed
```

| Nalog | Uloga |
|---|---|
| `vlasnik@demo.rs` | vlasnik (menadžerski pogled) |
| `nikola@demo.rs` | menadžer |
| `ana@demo.rs`, `jelena@demo.rs`, `stefan@demo.rs` | konobari |
| `marko@demo.rs` | konobar i šanker (svaki dan kao jedno od toga) |
| `nemanja@demo.rs` | šanker |
| `milan@demo.rs`, `ivana@demo.rs` | kuvari |
| `teodora@demo.rs` | hostesa |

Lozinka za sve je `lozinka123`. Skripta ostavlja ovu nedelju objavljenu (osim hostesa, koje su nacrt) i sledeću nedelju kao nacrt, pa se vide oba stanja. Smene idu po šablonima (I, II), a Stefan ima jednu vanrednu sa drugim vremenom. Ponovno pokretanje ne menja podatke; `npm run seed -- --reset` briše postojeće smene i pravi ih iznova.

## Smene po šablonima

Svaka pozicija ima unapred definisane smene (konobari i šankeri: **I** 08:00-16:00, **II** 16:00-00:00; kuvari: I 07:00-15:00, II 15:00-23:00; hostese samo II 16:00-00:00). U rasporedu se prikazuju kao **I** i **II** (uz vreme sitnijim slovima), a smene sa drugim vremenom samo kao "Od–Do".

- Klik na **+** u ćeliji nudi smene te pozicije i jedan klik pravi smenu. **Drugo vreme (Od – Do)…** otvara pun dijalog za izuzetke, a za poziciju bez šablona dijalog se otvara odmah.
- **Više uloga:** ko radi više njih (npr. konobar i šanker) ima ispod imena "Konobar/Šanker". Pri dodavanju se bira kao koju ulogu radi taj dan (brzo dodavanje nudi smene obe uloge, a dijalog ima "Radi kao"). Svaka smena ima svoju ulogu i boju, a filter po poziciji prikazuje tu osobu pod obe.
- U dijalogu **Nova smena** je unapred izabrana prva smena pozicije, a "Drugo vreme" otkriva polja Od/Do. Isto važi za ponavljanje po danima.
- Šabloni žive u backendu (`/api/shift-templates`); ekran za njihovo uređivanje još ne postoji.

## Komande

| Komanda | Šta radi |
|---|---|
| `npm start` | dev server sa proxy-jem |
| `npm run build` | produkcioni build u `dist/` |
| `npm test` | Vitest testovi (jednom: `npx ng test --watch=false`) |
| `npm run seed` | demo podaci kroz API (`API_URL` menja adresu), `-- --reset` zamenjuje smene |

## Struktura

```
src/app/
  core/       API klijent, prijava (AuthService), interceptor, guardovi, modeli, vreme u zoni restorana
  layout/     ljuska sa navigacijom
  schedule/   nedeljna mreža (WeekGrid) i dijalog za smenu, koje dele menadžer i zaposleni
  features/   stranice: auth, schedule (menadžer i pregled uloge), my (moje smene)
  ui/         modal i obaveštenja
```

Vreme se uvek prikazuje u zoni restorana (`restaurantTimeZoneId` iz `/api/auth/me`), a API prima i vraća UTC. Konverzije su u `core/time.ts`, uključujući prelazak na letnje/zimsko vreme.
