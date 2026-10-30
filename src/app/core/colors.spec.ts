import { describe, expect, it } from 'vitest';
import { positionColor, positionsLabel } from './colors';

describe('positionColor', () => {
  it('gives the default positions four different colors', () => {
    const chips = ['Konobar', 'Kuvar', 'Šanker', 'Hostesa'].map((name) => positionColor(name).chip);
    expect(new Set(chips).size).toBe(4);
  });

  it('is stable for the same name', () => {
    expect(positionColor('Barista')).toEqual(positionColor('Barista'));
  });

  it('keeps custom positions apart from the default ones', () => {
    const defaults = new Set(['Konobar', 'Kuvar', 'Šanker', 'Hostesa'].map((name) => positionColor(name).chip));
    for (const name of ['Barista', 'Pomoćni kuvar', 'Dostavljač', 'Čistač', 'Sommelier']) {
      expect(defaults.has(positionColor(name).chip)).toBe(false);
    }
  });
});

describe('positionsLabel', () => {
  it('joins several roles with a slash', () => {
    expect(positionsLabel(['Konobar', 'Šanker'])).toBe('Konobar/Šanker');
  });

  it('is just the name for one role and empty for none', () => {
    expect(positionsLabel(['Kuvar'])).toBe('Kuvar');
    expect(positionsLabel([])).toBe('');
  });
});
