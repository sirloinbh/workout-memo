import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  backupFormat,
  BackupInvalid,
  backupVersion,
  csvCell,
  parseBackup,
  toCsv,
} from '../src/backup.js';
import { parseCsv } from './csv-reader.js';
import { routineInput } from './routine-fixture.js';

test('CSV cells keep commas, quotes, newlines and Korean intact', () => {
  const values = [
    'Bench, Press',
    'Grip "wide"',
    'First line\nSecond line',
    'Carriage return',
    'Leg Press',
    '',
  ];
  const csv = toCsv([['a', 'b', 'c', 'd', 'e', 'f'], values]);
  assert.ok(csv.endsWith('\r\n'));
  assert.deepEqual(parseCsv(csv), [['a', 'b', 'c', 'd', 'e', 'f'], values]);
  assert.equal(csvCell('Grip "wide"'), '"Grip ""wide"""');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('Plain value'), 'Plain value');
});

test('CSV neutralizes values a spreadsheet would run as formulas', () => {
  for (const value of ['=1+1', '+82', '-5', '@SUM(A1)', '\tcmd', '\rcmd', '=HYPERLINK("x")']) {
    const [[read]] = parseCsv(toCsv([[value]]));
    assert.equal(read, "'" + value, `${JSON.stringify(value)} starts with an apostrophe`);
  }
  // Ordinary text and numeric columns are not altered.
  assert.equal(parseCsv(toCsv([['Squat -5kg']]))[0][0], 'Squat -5kg');
  assert.equal(csvCell(100.25), '100.25');
  assert.equal(csvCell(0), '0');
});

test('CSV writes NULL as an empty cell', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.deepEqual(parseCsv(toCsv([['x', null, 'y']])), [['x', '', 'y']]);
});

function validBackup() {
  return {
    format: backupFormat,
    version: backupVersion,
    exported_at: '2026-10-19T01:02:03.000Z',
    data: {
      brands: [{ id: 1, name: 'Arsenal Strength' }],
      machines: [{ id: 5, brand_id: 1, name: 'Leg Press', base_weight: null, notes: '' }],
      workouts: [
        {
          id: 9,
          date: '2024-02-29',
          title: 'Lower body',
          notes: '',
          created_at: '2024-02-29T10:00:00.000Z',
          sets: [{ exercise: 'Leg Press', machine_id: 5, weight: 100.25, reps: 10, notes: '' }],
        },
      ],
      goals: [
        {
          id: 3,
          exercise: 'Leg Press',
          target_weight: 120,
          target_reps: 8,
          start_date: '2024-02-01',
          deadline: '2024-03-31',
        },
      ],
      routines: [{ id: 2, created_at: '2024-02-28T00:00:00.000Z', plan: routineInput() }],
      cardio_sessions: [
        {
          id: 4,
          date: '2024-02-29',
          start_time: '07:30',
          kind: 'running',
          duration_sec: 1800,
          distance_km: 5.25,
          avg_heart_rate: 150,
          max_heart_rate: 170,
          calories_kcal: null,
          elevation_gain_m: null,
          avg_cadence: null,
          effort: 'medium',
          workout_id: 9 as number | null,
          source: 'garmin',
          external_id: 'g-1' as string | null,
          memo: '',
          created_at: '2024-02-29T08:00:00.000Z',
        },
      ],
      cardio_goals: [
        {
          id: 6,
          goal_type: 'distance',
          kind: 'running' as string | null,
          period: 'week' as string | null,
          target_distance_km: 15.5 as number | null,
          target_duration_sec: null as number | null,
          target_count: null as number | null,
          start_date: '2024-02-05',
          deadline: '2024-03-31',
        },
      ],
      // #359 (v4)
      body_measurements: [
        {
          id: 8,
          date: '2024-02-29',
          body_weight_kg: 72.5 as number | null,
          body_fat_percent: null as number | null,
          skeletal_muscle_kg: 33.1 as number | null,
          created_at: '2024-02-29T09:00:00.000Z',
          updated_at: '2024-03-01T09:00:00.000Z',
        },
      ],
      exercise_body_parts: [{ exercise: 'Leg Press', body_part: '하체-앞' }],
      exercise_weight_steps: [{ exercise: 'Leg Press', weight_step: 2.5 }],
      routine_rests: [{ routine_id: 2, rest_date: '2024-03-02' }],
    },
  };
}

test('a v4 backup carries set completion, RPE and the v4 lists; older files get defaults (#359)', () => {
  const backup = validBackup();
  Object.assign(backup.data.workouts[0].sets[0], { completed: false, rpe: 8.5 });
  const sets = parseBackup(backup).data.workouts[0].sets;
  assert.equal(sets[0].completed, false);
  assert.equal(sets[0].rpe, 8.5);
  // A set without the fields is a performed set with no RPE.
  const plain = parseBackup(validBackup()).data.workouts[0].sets[0];
  assert.equal(plain.completed, true);
  assert.equal(plain.rpe, null);
  assert.equal(parseBackup(validBackup()).data.machines[0].official_weight_id, null);
  // Every v4 list is required in v4, and all missing ones are reported together.
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).body_measurements;
    delete (b.data as Partial<typeof b.data>).routine_rests;
  }, /data\.body_measurements: a v4 backup needs this list \/ data\.routine_rests: a v4/);
  // A v3 file restores with empty v4 lists, and its stray (even broken) v4 lists are ignored.
  const {
    body_measurements: _b,
    exercise_body_parts: _p,
    exercise_weight_steps: _w,
    routine_rests: _r,
    ...v3
  } = validBackup().data;
  for (const version of [1, 2, 3]) {
    const parsed = parseBackup({
      ...validBackup(),
      version,
      data: { ...v3, body_measurements: [{ nonsense: true }] },
    });
    assert.deepEqual(parsed.data.body_measurements, []);
    assert.deepEqual(parsed.data.routine_rests, []);
  }
});

test('backup validation rejects bad v4 values (#359)', () => {
  rejects((b) => {
    b.data.workouts[0].sets[0] = { ...b.data.workouts[0].sets[0], rpe: 8.3 } as never;
  }, /rpe/);
  rejects((b) => {
    b.data.body_measurements[0].body_weight_kg = null;
    b.data.body_measurements[0].skeletal_muscle_kg = null;
  }, /at least one value/);
  rejects((b) => {
    b.data.body_measurements.push({ ...b.data.body_measurements[0], id: 9 });
  }, /Body record date is duplicated|body_measurements: duplicate/);
  rejects((b) => {
    b.data.routine_rests[0].routine_id = 99;
  }, /references routine 99/);
  rejects((b) => {
    b.data.exercise_body_parts[0].body_part = 'nope';
  }, /exercise_body_parts/);
});

function rejects(mutate: (b: ReturnType<typeof validBackup>) => unknown, pattern: RegExp) {
  const backup = validBackup();
  const value = mutate(backup) ?? backup;
  assert.throws(
    () => parseBackup(value),
    (e: unknown) => e instanceof BackupInvalid && pattern.test(e.message),
  );
}

test('a v2 backup carries cardio sessions; a v1 backup restores as one without any (#114)', () => {
  const parsed = parseBackup({ ...validBackup(), version: 2 });
  assert.equal(parsed.version, 2);
  assert.equal(parsed.data.cardio_sessions.length, 1);
  assert.equal(parsed.data.cardio_sessions[0].distance_km, 5.25);
  // v1 predates cardio: no field is fine, and anything there is ignored.
  const { cardio_sessions: _cardio, ...v1Data } = validBackup().data;
  const v1 = parseBackup({ ...validBackup(), version: 1, data: v1Data });
  assert.equal(v1.version, 1);
  assert.deepEqual(v1.data.cardio_sessions, []);
  assert.equal(v1.data.workouts.length, 1);
  assert.deepEqual(parseBackup({ ...validBackup(), version: 1 }).data.cardio_sessions, []);
  // Even an invalid cardio list in a v1 file is ignored instead of failing the restore.
  const brokenCardio = {
    ...validBackup().data,
    cardio_sessions: [{ kind: 'flying', duration_sec: -1 }],
  };
  assert.deepEqual(
    parseBackup({ ...validBackup(), version: 1, data: brokenCardio }).data.cardio_sessions,
    [],
  );
  // v2 and v3 must list them, even when empty.
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).cardio_sessions;
  }, /data\.cardio_sessions: a v4/);
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).cardio_sessions;
    return { ...b, version: 2 };
  }, /data\.cardio_sessions: a v2/);
  assert.deepEqual(
    parseBackup({ ...validBackup(), data: { ...validBackup().data, cardio_sessions: [] } }).data
      .cardio_sessions,
    [],
  );
});

test('backup validation checks cardio values, links and external ids (#114)', () => {
  rejects((b) => {
    b.data.cardio_sessions[0].workout_id = 404;
  }, /cardio_sessions\[0\].*workout 404/);
  rejects((b) => {
    b.data.cardio_sessions.push({ ...b.data.cardio_sessions[0], id: 5 });
  }, /Duplicate cardio record with the same source and external ID.*garmin \/ g-1/);
  rejects((b) => {
    b.data.cardio_sessions.push({ ...b.data.cardio_sessions[0] });
  }, /cardio_sessions.*duplicate id 4/);
  rejects((b) => {
    b.data.cardio_sessions[0].duration_sec = 0;
  }, /cardio_sessions\.0\.duration_sec/);
  rejects((b) => {
    b.data.cardio_sessions[0].max_heart_rate = 120;
  }, /Max heart rate cannot be lower than average/);
  rejects((b) => {
    b.data.cardio_sessions[0].source = 'manual';
  }, /external ID.*manual/);
  rejects((b) => {
    b.data.cardio_sessions[0].kind = 'skiing';
  }, /cardio_sessions\.0\.kind/);
  // Two manual sessions without external ids are not duplicates.
  const backup = validBackup();
  const manual = { ...backup.data.cardio_sessions[0], source: 'manual', external_id: null };
  backup.data.cardio_sessions = [manual, { ...manual, id: 5, workout_id: null }];
  assert.equal(parseBackup(backup).data.cardio_sessions.length, 2);
});

test('backup validation accepts a well-formed backup', () => {
  const parsed = parseBackup(validBackup());
  assert.equal(parsed.data.workouts[0].sets[0].weight, 100.25);
  assert.equal(parsed.data.machines[0].base_weight, null);
});

test('backups without workout feedback stay valid and keep it null (#83)', () => {
  const parsed = parseBackup(validBackup());
  assert.equal(parsed.data.workouts[0].feedback, null);
  const backup = validBackup();
  (backup.data.workouts[0] as { feedback?: string }).feedback = 'easy';
  assert.equal(parseBackup(backup).data.workouts[0].feedback, 'easy');
  rejects((b) => {
    (b.data.workouts[0] as { feedback?: string }).feedback = 'tired';
  }, /workouts\.0\.feedback/);
});

test('backups without the single-joint flag restore machines as not single-joint (#84)', () => {
  assert.equal(parseBackup(validBackup()).data.machines[0].single_joint, false);
  rejects((b) => {
    (b.data.machines[0] as { single_joint?: unknown }).single_joint = 'yes';
  }, /machines\.0\.single_joint/);
});

test('backup validation rejects other files and unsupported versions first', () => {
  rejects(() => 'not an object', /Not a Workout Memo backup file/);
  rejects(() => [], /Not a Workout Memo backup file/);
  rejects((b) => ({ ...b, format: 'other-app' }), /Not a Workout Memo backup file/);
  rejects(
    (b) => ({ ...b, version: 5 }),
    /Unsupported backup version.*v5.*Supported versions: v1, v2, v3, v4/,
  );
  rejects((b) => ({ ...b, version: '1' }), /Unsupported backup version/);
});

test('backup validation rejects broken references, duplicate ids and invalid values', () => {
  rejects((b) => {
    b.data.machines[0].brand_id = 77;
  }, /machines\[0\].*brand 77/);
  rejects((b) => {
    b.data.workouts[0].sets[0].machine_id = 404;
  }, /workouts\[0\]\.sets\[0\].*machine 404/);
  rejects((b) => {
    b.data.workouts.push({ ...b.data.workouts[0] });
  }, /workouts.*duplicate id 9/);
  rejects((b) => {
    b.data.brands.push({ id: 2, name: 'Arsenal Strength' });
  }, /Brand name is duplicated/);
  rejects((b) => {
    b.data.machines.push({ ...b.data.machines[0], id: 6 });
  }, /Duplicate machine name within the same brand/);
  rejects((b) => {
    b.data.workouts[0].date = '2024-02-30';
  }, /workouts\.0\.date/);
  rejects((b) => {
    b.data.workouts[0].sets[0].reps = 0;
  }, /reps/);
  rejects((b) => {
    b.data.goals[0].deadline = '2024-01-01';
  }, /goal end date/);
  rejects((b) => {
    (b.data.routines[0].plan as { split_count: number }).split_count = 4;
  }, /number of splits/);
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).goals;
  }, /data\.goals/);
  // #82: a routine plan may name a machine, which must be in the same backup.
  rejects((b) => {
    (b.data.routines[0].plan.splits[0].exercises[0] as { machine_id?: number }).machine_id = 404;
  }, /routines\[0\].*machine 404/);
});

test('backup validation accepts a routine that names a machine in the backup (#82)', () => {
  const backup = validBackup();
  (backup.data.routines[0].plan.splits[0].exercises[0] as { machine_id?: number }).machine_id = 5;
  assert.equal(parseBackup(backup).data.routines[0].plan.splits[0].exercises[0].machine_id, 5);
});

test('a v3 backup carries cardio goals; v1 and v2 backups restore as ones without any (#253)', () => {
  assert.equal(backupVersion, 4);
  const parsed = parseBackup(validBackup());
  assert.equal(parsed.version, 4);
  assert.deepEqual(parsed.data.cardio_goals, validBackup().data.cardio_goals);
  // v3 must list them, even when empty.
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).cardio_goals;
  }, /data\.cardio_goals: a v4 backup needs a cardio goals list/);
  // Both missing lists are reported at once.
  rejects((b) => {
    delete (b.data as Partial<typeof b.data>).cardio_goals;
    delete (b.data as Partial<typeof b.data>).cardio_sessions;
  }, /data\.cardio_sessions: a v4 .* \/ data\.cardio_goals: a v4/);
  assert.deepEqual(
    parseBackup({ ...validBackup(), data: { ...validBackup().data, cardio_goals: [] } }).data
      .cardio_goals,
    [],
  );
  // Older files predate cardio goals: none restored, and a stray (even broken) list is ignored.
  for (const version of [1, 2]) {
    const { cardio_goals: _goals, ...older } = validBackup().data;
    assert.deepEqual(parseBackup({ ...validBackup(), version, data: older }).data.cardio_goals, []);
    const broken = { ...validBackup().data, cardio_goals: [{ goal_type: 'marathon' }] };
    assert.deepEqual(
      parseBackup({ ...validBackup(), version, data: broken }).data.cardio_goals,
      [],
    );
  }
});

test('backup validation checks cardio goals with the API rules and unique ids (#253)', () => {
  // A record goal needs a kind; a period total needs a period; targets of other types are null.
  rejects((b) => {
    b.data.cardio_goals[0] = {
      ...b.data.cardio_goals[0],
      goal_type: 'record_time',
      kind: null,
      period: null,
      target_duration_sec: 1800,
    };
  }, /cardio_goals\.0\.kind: Choose one exercise type for a record goal/);
  rejects((b) => {
    b.data.cardio_goals[0].period = null;
  }, /cardio_goals\.0\.period/);
  rejects((b) => {
    b.data.cardio_goals[0].target_count = 3;
  }, /cardio_goals\.0\.target_count/);
  // The five-year span of the API also holds in a backup.
  rejects((b) => {
    b.data.cardio_goals[0].deadline = '2029-02-06';
  }, /cardio_goals\.0\.deadline: Keep the goal period to 5 years/);
  rejects((b) => {
    b.data.cardio_goals.push({ ...b.data.cardio_goals[0] });
  }, /cardio_goals: duplicate id 6/);
});
