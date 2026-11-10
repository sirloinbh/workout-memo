import { describe, expect, it, vi } from 'vitest';

import {
  ActivityFileError,
  parseActivityFile,
  parseGpx,
  parseTcx,
  seoulDateTime,
} from './activity-file';
import broken from './fixtures/broken.tcx?raw';
import ride from './fixtures/garmin-ride.gpx?raw';
import run from './fixtures/garmin-run.tcx?raw';

describe('activity files (#119)', () => {
  it('reads a Garmin TCX run from its laps, in Seoul time', () => {
    expect(parseTcx('run.tcx', run)).toEqual([
      {
        file: 'run.tcx',
        format: 'tcx',
        external_id: '2026-11-01T22:10:05Z',
        started_at: '2026-11-01T22:10:05Z',
        kind: 'running',
        // 22:10 UTC on Nov 1 is 07:10 on Nov 2 in Seoul.
        date: '2026-11-02',
        start_time: '07:10',
        // 600 + 610.4 s of timer time; 2000 + 2005.6 m.
        duration_sec: 1210,
        distance_km: 4.006,
        // (140 × 600 + 150 × 610.4) / 1210.4 — weighted by lap time.
        avg_heart_rate: 145,
        max_heart_rate: 165,
        calories_kcal: 302,
        elevation_gain_m: null,
        // Lap/Cadence is absent; the running cadence extension is not read.
        avg_cadence: null,
        memo: '아침 한강',
      },
    ]);
  });

  it('reads a Garmin GPX ride from its points, without the gap between segments', () => {
    const [activity] = parseGpx('ride.gpx', ride);
    expect(activity).toMatchObject({
      format: 'gpx',
      kind: 'outdoor_cycling',
      external_id: '2026-11-03T21:30:00Z',
      date: '2026-11-04',
      start_time: '06:30',
      // First to last point, pause included.
      duration_sec: 150,
      // Three 0.001° steps of latitude (111.2 m each); the jump to the second segment is not
      // counted.
      distance_km: 0.334,
      avg_heart_rate: 130,
      max_heart_rate: 140,
      calories_kcal: null,
      avg_cadence: null,
    });
  });

  it('gives the same activity the same id in TCX and GPX', () => {
    const gpx = `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><type>running</type><trkseg>
      <trkpt lat="37.5" lon="127"><time>2026-11-01T22:10:05Z</time></trkpt>
      <trkpt lat="37.51" lon="127"><time>2026-11-01T22:30:15Z</time></trkpt></trkseg></trk></gpx>`;
    expect(parseGpx('run.gpx', gpx)[0].external_id).toBe(parseTcx('run.tcx', run)[0].external_id);
  });

  it('converts across midnight and keeps the minute', () => {
    expect(seoulDateTime(new Date('2026-12-31T15:00:59Z'))).toEqual({
      date: '2027-01-01',
      start_time: '00:00',
    });
    expect(seoulDateTime(new Date('2026-11-08T14:59:00Z'))).toEqual({
      date: '2026-11-08',
      start_time: '23:59',
    });
  });

  it('maps the three TCX sports and GPX type words', () => {
    const tcx = (sport: string) =>
      parseTcx(
        'a.tcx',
        `<TrainingCenterDatabase><Activities><Activity Sport="${sport}"><Id>2026-11-01T00:00:00Z</Id>
        <Lap StartTime="2026-11-01T00:00:00Z"><TotalTimeSeconds>60</TotalTimeSeconds></Lap></Activity></Activities></TrainingCenterDatabase>`,
      )[0].kind;
    expect([tcx('Running'), tcx('Biking'), tcx('Other')]).toEqual([
      'running',
      'outdoor_cycling',
      'other',
    ]);
    const gpx = (type: string) =>
      parseGpx(
        'a.gpx',
        `<gpx><trk><type>${type}</type><trkseg><trkpt lat="1" lon="1"><time>2026-11-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>`,
      )[0].kind;
    expect(
      [
        'trail_running',
        'hiking',
        'indoor_cycling',
        'road_biking',
        'open_water_swimming',
        'yoga',
      ].map(gpx),
    ).toEqual(['running', 'walking', 'indoor_cycling', 'outdoor_cycling', 'swimming', 'other']);
  });

  it('leaves out-of-range values empty and a TCX without distance at null', () => {
    const [activity] = parseTcx(
      'a.tcx',
      `<TrainingCenterDatabase><Activities><Activity Sport="Other"><Id>x</Id>
      <Lap StartTime="2026-11-01T00:00:00Z"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>0</DistanceMeters>
      <AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>140</Value></MaximumHeartRateBpm>
      <Cadence>400</Cadence></Lap></Activity></Activities></TrainingCenterDatabase>`,
    );
    expect(activity).toMatchObject({
      distance_km: null,
      avg_heart_rate: 150,
      // Under the average: a glitch, dropped rather than blocking the row.
      max_heart_rate: null,
      avg_cadence: null,
    });
  });

  it('reports a damaged or foreign file by name', () => {
    expect(() => parseActivityFile('broken.tcx', broken)).toThrow(ActivityFileError);
    expect(() => parseActivityFile('broken.tcx', broken)).toThrow(
      /broken\.tcx: 파일을 읽지 못했습니다/,
    );
    expect(() => parseActivityFile('ride.gpx', run)).toThrow('ride.gpx: GPX 파일이 아닙니다.');
    expect(() => parseActivityFile('a.fit', 'binary')).toThrow(
      'a.fit: TCX·GPX 파일만 가져올 수 있습니다.',
    );
    expect(() => parseActivityFile('empty.gpx', '<gpx><trk><trkseg></trkseg></trk></gpx>')).toThrow(
      'empty.gpx: 기록 시각이 없습니다.',
    );
  });

  it('detects the format from the content when the extension is unknown', () => {
    expect(parseActivityFile('download', run)[0].format).toBe('tcx');
    expect(parseActivityFile('download.xml', ride)[0].format).toBe('gpx');
  });

  it('keeps the id to whole seconds and reads a time without a zone as UTC', () => {
    const gpx = (time: string) =>
      parseGpx(
        'a.gpx',
        `<gpx><trk><trkseg><trkpt lat="1" lon="1"><time>${time}</time></trkpt></trkseg></trk></gpx>`,
      )[0];
    expect(gpx('2026-11-01T22:10:05.123Z').external_id).toBe('2026-11-01T22:10:05Z');
    // Never the browser's local time: the same Seoul date and time on every device.
    expect(gpx('2026-11-01T22:10:05')).toMatchObject({
      external_id: '2026-11-01T22:10:05Z',
      date: '2026-11-02',
      start_time: '07:10',
    });
    // The tests run in UTC (vitest.config.ts), where a local reading would look right too, so
    // the text handed to Date.parse is checked: it carries the "Z".
    const parse = vi.spyOn(Date, 'parse');
    try {
      gpx('2026-11-01T22:10:05');
      expect(parse).toHaveBeenCalledWith('2026-11-01T22:10:05Z');
      expect(parse).not.toHaveBeenCalledWith('2026-11-01T22:10:05');
    } finally {
      parse.mockRestore();
    }
  });
});
