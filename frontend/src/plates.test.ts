import { describe, expect, it } from 'vitest';

import {
  defaultPlateSettings,
  parsePlateSettings,
  parsePlateText,
  plateSettingsKey,
  splitPlates,
} from './plates';

const s = defaultPlateSettings();

describe('splitPlates (#479)', () => {
  it('splits an exact target into plates per side', () => {
    // (100 - 20) / 2 = 40 = 25 + 15
    expect(splitPlates(100, s)).toEqual({
      kind: 'exact',
      perSide: [
        { plate: 25, count: 1 },
        { plate: 15, count: 1 },
      ],
    });
  });
  it('uses small plates and repeated plates', () => {
    // (62.5 - 20) / 2 = 21.25 = 20 + 1.25 ; (140-20)/2 = 60 = 25x2 + 10
    expect(splitPlates(62.5, s)).toMatchObject({ kind: 'exact' });
    expect(splitPlates(140, s)).toEqual({
      kind: 'exact',
      perSide: [
        { plate: 25, count: 2 },
        { plate: 10, count: 1 },
      ],
    });
  });
  it('shows an empty bar for a target equal to the bar', () => {
    expect(splitPlates(20, s)).toEqual({ kind: 'exact', perSide: [] });
  });
  it('rejects a target below the bar', () => {
    expect(splitPlates(15, s)).toEqual({ kind: 'below-bar', bar: 20 });
  });
  it('reports the nearest loadable weight when the target cannot be made', () => {
    // 21 kg: 0.5 per side, smallest plate 1.25 -> 20 or 22.5; 20 is nearer
    expect(splitPlates(21, s)).toEqual({ kind: 'inexact', perSide: [], nearest: 20 });
    // 22 kg: 22.5 is nearer than 20
    expect(splitPlates(22, s)).toMatchObject({ kind: 'inexact', nearest: 22.5 });
  });
  it('honours a custom bar and plate set', () => {
    const custom = { format: 1 as const, bar: 15, plates: [10, 2] };
    expect(splitPlates(39, custom)).toEqual({
      kind: 'exact',
      perSide: [
        { plate: 10, count: 1 },
        { plate: 2, count: 1 },
      ],
    });
  });
});

describe('plate settings (#479)', () => {
  it('parses a typed list heaviest first without duplicates', () => {
    expect(parsePlateText('5, 20 2.5,20')).toEqual([20, 5, 2.5]);
  });
  it('rejects an empty, negative or non-numeric list', () => {
    expect(parsePlateText('')).toBeNull();
    expect(parsePlateText('20, -5')).toBeNull();
    expect(parsePlateText('20, abc')).toBeNull();
  });
  it('falls back to defaults for missing or corrupt storage', () => {
    expect(plateSettingsKey).toContain('plates');
    expect(parsePlateSettings(null)).toEqual(defaultPlateSettings());
    expect(parsePlateSettings('{oops')).toEqual(defaultPlateSettings());
    expect(parsePlateSettings(JSON.stringify({ format: 1, bar: -1, plates: [20] }))).toEqual(
      defaultPlateSettings(),
    );
  });
  it('keeps valid stored settings', () => {
    const raw = JSON.stringify({ format: 1, bar: 15, plates: [10, 5] });
    expect(parsePlateSettings(raw)).toEqual({ format: 1, bar: 15, plates: [10, 5] });
  });
});
