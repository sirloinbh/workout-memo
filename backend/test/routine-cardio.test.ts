import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardioWeeklyTargets } from '../src/contract.js';

// #117 (2026-11-16 decision): +10% a week compounded from week 1, shown rounded to 1 minute
// or 0.1 km; weeks 4, 8 and 12 are 80% of the week before, and the next week resumes from it.
const targets = (item: { minutes?: number; distance_km?: number }) =>
  cardioWeeklyTargets(item)!.map((w) => w.target);

test('a timed cardio item grows 10% a week with 80% deloads that do not set the next week back', () => {
  assert.deepEqual(targets({ minutes: 30 }), [30, 33, 36, 29, 40, 44, 48, 39, 53, 58, 64, 51]);
  assert.deepEqual(
    cardioWeeklyTargets({ minutes: 30 })!
      .filter((w) => w.deload)
      .map((w) => w.week),
    [4, 8, 12],
  );
});

test('a distance item steps in 0.1 km without floating point noise', () => {
  assert.deepEqual(
    targets({ distance_km: 5 }),
    [5, 5.5, 6.1, 4.8, 6.7, 7.3, 8.1, 6.4, 8.9, 9.7, 10.7, 8.6],
  );
  for (const target of targets({ distance_km: 1.3 }))
    assert.equal(target, Number(target.toFixed(1)));
});

test('a short target still grows instead of rounding back every week', () => {
  assert.deepEqual(targets({ minutes: 4 }), [4, 4, 5, 4, 5, 6, 6, 5, 7, 8, 9, 7]);
  assert.deepEqual(
    targets({ distance_km: 0.3 }),
    [0.3, 0.3, 0.4, 0.3, 0.4, 0.4, 0.5, 0.4, 0.5, 0.6, 0.6, 0.5],
  );
});

test('targets stop at the input maximum, deloads stay 80% of it, and intervals have none', () => {
  assert.deepEqual(
    targets({ minutes: 500 }),
    [500, 550, 600, 480, 600, 600, 600, 480, 600, 600, 600, 480],
  );
  assert.deepEqual(
    targets({ distance_km: 450 }),
    [450, 495, 500, 400, 500, 500, 500, 400, 500, 500, 500, 400],
  );
  assert.equal(cardioWeeklyTargets({}), null);
});
