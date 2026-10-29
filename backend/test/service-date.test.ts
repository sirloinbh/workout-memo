import assert from 'node:assert/strict';
import { test } from 'node:test';

import { seoulDate } from '../../frontend/src/date.js';

test('default workout date changes at Seoul midnight, including year and leap day boundaries', () => {
  for (const [instant, expected] of [
    ['2026-12-31T14:59:59Z', '2026-12-31'],
    ['2026-12-31T15:00:00Z', '2027-01-01'],
    ['2024-02-28T15:00:00Z', '2024-02-29'],
    ['2024-02-29T15:00:00Z', '2024-03-01'],
  ]) {
    assert.equal(seoulDate(new Date(instant)), expected);
  }
});
