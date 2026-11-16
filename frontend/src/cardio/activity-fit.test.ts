import {
  type Encodable,
  Encoder,
  type FileIdMesg,
  Profile,
  type SessionMesg,
} from '@garmin/fitsdk';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { parseFit, parseTcx, readActivityFile } from './activity-file';
import broken from './fixtures/broken.tcx?raw';
import ride from './fixtures/garmin-ride.gpx?raw';
import run from './fixtures/garmin-run.tcx?raw';

// #119 PR 2: FIT files are built here with the SDK's own encoder, so each test shows exactly
// what its file holds. Only the messages the reader uses are written (no records, no GPS).
function fit(sessions: SessionMesg[], type: FileIdMesg['type'] = 'activity') {
  const encoder = new Encoder();
  const start = new Date('2026-11-01T22:10:05Z');
  const fileId: Encodable<FileIdMesg> = {
    mesgNum: Profile.MesgNum.FILE_ID,
    type,
    manufacturer: 'garmin',
    product: 0,
    timeCreated: start,
  };
  encoder.writeMesg(fileId);
  for (const session of sessions) {
    const mesg: Encodable<SessionMesg> = {
      mesgNum: Profile.MesgNum.SESSION,
      timestamp: start,
      startTime: start,
      ...session,
    };
    encoder.writeMesg(mesg);
  }
  return encoder.close();
}
const text = (s: string) => new TextEncoder().encode(s);

const runSession: SessionMesg = {
  sport: 'running',
  subSport: 'generic',
  totalTimerTime: 1800.6,
  totalElapsedTime: 1950,
  totalDistance: 5012.4,
  avgHeartRate: 150,
  maxHeartRate: 172,
  totalCalories: 400,
  totalAscent: 35,
  avgCadence: 82,
};

describe('FIT activity files (#119)', () => {
  it('reads a FIT session with the timer time, in Seoul time', async () => {
    expect(await parseFit('run.fit', fit([runSession]))).toEqual([
      {
        file: 'run.fit',
        format: 'fit',
        external_id: '2026-11-01T22:10:05Z',
        started_at: '2026-11-01T22:10:05Z',
        kind: 'running',
        date: '2026-11-02',
        start_time: '07:10',
        // total_timer_time (pauses excluded), not the 1950 s elapsed.
        duration_sec: 1801,
        distance_km: 5.012,
        avg_heart_rate: 150,
        max_heart_rate: 172,
        calories_kcal: 400,
        // FIT has an ascent total, unlike TCX and GPX.
        elevation_gain_m: 35,
        // Running cadence is stored per foot, so it is not read.
        avg_cadence: null,
        memo: '',
      },
    ]);
  });

  it('gives the FIT and the TCX of one activity the same id', async () => {
    const [fromFit] = await parseFit('run.fit', fit([runSession]));
    expect(fromFit.external_id).toBe(parseTcx('run.tcx', run)[0].external_id);
  });

  it('maps FIT sports and sub sports to the app kinds', async () => {
    const kind = async (
      sport: SessionMesg['sport'],
      subSport: SessionMesg['subSport'] = 'generic',
    ) => (await parseFit('a.fit', fit([{ ...runSession, sport, subSport }])))[0];
    expect((await kind('cycling', 'road')).kind).toBe('outdoor_cycling');
    expect((await kind('cycling', 'virtualActivity')).kind).toBe('indoor_cycling');
    expect((await kind('fitnessEquipment', 'indoorCycling')).kind).toBe('indoor_cycling');
    expect((await kind('fitnessEquipment', 'elliptical')).kind).toBe('elliptical');
    expect((await kind('fitnessEquipment', 'stairClimbing')).kind).toBe('stairs');
    expect((await kind('fitnessEquipment', 'indoorRowing')).kind).toBe('rowing');
    expect((await kind('running', 'treadmill')).kind).toBe('running');
    expect((await kind('hiking')).kind).toBe('walking');
    expect((await kind('swimming', 'lapSwimming')).kind).toBe('swimming');
    expect((await kind('training', 'cardioTraining')).kind).toBe('other');
    // Cycling keeps its cadence (rpm).
    expect((await kind('cycling', 'road')).avg_cadence).toBe(82);
  });

  it('reads each session of a multisport file and leaves out transitions', async () => {
    const activities = await parseFit(
      'tri.fit',
      fit([
        { ...runSession, sport: 'cycling', subSport: 'road' },
        { ...runSession, sport: 'transition', subSport: 'generic' },
        runSession,
      ]),
    );
    expect(activities.map((a) => [a.file, a.kind])).toEqual([
      ['tri.fit (1)', 'outdoor_cycling'],
      ['tri.fit (2)', 'running'],
    ]);
  });

  it('leaves out-of-range values empty instead of refusing the activity', async () => {
    const [activity] = await parseFit(
      'a.fit',
      fit([{ ...runSession, avgHeartRate: 20, maxHeartRate: 255, totalAscent: 20000 }]),
    );
    expect(activity).toMatchObject({
      avg_heart_rate: null,
      max_heart_rate: null,
      elevation_gain_m: null,
    });
  });

  it('falls back to the elapsed time when the timer time is 0', async () => {
    const [activity] = await parseFit('a.fit', fit([{ ...runSession, totalTimerTime: 0 }]));
    expect(activity.duration_sec).toBe(1950);
  });

  it('refuses a session without a start time', async () => {
    expect(
      (await readActivityFile('a.fit', fit([{ ...runSession, startTime: undefined }]))).problems,
    ).toEqual(['a.fit: No start time found.']);
  });

  it('reports a damaged, foreign or non-activity FIT file by name', async () => {
    const damaged = fit([runSession]);
    damaged[damaged.length - 5] ^= 0xff;
    expect(await readActivityFile('cut.fit', damaged)).toEqual({
      activities: [],
      problems: ['cut.fit: Could not read the file. It is damaged.'],
      skipped: 0,
    });
    expect((await readActivityFile('a.fit', text('<gpx></gpx>'))).problems).toEqual([
      'a.fit: Not a FIT file.',
    ]);
    expect((await readActivityFile('settings.fit', fit([], 'settings'))).problems).toEqual([
      'settings.fit: No activity summary found. Only activity FIT files can be imported.',
    ]);
  });

  it('tells a FIT file by its signature when the name has no extension', async () => {
    const read = await readActivityFile('download', fit([runSession]));
    expect(read.activities.map((a) => a.format)).toEqual(['fit']);
  });

  it('still reads TCX and GPX as text', async () => {
    expect((await readActivityFile('run.tcx', text(run))).activities[0].format).toBe('tcx');
    expect((await readActivityFile('ride.gpx', text(ride))).activities[0].format).toBe('gpx');
    expect((await readActivityFile('notes.txt', text('hello'))).problems).toEqual([
      'notes.txt: Only TCX, GPX, FIT and ZIP files can be imported.',
    ]);
  });
});

describe('ZIP files (#119)', () => {
  it('reads the activity files inside, one ZIP level down, and skips the rest', async () => {
    const archive = zipSync({
      'activity_1.fit': fit([runSession]),
      'DI_CONNECT/summary.json': text('{}'),
      '__MACOSX/._activity_1.fit': text('x'),
      'DI_CONNECT/UploadedFiles_Part1.zip': zipSync({
        'ride.gpx': text(ride),
        'broken.tcx': text(broken),
        'deeper.zip': zipSync({ 'deep.tcx': text(run) }),
      }),
    });
    const read = await readActivityFile('export.zip', archive);
    expect(read.activities.map((a) => a.file)).toEqual([
      'export.zip › UploadedFiles_Part1.zip › ride.gpx',
      'export.zip › activity_1.fit',
    ]);
    // One bad file inside does not stop the others; a ZIP two levels down is not opened.
    expect(read.problems).toEqual([
      expect.stringMatching(
        /^export\.zip › UploadedFiles_Part1\.zip › broken\.tcx: Could not read the file/,
      ),
    ]);
  });

  it('reports a damaged ZIP and one with no activity files', async () => {
    expect((await readActivityFile('bad.zip', text('PK\x03\x04 not really'))).problems).toEqual([
      'bad.zip: Could not open the ZIP file. It is damaged.',
    ]);
    expect(
      (await readActivityFile('photos.zip', zipSync({ 'a.jpg': text('x') }))).problems,
    ).toEqual(['photos.zip: No TCX, GPX or FIT files found in the ZIP file.']);
  });

  it('counts non-activity FIT files in a ZIP into one line', async () => {
    const archive = zipSync({
      'run.fit': fit([runSession]),
      'settings.fit': fit([], 'settings'),
      'Part1.zip': zipSync({ 'monitor.fit': fit([], 'monitoringB') }),
    });
    const read = await readActivityFile('export.zip', archive);
    expect(read.activities).toHaveLength(1);
    expect(read.problems).toEqual([
      'export.zip: Skipped 2 FIT files without an activity summary (such as settings or daily health data).',
    ]);
    expect(read.skipped).toBe(0);
  });

  it('does not unpack an activity entry over 50 MB', async () => {
    const archive = zipSync({
      'run.fit': fit([runSession]),
      'huge.fit': new Uint8Array(51 * 1024 * 1024),
    });
    const read = await readActivityFile('export.zip', archive);
    expect(read.activities).toHaveLength(1);
    expect(read.problems).toEqual([
      'export.zip › huge.fit: Too large for an activity file (over 50 MB).',
    ]);
  });
});
