import { expect, test } from 'vitest';

import { cardioSessionSchemaFor, fieldErrors } from '../../../shared/contract';
import type { CardioBody, CardioSession } from './api';
import { isSameActivity, isSimilarActivity } from './duplicates';
import { sessionLabel } from './format';
import {
  affectedBy,
  canSave,
  type Check,
  checkCounter,
  type CheckRow,
  recheck,
} from './import-check';

// #387: the preview table's save check keeps its answers per row and re-checks only the rows an
// edit can affect.
const today = '2026-12-31';
const body = (over: Partial<CardioBody>): CardioBody => ({
  date: '2026-11-01',
  start_time: '07:00',
  kind: 'running',
  duration_sec: 1800,
  distance_km: 5,
  avg_heart_rate: null,
  max_heart_rate: null,
  calories_kcal: null,
  elevation_gain_m: null,
  avg_cadence: null,
  effort: null,
  workout_id: null,
  source: 'file',
  external_id: null,
  memo: '',
  ...over,
});
const row = (over: Partial<CardioBody>, extra: Partial<CheckRow> = {}): CheckRow => ({
  body: body(over),
  selected: false,
  touched: false,
  check: { kind: 'ok', text: '' },
  ...extra,
});
const stored = (over: Partial<CardioBody>, id = 1): CardioSession => ({
  ...body(over),
  id,
  pace_sec_per_km: null,
  speed_kmh: null,
});

// 2,000 rows on 2,000 different days: no row looks like another.
const synthetic = () =>
  Array.from({ length: 2000 }, (_, i) =>
    row({
      date: new Date(Date.parse('2020-01-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10),
      external_id: `id-${i}`,
    }),
  );

test('one cell edit among 2,000 rows re-checks one row', () => {
  const rows = recheck(synthetic(), [], today);
  expect(rows.every((r) => r.selected && r.check.kind === 'ok')).toBe(true);

  checkCounter.rows = 0;
  const index = 1234;
  const edited = rows.map((r, i) =>
    i === index ? { ...r, body: { ...r.body, start_time: '08:30' } } : r,
  );
  const next = recheck(edited, [], today, { only: affectedBy(edited, index, rows[index].body) });
  expect(checkCounter.rows).toBe(1);
  expect(next[index].body.start_time).toBe('08:30');
  expect(next[index].check.kind).toBe('ok');
  // The other rows are the same objects, not copies.
  expect(next[0]).toBe(rows[0]);
});

test('an edit that makes a row look like another re-checks both and follows the defaults', () => {
  const rows = recheck([row({ date: '2026-11-01' }), row({ date: '2026-11-03' })], [], today);
  expect(rows.map((r) => r.selected)).toEqual([true, true]);
  const edited = rows.map((r, i) =>
    i === 1 ? { ...r, body: { ...r.body, date: '2026-11-01' } } : r,
  );
  checkCounter.rows = 0;
  const next = recheck(edited, [], today, { only: affectedBy(edited, 1, rows[1].body) });
  expect(checkCounter.rows).toBe(2);
  expect(next[1].check).toEqual({
    kind: 'candidate',
    text: 'Possible duplicate: same as or similar to row 1',
  });
  expect(next[1].selected).toBe(false);
  expect(next[0].selected).toBe(true);
});

// The check the table used before the index: every row against every other row. The indexed
// check must give the same answers.
function reference(rows: CheckRow[], existing: CardioSession[]) {
  const out: CheckRow[] = [];
  const checks: Check[] = [];
  const check = (r: CheckRow, i: number, list: CheckRow[]): Check => {
    const parsed = cardioSessionSchemaFor(today).safeParse(r.body);
    if (!parsed.success)
      return { kind: 'invalid', text: Object.values(fieldErrors(parsed.error)).join(' · ') };
    const stored = existing.find((s) => isSameActivity(s, r.body));
    if (stored) return { kind: 'blocked', text: `Already imported (${sessionLabel(stored)})` };
    const same = (x: CheckRow, j: number) => j < i && isSameActivity(x.body, r.body);
    const chosenTwin = list.findIndex((x, j) => same(x, j) && x.selected && canSave(checks[j]));
    if (chosenTwin >= 0)
      return {
        kind: 'blocked',
        text: `Same activity as row ${chosenTwin + 1}. Clear that row's selection to choose this one`,
      };
    const similar = existing.find((s) => isSimilarActivity(s, r.body));
    if (similar)
      return {
        kind: 'candidate',
        text: `Possible duplicate: existing record ${sessionLabel(similar)}`,
      };
    const twin = list.findIndex(
      (x, j) => same(x, j) || (j < i && isSimilarActivity(x.body, r.body)),
    );
    if (twin >= 0)
      return {
        kind: 'candidate',
        text: `Possible duplicate: same as or similar to row ${twin + 1}`,
      };
    return { kind: 'ok', text: 'Ready to save' };
  };
  const chosenLater = (r: CheckRow, i: number) =>
    rows.some((x, j) => j > i && x.touched && x.selected && isSameActivity(x.body, r.body));
  rows.forEach((r, i) => {
    const draft = r.touched ? r : { ...r, selected: false };
    const first = check(draft, i, [...out, draft]);
    const next = r.touched ? r : { ...r, selected: first.kind === 'ok' && !chosenLater(r, i) };
    out.push({ ...next, check: first });
    checks.push(first);
  });
  return out;
}

test('the indexed check answers like the all-rows check on look-alikes, twins and stored sessions', () => {
  // A small deterministic generator: few dates, times and ids, so look-alikes are common.
  let seed = 7;
  const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let round = 0; round < 60; round++) {
    const rows = Array.from({ length: 12 }, () => {
      const day = 1 + random(3);
      const time = random(4) === 0 ? null : `0${6 + random(2)}:0${random(4)}`;
      const id = random(3) === 0 ? `a${random(3)}` : null;
      const touched = random(4) === 0;
      return row(
        {
          date: `2026-11-0${day}`,
          start_time: time,
          distance_km: random(2) ? 5 : 5.02,
          external_id: id,
          ...(random(5) === 0 ? { duration_sec: 0 } : {}),
        },
        { touched, selected: touched && random(2) === 0 },
      );
    });
    const existing = [
      stored({ date: '2026-11-02', start_time: '06:01', external_id: null }, 1),
      stored({ date: '2026-11-03', start_time: '07:03', external_id: 'a1' }, 2),
    ];
    const expected = reference(rows, existing);
    const actual = recheck(rows, existing, today);
    expect(actual.map((r) => [r.selected, r.check])).toEqual(
      expected.map((r) => [r.selected, r.check]),
    );
  }
});
