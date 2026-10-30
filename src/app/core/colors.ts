/** Uloge zaposlenog u jednom redu, npr. "Konobar/Šanker". */
export function positionsLabel(names: readonly string[]): string {
  return names.join('/');
}

/** Boje pozicija. Klase su ispisane u celosti da ih Tailwind pronađe pri build-u. */
export interface PositionColor {
  chip: string;
  dot: string;
}

const PALETTE: PositionColor[] = [
  { chip: 'border-sky-300 bg-sky-50 text-sky-900', dot: 'bg-sky-500' },
  { chip: 'border-amber-300 bg-amber-50 text-amber-900', dot: 'bg-amber-500' },
  { chip: 'border-violet-300 bg-violet-50 text-violet-900', dot: 'bg-violet-500' },
  { chip: 'border-rose-300 bg-rose-50 text-rose-900', dot: 'bg-rose-500' },
  { chip: 'border-emerald-300 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-500' },
  { chip: 'border-teal-300 bg-teal-50 text-teal-900', dot: 'bg-teal-500' },
  { chip: 'border-orange-300 bg-orange-50 text-orange-900', dot: 'bg-orange-500' },
  { chip: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900', dot: 'bg-fuchsia-500' },
];

/** Pozicije koje API pravi po podrazumevanju dobijaju fiksne, međusobno različite boje (prve četiri u paleti). */
const DEFAULT_POSITIONS = ['Konobar', 'Kuvar', 'Šanker', 'Hostesa'];

/**
 * Stabilna boja po nazivu pozicije, da ista pozicija ima istu boju na svim ekranima i kod svih korisnika.
 * Pozicije koje je restoran sam dodao dele ostale boje po heš-u imena.
 */
export function positionColor(name: string): PositionColor {
  const known = DEFAULT_POSITIONS.indexOf(name);
  if (known >= 0) {
    return PALETTE[known];
  }

  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PALETTE[DEFAULT_POSITIONS.length + (hash % (PALETTE.length - DEFAULT_POSITIONS.length))];
}
