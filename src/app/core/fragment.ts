/**
 * Tajne iz mejlova (token pozivnice, token za reset lozinke) stižu u delu URL-a posle #. Taj deo browser nikad
 * ne šalje serveru, pa ne završava u logovima servera i proksija.
 */

/** Ceo fragment, dekodiran ("#abc%2B" daje "abc+"), ili prazno ako ga nema. */
export function fragmentValue(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

/**
 * Fragment u obliku "a=1&b=2". Ne koristi se URLSearchParams jer on "+" čita kao razmak, a router može da
 * prepiše "%2B" u goli "+" (tokeni sadrže "+", "/" i "="), pa bi token stigao pokvaren i server bi ga odbio.
 */
export function fragmentParams(hash: string): Map<string, string> {
  const params = new Map<string, string>();
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const pair of raw.split('&')) {
    const at = pair.indexOf('=');
    if (at <= 0) {
      continue;
    }
    try {
      params.set(decodeURIComponent(pair.slice(0, at)), decodeURIComponent(pair.slice(at + 1)));
    } catch {
      // pokvaren zapis se preskače, a stranica traži novi link
    }
  }
  return params;
}
