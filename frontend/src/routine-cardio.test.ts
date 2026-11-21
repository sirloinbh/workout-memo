import { expect, test } from 'vitest';

import { cardioLabel } from './routine-cardio';

// #385: an item still being filled in never shows "undefined" or an empty gap.
test('an empty cardio item shows a dash, not undefined or a blank', () => {
  const steady = cardioLabel({ kind: 'running', intensity: 'zone2', minutes: '' });
  expect(steady).toBe('Running · Zone 2 · – min');
  const distance = cardioLabel({ kind: 'running', intensity: 'zone2', distance_km: '' });
  expect(distance).toBe('Running · Zone 2 · – km');
  const interval = cardioLabel({
    kind: 'rowing',
    intensity: 'interval',
    interval: { repeats: '', work_sec: '', recovery_sec: 90 },
  });
  expect(interval).toBe('Rowing · Interval · – × – work / 1:30 recovery');
  for (const text of [steady, distance, interval]) expect(text).not.toMatch(/undefined|NaN/);
  expect(cardioLabel({ kind: 'running', intensity: 'zone2', minutes: 30 })).toBe(
    'Running · Zone 2 · 30 min',
  );
});
