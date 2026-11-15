import { describe, expect, it } from 'vitest';

import { isSameActivity, isSimilarActivity } from './duplicates';

const run = {
  date: '2026-11-02',
  start_time: '07:10',
  duration_sec: 1800,
  distance_km: 5,
  source: 'file' as const,
  external_id: '2026-11-01T22:10:05Z',
};

describe('import duplicates (#119)', () => {
  it('is the same activity only with the same source and external id', () => {
    expect(isSameActivity(run, { ...run, date: '2026-10-01' })).toBe(true);
    expect(isSameActivity(run, { ...run, source: 'garmin' })).toBe(false);
    expect(isSameActivity({ ...run, external_id: null }, { ...run, external_id: null })).toBe(
      false,
    );
  });

  it('is a candidate within 2 minutes and 1% of the distance', () => {
    expect(isSimilarActivity(run, { ...run, start_time: '07:12', distance_km: 5.05 })).toBe(true);
    expect(isSimilarActivity(run, { ...run, start_time: '07:13' })).toBe(false);
    expect(isSimilarActivity(run, { ...run, distance_km: 5.06 })).toBe(false);
    // Across midnight.
    expect(
      isSimilarActivity(
        { ...run, date: '2026-11-01', start_time: '23:59' },
        { ...run, date: '2026-11-02', start_time: '00:01' },
      ),
    ).toBe(true);
  });

  it('uses the date without a start time and the duration without a distance', () => {
    const typed = { ...run, start_time: null, source: 'manual' as const, external_id: null };
    expect(isSimilarActivity(run, typed)).toBe(true);
    expect(isSimilarActivity(run, { ...typed, date: '2026-11-03' })).toBe(false);
    expect(isSimilarActivity(run, { ...run, distance_km: null, duration_sec: 1818 })).toBe(true);
    expect(isSimilarActivity(run, { ...run, distance_km: null, duration_sec: 1819 })).toBe(false);
  });
});
