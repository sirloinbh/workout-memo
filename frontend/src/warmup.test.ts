import { describe, expect, it } from 'vitest';

import { suggestWarmups } from './warmup';

describe('suggestWarmups (#480)', () => {
  it('suggests 40% x 8, 60% x 5, 80% x 3 rounded to the step', () => {
    // 100 kg: 40, 60, 80 are already on the 5 kg step
    expect(suggestWarmups(100, 5)).toEqual([
      { percent: 40, reps: 8, weight: 40 },
      { percent: 60, reps: 5, weight: 60 },
      { percent: 80, reps: 3, weight: 80 },
    ]);
    // 62.5 kg: 25, 37.5 -> 40 (halves round up), 50
    expect(suggestWarmups(62.5, 5).map((s) => s.weight)).toEqual([25, 40, 50]);
  });
  it('honours a different step', () => {
    expect(suggestWarmups(60, 2.5).map((s) => s.weight)).toEqual([25, 35, 47.5]);
  });
  it('drops sets that round to the same weight, to zero, or to the working weight', () => {
    // 20 kg: 8 -> 10, 12 -> 10 (duplicate), 16 -> 15
    expect(suggestWarmups(20, 5).map((s) => s.weight)).toEqual([10, 15]);
    // 6 kg: 2.4 -> 0 dropped, 3.6 -> 5, 4.8 -> 5 duplicate
    expect(suggestWarmups(6, 5).map((s) => s.weight)).toEqual([5]);
    expect(suggestWarmups(5, 5)).toEqual([]);
  });
  it('suggests nothing without a usable working weight', () => {
    expect(suggestWarmups(0, 5)).toEqual([]);
    expect(suggestWarmups(NaN, 5)).toEqual([]);
    expect(suggestWarmups(100, 0)).toEqual([]);
  });
});
