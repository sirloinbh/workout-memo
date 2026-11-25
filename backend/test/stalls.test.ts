import assert from 'node:assert/strict';
import test from 'node:test';

import { deloadSuggestion, findStalls } from '../src/stalls.js';

type Result = 'achieved' | 'missed' | null;
// One dated, non-deload session per result, in plan order; every session asks for 100 kg x 8.
const sessions = (results: Result[], exercise = 'Bench', is_deload = false) =>
  results.map((result, i) => ({
    date: `2040-01-${String(i + 1).padStart(2, '0')}`,
    excluded: false,
    target: {
      order: i + 1,
      is_deload,
      exercises: [{ exercise, weight: 100, reps: 8, result }],
    },
  }));

test('three misses in a row suggest a deload and a smaller step', () => {
  const [stall] = findStalls(sessions(['achieved', 'missed', 'missed', 'missed']), { bench: 5 });
  assert.equal(stall.exercise, 'Bench');
  assert.equal(stall.misses, 3);
  assert.equal(stall.weight, 100);
  assert.equal(stall.deload_weight, 90);
  assert.equal(stall.smaller_step, 2.5);
});

test('two misses are not enough', () => {
  assert.deepEqual(findStalls(sessions(['missed', 'missed']), {}), []);
});

test('a hit resets the count', () => {
  assert.deepEqual(
    findStalls(sessions(['missed', 'missed', 'achieved', 'missed', 'missed']), {}),
    [],
  );
  assert.equal(
    findStalls(sessions(['missed', 'achieved', 'missed', 'missed', 'missed']), {})[0].misses,
    3,
  );
});

test('open sessions and deload sessions neither add to nor break the run', () => {
  const open = sessions(['missed', 'missed', null, 'missed']);
  assert.equal(findStalls(open, {})[0].misses, 3);
  assert.deepEqual(findStalls(sessions(['missed', 'missed', 'missed'], 'Bench', true), {}), []);
});

test('exercises are counted separately, ignoring case and outer spaces', () => {
  const mixed = [
    ...sessions(['missed', 'missed', 'missed'], 'Bench'),
    ...sessions(['missed'], ' bench ').map((e) => ({ ...e, target: { ...e.target, order: 9 } })),
  ];
  const stalls = findStalls(mixed, {});
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].misses, 4);
});

test('the deload is 10% off rounded to the step and always lower', () => {
  assert.equal(deloadSuggestion(100, 5), 90);
  assert.equal(deloadSuggestion(62.5, 2.5), 57.5);
  assert.equal(deloadSuggestion(20, 5), 15);
  assert.equal(deloadSuggestion(2.5, 5), 0);
});

test('the default step is 5 kg and unplaced entries are ignored', () => {
  const [stall] = findStalls(sessions(['missed', 'missed', 'missed']), {});
  assert.equal(stall.weight_step, 5);
  assert.equal(stall.smaller_step, 2.5);
  const excluded = sessions(['missed', 'missed', 'missed']).map((e) => ({ ...e, excluded: true }));
  assert.deepEqual(findStalls(excluded, {}), []);
});
