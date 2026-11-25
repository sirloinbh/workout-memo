import assert from 'node:assert/strict';
import test from 'node:test';

import { findNewRecords, recordBoard, type RecordRow } from '../src/records.js';

let position = 0;
const set = (
  workout_id: number,
  weight: number,
  reps: number,
  extra: Partial<RecordRow> = {},
): RecordRow => ({
  workout_id,
  position: position++,
  exercise: 'Bench',
  exercise_key: 'bench',
  weight,
  reps,
  unknown_base: false,
  ...extra,
});

test('the first estimate of an exercise has nothing to beat', () => {
  assert.deepEqual(findNewRecords([set(1, 100, 5)], 1), []);
});

test('a set above every earlier estimated 1RM is a record', () => {
  const records = findNewRecords([set(1, 100, 5), set(2, 105, 5)], 2);
  assert.equal(records.length, 1);
  assert.equal(records[0].estimated_1rm, 122.5);
  assert.equal(records[0].previous_best, 116.67);
});

test('a tie is not a record', () => {
  assert.deepEqual(findNewRecords([set(1, 100, 5), set(2, 100, 5)], 2), []);
});

test('sets on a machine with an unconfirmed base weight are skipped', () => {
  const rows = [set(1, 100, 5), set(2, 200, 5, { unknown_base: true })];
  assert.deepEqual(findNewRecords(rows, 2), []);
});

test('editing an old log only compares with sets before it', () => {
  const rows = [set(1, 100, 5), set(2, 90, 5), set(3, 120, 5)];
  assert.deepEqual(findNewRecords(rows, 2), []);
  assert.equal(findNewRecords(rows, 3).length, 1);
});

test('exercises are compared separately and only the saved workout is reported', () => {
  const rows = [
    set(1, 50, 5, { exercise: 'Squat', exercise_key: 'squat' }),
    set(1, 100, 5),
    set(2, 60, 5, { exercise: 'Squat', exercise_key: 'squat' }),
    set(2, 110, 5),
  ];
  const records = findNewRecords(rows, 2);
  assert.deepEqual(
    records.map((r) => r.exercise),
    ['Squat', 'Bench'],
  );
  assert.deepEqual(findNewRecords(rows, 1), []);
});

test('high-rep and bodyweight sets have no estimate', () => {
  assert.deepEqual(findNewRecords([set(1, 100, 5), set(2, 0, 20), set(2, 100, 30)], 2), []);
});

// #484: the record board.

const board = (
  id: number,
  date: string,
  exercise: string,
  weight: number,
  reps: number,
  extra = {},
) => ({
  id,
  date,
  exercise,
  exercise_key: exercise.toLowerCase(),
  weight,
  reps,
  unknown_base: false,
  ...extra,
});

test('the board lists best estimated 1RM and heaviest set per exercise with dates, strongest first', () => {
  const rows = [
    board(1, '2040-01-01', 'Bench', 100, 5),
    board(2, '2040-01-08', 'Bench', 110, 3),
    board(3, '2040-01-02', 'Squat', 140, 5),
  ];
  const result = recordBoard(rows.sort((a, b) => a.date.localeCompare(b.date)));
  assert.deepEqual(
    result.map((r) => r.exercise),
    ['Squat', 'Bench'],
  );
  const bench = result[1];
  assert.equal(bench.max_weight?.value, 110);
  assert.equal(bench.max_weight?.date, '2040-01-08');
  assert.equal(bench.estimated_1rm?.value, 121);
});

test('the board keeps an exercise whose sets have no 1RM estimate and skips an empty history', () => {
  assert.deepEqual(recordBoard([]), []);
  const result = recordBoard([
    board(1, '2040-01-01', 'Curl', 30, 12),
    board(2, '2040-01-02', 'Pushup', 0, 20),
  ]);
  assert.deepEqual(
    result.map((r) => [r.exercise, r.estimated_1rm, r.max_weight?.value ?? null]),
    [['Curl', null, 30]],
  );
});
