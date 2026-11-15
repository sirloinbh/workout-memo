import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardioWeeklyTargets } from '../src/contract.js';

// #117 (2026-11-16 decision): +10% a week on the week shown before, rounded to 1 minute or
// 0.1 km; weeks 4, 8 and 12 are 80% of the week before, and the next week resumes from it.
const targets = (item: { minutes?: number; distance_km?: number }) =>
  cardioWeeklyTargets(item)!.map((w) => w.target);

test('a timed cardio item grows 10% a week with 80% deloads that do not set the next week back', () => {
  assert.deepEqual(targets({ minutes: 30 }), [30, 33, 36, 29, 40, 44, 48, 38, 53, 58, 64, 51]);
  const weeks = cardioWeeklyTargets({ minutes: 30 })!;
  assert.deepEqual(
    weeks.filter((w) => w.deload).map((w) => w.week),
    [4, 8, 12],
  );
  // Never more than 10% over the week before once the target is large enough to round well.
  for (let i = 1; i < weeks.length; i++)
    if (!weeks[i].deload && !weeks[i - 1].deload)
      assert.ok(weeks[i].target <= weeks[i - 1].target * 1.1 + 0.5, `week ${i + 1}`);
});

test('a distance item steps in 0.1 km without floating point noise', () => {
  assert.deepEqual(
    targets({ distance_km: 5 }),
    [5, 5.5, 6.1, 4.9, 6.7, 7.4, 8.1, 6.5, 8.9, 9.8, 10.8, 8.6],
  );
  for (const target of targets({ distance_km: 1.3 }))
    assert.equal(target, Number(target.toFixed(1)));
});

test('targets stop at the input maximum and an interval item has no weekly targets', () => {
  assert.equal(Math.max(...targets({ minutes: 500 })), 600);
  assert.equal(Math.max(...targets({ distance_km: 450 })), 500);
  assert.equal(cardioWeeklyTargets({}), null);
});
