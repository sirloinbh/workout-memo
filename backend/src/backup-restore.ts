import type { PoolClient } from 'pg';

import type { Backup, BodyRow, CardioBackupRow, CardioGoalBackupRow } from './backup-schema.js';
import { insertSets } from './store/workouts.js';

const tables = [
  'brands',
  'machines',
  'workouts',
  'sets',
  'goals',
  'routines',
  'cardio_sessions',
  'cardio_goals',
  'body_measurements',
  'exercise_body_parts',
  'exercise_weight_steps',
  'routine_rests',
] as const;
type Counts = { added: number; skipped: number; conflicts: number; deleted: number };
export type RestoreSummary = {
  mode: 'merge' | 'replace';
  dry_run: boolean;
  tables: Record<(typeof tables)[number], Counts>;
  conflicts: string[];
  // Replace only: retry keys removed so an old key cannot replay a deleted workout id.
  retry_keys_cleared: number;
};

export const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
// jsonb reorders keys, so routine plans are compared in a canonical key order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
// Multiset of existing rows: each identical existing row absorbs one incoming row, so
// repeated restores add nothing while two genuinely identical sessions both survive.
// take() returns the absorbing row's id (0 when not tracked), or undefined when none is left.
class Seen {
  private ids = new Map<string, number[]>();
  add(key: string, id = 0) {
    const list = this.ids.get(key);
    if (list) list.push(id);
    else this.ids.set(key, [id]);
  }
  take(key: string) {
    return this.ids.get(key)?.shift();
  }
}
const workoutKey = (
  w: { date: string; title: string; notes: string },
  sets: {
    exercise: string;
    machine_id: number | null;
    weight: number;
    reps: number;
    notes: string;
    completed: boolean;
    rpe: number | null;
  }[],
) =>
  JSON.stringify([
    w.date,
    w.title,
    w.notes,
    sets.map((s) => [s.exercise, s.machine_id, s.weight, s.reps, s.notes, s.completed, s.rpe]),
  ]);

export async function restore(client: PoolClient, backup: Backup, mode: 'merge' | 'replace') {
  const summary: RestoreSummary = {
    mode,
    dry_run: true,
    tables: Object.fromEntries(
      tables.map((t) => [t, { added: 0, skipped: 0, conflicts: 0, deleted: 0 }]),
    ) as RestoreSummary['tables'],
    conflicts: [],
    retry_keys_cleared: 0,
  };
  const t = summary.tables;
  // Readers continue; concurrent writers wait so the preview/restore sees a stable state.
  await client.query(
    'LOCK TABLE brands, machines, workouts, sets, goals, routines, cardio_sessions, cardio_goals, body_measurements, exercise_body_parts, exercise_weight_steps, routine_rests IN EXCLUSIVE MODE',
  );
  // #359: only a v4 file carries these tables, so only a v4 replace clears them.
  const v4Tables = ['body_measurements', 'exercise_body_parts', 'exercise_weight_steps'] as const;
  if (mode === 'replace') {
    for (const table of tables)
      if (backup.version >= 4 || !(table === 'routine_rests' || v4Tables.some((v) => v === table)))
        t[table].deleted = (await client.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
    // Locked last, after the data tables, matching the order a workout save takes them.
    await client.query('LOCK TABLE workout_requests IN EXCLUSIVE MODE');
    // A kept key would replay {id} of a workout deleted here, so a client whose response
    // was lost would wrongly believe its save exists. Clear keys in the same transaction;
    // a retry after the replace is then stored as a new workout.
    summary.retry_keys_cleared = (await client.query('DELETE FROM workout_requests')).rowCount ?? 0;
    // Sets are removed by ON DELETE CASCADE.
    // #253 (B2): cardio goals are replaced too, so an older file without them leaves none.
    for (const table of [
      'cardio_goals',
      'cardio_sessions',
      'workouts',
      'goals',
      'routines',
      'machines',
      'brands',
      ...(backup.version >= 4 ? v4Tables : []),
    ])
      await client.query(`DELETE FROM ${table}`);
  }

  const brandMap = new Map<number, number>();
  const brandsByName = new Map<string, number>(
    (await client.query('SELECT id, name FROM brands')).rows.map((r) => [r.name, r.id]),
  );
  for (const b of backup.data.brands) {
    const existing = brandsByName.get(b.name);
    if (existing !== undefined) {
      brandMap.set(b.id, existing);
      t.brands.skipped++;
      continue;
    }
    const inserted = (
      await client.query('INSERT INTO brands(name) VALUES($1) RETURNING id', [b.name])
    ).rows[0].id;
    brandsByName.set(b.name, inserted);
    brandMap.set(b.id, inserted);
    t.brands.added++;
  }

  // #359: official_machine_weights is seeded reference data; a link to a row this database
  // does not have is dropped instead of failing the restore.
  const officialIds = new Set<number>(
    (await client.query('SELECT id FROM official_machine_weights')).rows.map((r) => r.id),
  );
  const machineMap = new Map<number, number>();
  const machines = new Map<string, { id: number; base_weight: number | null; notes: string }>();
  for (const r of (
    await client.query('SELECT id, brand_id, name, base_weight, notes FROM machines')
  ).rows)
    machines.set(r.brand_id + '\u0000' + r.name, { ...r, base_weight: num(r.base_weight) });
  const brandName = new Map(backup.data.brands.map((b) => [b.id, b.name]));
  for (const m of backup.data.machines) {
    const brandId = brandMap.get(m.brand_id)!;
    const existing = machines.get(brandId + '\u0000' + m.name);
    if (existing) {
      machineMap.set(m.id, existing.id);
      if (existing.base_weight === m.base_weight && existing.notes === m.notes)
        t.machines.skipped++;
      else {
        // Never overwrite: the existing machine is kept and restored sets link to it.
        t.machines.conflicts++;
        if (summary.conflicts.length < 20)
          summary.conflicts.push(
            `${brandName.get(m.brand_id)} / ${m.name}: existing value kept (base weight ${existing.base_weight ?? 'unconfirmed'}kg, backup ${m.base_weight ?? 'unconfirmed'}kg)`,
          );
      }
      continue;
    }
    const inserted = (
      await client.query(
        'INSERT INTO machines(brand_id,name,base_weight,notes,single_joint,official_weight_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          brandId,
          m.name,
          m.base_weight,
          m.notes,
          m.single_joint,
          m.official_weight_id !== null && officialIds.has(m.official_weight_id)
            ? m.official_weight_id
            : null,
        ],
      )
    ).rows[0].id;
    machines.set(brandId + '\u0000' + m.name, {
      id: inserted,
      base_weight: m.base_weight,
      notes: m.notes,
    });
    machineMap.set(m.id, inserted);
    t.machines.added++;
  }

  const seenWorkouts = new Seen();
  const existingWorkouts = await client.query(
    `SELECT w.id, w.date, w.title, w.notes, COALESCE(json_agg(json_build_object('exercise',s.exercise,'machine_id',s.machine_id,'weight',s.weight,'reps',s.reps,'notes',s.notes,'completed',s.completed,'rpe',s.rpe) ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id GROUP BY w.id`,
  );
  for (const r of existingWorkouts.rows) seenWorkouts.add(workoutKey(r, r.sets), r.id);
  // Backup workout id → the restored or matched existing workout, for cardio links (#114).
  const workoutMap = new Map<number, number>();
  for (const w of backup.data.workouts) {
    const sets = w.sets.map((s) => ({
      ...s,
      machine_id: s.machine_id === null ? null : machineMap.get(s.machine_id)!,
    }));
    const matched = seenWorkouts.take(workoutKey(w, sets));
    if (matched !== undefined) {
      workoutMap.set(w.id, matched);
      t.workouts.skipped++;
      t.sets.skipped += sets.length;
      continue;
    }
    // Restored workouts are new records: version starts at 1, created_at is preserved.
    const workoutId = (
      await client.query(
        'INSERT INTO workouts(date,title,notes,feedback,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [w.date, w.title, w.notes, w.feedback, w.created_at],
      )
    ).rows[0].id;
    workoutMap.set(w.id, workoutId);
    await insertSets(client, workoutId, sets);
    t.workouts.added++;
    t.sets.added += sets.length;
  }

  await restoreCardio(client, backup.data.cardio_sessions, workoutMap, summary);

  const goalKey = (g: {
    exercise: string;
    target_weight: unknown;
    target_reps: number;
    start_date: string;
    deadline: string;
  }) =>
    JSON.stringify([g.exercise, Number(g.target_weight), g.target_reps, g.start_date, g.deadline]);
  const seenGoals = new Seen();
  for (const r of (await client.query('SELECT * FROM goals')).rows) seenGoals.add(goalKey(r));
  for (const g of backup.data.goals) {
    if (seenGoals.take(goalKey(g)) !== undefined) {
      t.goals.skipped++;
      continue;
    }
    await client.query(
      'INSERT INTO goals(exercise,target_weight,target_reps,start_date,deadline) VALUES($1,$2,$3,$4,$5)',
      [g.exercise, g.target_weight, g.target_reps, g.start_date, g.deadline],
    );
    t.goals.added++;
  }

  // #253: like strength goals, a goal identical in every value is skipped, otherwise added.
  const seenCardioGoals = new Seen();
  for (const r of (await client.query(`SELECT ${cardioGoalValues} FROM cardio_goals`)).rows)
    seenCardioGoals.add(cardioGoalKey(r));
  for (const g of backup.data.cardio_goals) {
    if (seenCardioGoals.take(cardioGoalKey(g)) !== undefined) {
      t.cardio_goals.skipped++;
      continue;
    }
    await client.query(
      'INSERT INTO cardio_goals(goal_type,kind,period,target_distance_km,target_duration_sec,target_count,start_date,deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        g.goal_type,
        g.kind,
        g.period,
        g.target_distance_km,
        g.target_duration_sec,
        g.target_count,
        g.start_date,
        g.deadline,
      ],
    );
    t.cardio_goals.added++;
  }

  const seenRoutines = new Seen();
  for (const r of (await client.query('SELECT id, plan FROM routines')).rows)
    seenRoutines.add(canonical(r.plan), r.id);
  // Backup routine id → the restored or matched existing routine, for rest days (#359).
  const routineMap = new Map<number, number>();
  for (const r of backup.data.routines) {
    // Machine ids in a plan point to the restored (or matched existing) machines (#82).
    const plan = {
      ...r.plan,
      splits: r.plan.splits.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) =>
          e.machine_id == null ? e : { ...e, machine_id: machineMap.get(e.machine_id)! },
        ),
      })),
    };
    const matched = seenRoutines.take(canonical(plan));
    if (matched !== undefined) {
      routineMap.set(r.id, matched);
      t.routines.skipped++;
      continue;
    }
    const routineId = (
      await client.query(
        'INSERT INTO routines(plan, created_at) VALUES($1::jsonb, $2) RETURNING id',
        [JSON.stringify(plan), r.created_at],
      )
    ).rows[0].id;
    routineMap.set(r.id, routineId);
    t.routines.added++;
  }

  // #359: rest days follow their routine; a day already marked is skipped.
  for (const r of backup.data.routine_rests) {
    const added = await client.query(
      'INSERT INTO routine_rests(routine_id, rest_date) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [routineMap.get(r.routine_id)!, r.rest_date],
    );
    if (added.rowCount) t.routine_rests.added++;
    else t.routine_rests.skipped++;
  }

  // Body records are unique per date: an existing date is kept, and a different value is a conflict.
  const bodyByDate = new Map<string, string>();
  const bodyKey = (m: Omit<BodyRow, 'id' | 'created_at' | 'updated_at'>) =>
    JSON.stringify([m.body_weight_kg, m.body_fat_percent, m.skeletal_muscle_kg]);
  for (const r of (
    await client.query(
      'SELECT date, body_weight_kg::float8 body_weight_kg, body_fat_percent::float8 body_fat_percent, skeletal_muscle_kg::float8 skeletal_muscle_kg FROM body_measurements',
    )
  ).rows)
    bodyByDate.set(r.date, bodyKey(r));
  for (const m of backup.data.body_measurements) {
    const existing = bodyByDate.get(m.date);
    if (existing !== undefined) {
      if (existing === bodyKey(m)) t.body_measurements.skipped++;
      else {
        t.body_measurements.conflicts++;
        if (summary.conflicts.length < 20)
          summary.conflicts.push(`Body record ${m.date}: existing value kept`);
      }
      continue;
    }
    await client.query(
      'INSERT INTO body_measurements(date,body_weight_kg,body_fat_percent,skeletal_muscle_kg,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)',
      [
        m.date,
        m.body_weight_kg,
        m.body_fat_percent,
        m.skeletal_muscle_kg,
        m.created_at,
        m.updated_at,
      ],
    );
    bodyByDate.set(m.date, bodyKey(m));
    t.body_measurements.added++;
  }

  for (const r of backup.data.exercise_body_parts) {
    const added = await client.query(
      'INSERT INTO exercise_body_parts(exercise, body_part) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [r.exercise, r.body_part],
    );
    if (added.rowCount) t.exercise_body_parts.added++;
    else t.exercise_body_parts.skipped++;
  }

  const stepByExercise = new Map<string, number>(
    (
      await client.query(
        'SELECT exercise, weight_step::float8 weight_step FROM exercise_weight_steps',
      )
    ).rows.map((r) => [r.exercise, r.weight_step]),
  );
  for (const r of backup.data.exercise_weight_steps) {
    const existing = stepByExercise.get(r.exercise);
    if (existing !== undefined) {
      if (existing === r.weight_step) t.exercise_weight_steps.skipped++;
      else {
        t.exercise_weight_steps.conflicts++;
        if (summary.conflicts.length < 20)
          summary.conflicts.push(
            `${r.exercise}: existing weight step kept (${existing}kg, backup ${r.weight_step}kg)`,
          );
      }
      continue;
    }
    await client.query('INSERT INTO exercise_weight_steps(exercise, weight_step) VALUES($1,$2)', [
      r.exercise,
      r.weight_step,
    ]);
    t.exercise_weight_steps.added++;
  }
  return summary;
}

// #253: cardio goal values as the backup stores them (distance as a JSON number).
export const cardioGoalValues = `goal_type, kind, period, target_distance_km::float8 target_distance_km,
  target_duration_sec, target_count, start_date, deadline`;
const cardioGoalKey = (g: Omit<CardioGoalBackupRow, 'id'>) =>
  JSON.stringify([
    g.goal_type,
    g.kind,
    g.period,
    g.target_distance_km,
    g.target_duration_sec,
    g.target_count,
    g.start_date,
    g.deadline,
  ]);

// Cardio identity for merge (#114). The workout link is not part of it (like a workout's
// feedback): a session that differs only in its link is the same session; the existing row stays.
export const cardioValues = `date, to_char(start_time, 'HH24:MI') start_time, kind, duration_sec,
  distance_km::float8 distance_km, avg_heart_rate, max_heart_rate, calories_kcal, elevation_gain_m,
  avg_cadence, effort, source, external_id, memo`;
type CardioKeyed = Omit<CardioBackupRow, 'id' | 'created_at' | 'workout_id'>;
const cardioKey = (c: CardioKeyed) =>
  JSON.stringify([
    c.date,
    c.start_time,
    c.kind,
    c.duration_sec,
    c.distance_km,
    c.avg_heart_rate,
    c.max_heart_rate,
    c.calories_kcal,
    c.elevation_gain_m,
    c.avg_cadence,
    c.effort,
    c.source,
    c.external_id,
    c.memo,
  ]);

// Imported sessions are matched by (source, external_id): the same id with other values is a
// conflict and the existing row is kept. Sessions without an external id are matched by
// content like workouts. Links point to the restored (or matched existing) workout.
async function restoreCardio(
  client: PoolClient,
  sessions: CardioBackupRow[],
  workoutMap: Map<number, number>,
  summary: RestoreSummary,
) {
  const t = summary.tables.cardio_sessions;
  const seen = new Seen();
  const byExternal = new Map<string, string>();
  const external = (c: { source: string; external_id: string | null }) =>
    c.external_id === null ? null : c.source + '\u0000' + c.external_id;
  for (const r of (await client.query(`SELECT ${cardioValues} FROM cardio_sessions`)).rows) {
    const ext = external(r);
    if (ext === null) seen.add(cardioKey(r));
    else byExternal.set(ext, cardioKey(r));
  }
  for (const c of sessions) {
    const key = cardioKey(c);
    const ext = external(c);
    if (ext !== null && byExternal.has(ext)) {
      if (byExternal.get(ext) === key) t.skipped++;
      else {
        t.conflicts++;
        if (summary.conflicts.length < 20)
          summary.conflicts.push(
            `Cardio ${c.date} ${c.source} / ${c.external_id}: existing value kept (same external ID, different content)`,
          );
      }
      continue;
    }
    if (ext === null && seen.take(key) !== undefined) {
      t.skipped++;
      continue;
    }
    await client.query(
      'INSERT INTO cardio_sessions(date,start_time,kind,duration_sec,distance_km,avg_heart_rate,max_heart_rate,calories_kcal,elevation_gain_m,avg_cadence,effort,workout_id,source,external_id,memo,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
      [
        c.date,
        c.start_time,
        c.kind,
        c.duration_sec,
        c.distance_km,
        c.avg_heart_rate,
        c.max_heart_rate,
        c.calories_kcal,
        c.elevation_gain_m,
        c.avg_cadence,
        c.effort,
        c.workout_id === null ? null : workoutMap.get(c.workout_id)!,
        c.source,
        c.external_id,
        c.memo,
        c.created_at,
      ],
    );
    if (ext !== null) byExternal.set(ext, key);
    t.added++;
  }
}
