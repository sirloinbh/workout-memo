import express from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import {
  cardioGoalObject,
  cardioSessionObject,
  checkCardioGoal,
  checkCardioSession,
  date,
  feedbackLevels,
  limitLength,
  routineSchema,
} from './domain.js';
import { cardioPaceSql, cardioSpeedSql } from './routes/cardio.js';
import { insertSets } from './routes/workouts.js';
import { auditContext, writeAudit } from './standard/audit.js';
import { inTransaction } from './transaction.js';

// Two deliberately separate artifacts (#33):
// - analysis CSV: one row per set for spreadsheets; lossy (formula guard) and never restorable.
// - restore backup: versioned JSON that keeps every relationship and is validated before use.
export const backupFormat = 'workout-memo-backup';
// v2 (#114) adds data.cardio_sessions. A v1 file is still restored, as a backup without cardio.
// v3 (#253) adds data.cardio_goals. v1 and v2 files restore as backups without cardio goals; an
// app older than v3 cannot restore a v3 file (2026-11-08 user decision B1).
// v4 (#359) adds set completion and RPE, body measurements, body-part mappings, weight steps,
// routine rests, and machines' official-weight links. A v1-v3 file restores as before: the tables
// it does not carry are left untouched, even by "Replace all".
export const backupVersion = 4;
const supportedBackupVersions = [1, 2, 3, 4] as const;
const backupMaxBytes = 10 * 1024 * 1024;
const replaceConfirmation = 'Replace all';

export class BackupInvalid extends Error {}

// A spreadsheet runs text that starts with these characters as a formula (CSV injection).
const formulaStart = /^[=+\-@\t\r]/;
export function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && formulaStart.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  String.fromCharCode(0xfeff) + rows.map((row) => row.map(csvCell).join(',') + '\r\n').join('');

const csvColumns = [
  'workout_id',
  'date',
  'title',
  'workout_notes',
  'set_number',
  'exercise',
  'weight_kg',
  'reps',
  'volume_kg',
  'set_notes',
  'machine_id',
  'brand',
  'machine_name',
  'machine_base_weight_kg',
  // #83: appended so existing column positions stay the same.
  'workout_feedback',
];

// #114: cardio sessions get their own CSV; the workouts CSV above keeps its columns.
const cardioCsvColumns = [
  'cardio_id',
  'date',
  'start_time',
  'kind',
  'duration_sec',
  'distance_km',
  'pace_sec_per_km',
  'speed_kmh',
  'avg_heart_rate',
  'max_heart_rate',
  'calories_kcal',
  'elevation_gain_m',
  'avg_cadence',
  'effort',
  'workout_id',
  'source',
  'external_id',
  'memo',
];

const id = z.number().int().positive();
const kg = z.number().min(0).max(99999);
const name = limitLength(z.string().trim(), { min: 1, max: 120 });
const notes = (max: number) => limitLength(z.string(), { max });
const timestamp = z.iso.datetime({ offset: true });
// The same field and cross-field rules as the cardio API, except "not after today": a backup
// restores what was recorded, and the DB cannot check the date against today either.
const cardioRow = cardioSessionObject
  .extend({ id, created_at: timestamp })
  .superRefine(checkCardioSession);
// #253: the same rules as POST /api/cardio-goals, five-year span included.
const cardioGoalRow = cardioGoalObject.extend({ id }).superRefine(checkCardioGoal);
// #359: the same limits as the database columns.
const rpe = z
  .number()
  .min(1)
  .max(10)
  .refine((v) => Number.isInteger(v * 2), 'RPE goes in steps of 0.5');
const bodyMeasurementRow = z
  .object({
    id,
    date,
    body_weight_kg: z.number().positive().max(999.99).nullable(),
    body_fat_percent: z.number().min(0).max(100).nullable(),
    skeletal_muscle_kg: z.number().positive().max(999.99).nullable(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .refine(
    (m) =>
      m.body_weight_kg !== null || m.body_fat_percent !== null || m.skeletal_muscle_kg !== null,
    'A body record needs at least one value',
  );
// The body-part names the database accepts (migration 014).
const bodyParts = [
  '\uAC00\uC2B4',
  '\uB4F1',
  '\uC5B4\uAE68',
  '\uD314',
  '\uC774\uB450',
  '\uC0BC\uB450',
  '\uD558\uCCB4-\uC55E',
  '\uD558\uCCB4-\uB4A4',
  '\uBCF5\uADFC',
] as const;
const backupSchema = z.object({
  format: z.literal(backupFormat),
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  exported_at: timestamp,
  data: z
    .object({
      brands: z.array(z.object({ id, name })).max(1000),
      machines: z
        .array(
          z.object({
            id,
            brand_id: id,
            name,
            base_weight: kg.nullable(),
            notes: notes(2000),
            // #84: backups made before single-joint machines have no field.
            single_joint: z.boolean().default(false),
            // #359: the official-weight link; backups made before v4 have none.
            official_weight_id: id.nullable().default(null),
          }),
        )
        .max(5000),
      workouts: z
        .array(
          z.object({
            id,
            date,
            title: name,
            notes: notes(4000),
            // #83: backups made before workout feedback have no field; it stays NULL.
            feedback: z.enum(feedbackLevels).nullable().default(null),
            created_at: timestamp,
            sets: z
              .array(
                z.object({
                  exercise: name,
                  machine_id: id.nullable(),
                  weight: kg,
                  reps: z.number().int().min(1).max(1000),
                  notes: notes(4000),
                  // #359: backups made before v4 lack these; a set was then always performed.
                  completed: z.boolean().default(true),
                  rpe: rpe.nullable().default(null),
                }),
              )
              .max(200),
          }),
        )
        .max(20000),
      goals: z
        .array(
          z
            .object({
              id,
              exercise: name,
              target_weight: kg,
              target_reps: z.number().int().min(1).max(1000),
              start_date: date,
              deadline: date,
            })
            .refine((g) => g.deadline >= g.start_date, 'Check the goal end date'),
        )
        .max(5000),
      routines: z.array(z.object({ id, created_at: timestamp, plan: routineSchema })).max(1000),
      // #114: required in v2 (checked in parseBackup); a v1 file has none.
      cardio_sessions: z.array(cardioRow).max(50000).optional(),
      // #253: required in v3 (checked in parseBackup); v1 and v2 files have none.
      cardio_goals: z.array(cardioGoalRow).max(5000).optional(),
      // #359: required in v4 (checked in parseBackup); older files have none.
      body_measurements: z.array(bodyMeasurementRow).max(50000).optional(),
      exercise_body_parts: z
        .array(z.object({ exercise: name, body_part: z.enum(bodyParts) }))
        .max(20000)
        .optional(),
      exercise_weight_steps: z
        .array(z.object({ exercise: name, weight_step: z.number().positive().max(100) }))
        .max(5000)
        .optional(),
      routine_rests: z
        .array(z.object({ routine_id: id, rest_date: date }))
        .max(50000)
        .optional(),
    })
    .superRefine((data, ctx) => {
      const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
      for (const table of [
        'brands',
        'machines',
        'workouts',
        'goals',
        'routines',
        'cardio_sessions',
        'cardio_goals',
        'body_measurements',
      ] as const) {
        const seen = new Set<number>();
        for (const row of data[table] ?? []) {
          if (seen.has(row.id)) issue(`${table}: duplicate id ${row.id}`);
          seen.add(row.id);
        }
      }
      const brandIds = new Set(data.brands.map((b) => b.id));
      if (new Set(data.brands.map((b) => b.name)).size !== data.brands.length)
        issue('Brand name is duplicated');
      const machineIds = new Set(data.machines.map((m) => m.id));
      const machineKeys = new Set<string>();
      data.machines.forEach((m, i) => {
        if (!brandIds.has(m.brand_id))
          issue(`machines[${i}]: references brand ${m.brand_id} that is not in the backup`);
        const key = m.brand_id + '\u0000' + m.name;
        if (machineKeys.has(key)) issue(`Duplicate machine name within the same brand: ${m.name}`);
        machineKeys.add(key);
      });
      data.workouts.forEach((w, i) =>
        w.sets.forEach((s, j) => {
          if (s.machine_id !== null && !machineIds.has(s.machine_id))
            issue(
              `workouts[${i}].sets[${j}]: references machine ${s.machine_id} that is not in the backup`,
            );
        }),
      );
      const workoutIds = new Set(data.workouts.map((w) => w.id));
      const externalIds = new Set<string>();
      (data.cardio_sessions ?? []).forEach((c, i) => {
        if (c.workout_id !== null && !workoutIds.has(c.workout_id))
          issue(
            `cardio_sessions[${i}]: references workout ${c.workout_id} that is not in the backup`,
          );
        if (c.external_id === null) return;
        const key = c.source + '\u0000' + c.external_id;
        if (externalIds.has(key))
          issue(
            `Duplicate cardio record with the same source and external ID: ${c.source} / ${c.external_id}`,
          );
        externalIds.add(key);
      });
      const dupes = (table: string, keys: string[]) => {
        const seen = new Set<string>();
        for (const k of keys) {
          if (seen.has(k)) issue(`${table}: duplicate entry ${k.replace('\u0000', ' / ')}`);
          seen.add(k);
        }
      };
      dupes(
        'body_measurements',
        (data.body_measurements ?? []).map((m) => m.date),
      );
      dupes(
        'exercise_body_parts',
        (data.exercise_body_parts ?? []).map((r) => r.exercise + '\u0000' + r.body_part),
      );
      dupes(
        'exercise_weight_steps',
        (data.exercise_weight_steps ?? []).map((r) => r.exercise),
      );
      dupes(
        'routine_rests',
        (data.routine_rests ?? []).map((r) => r.routine_id + '\u0000' + r.rest_date),
      );
      const routineIds = new Set(data.routines.map((r) => r.id));
      (data.routine_rests ?? []).forEach((r, i) => {
        if (!routineIds.has(r.routine_id))
          issue(
            `routine_rests[${i}]: references routine ${r.routine_id} that is not in the backup`,
          );
      });
      data.routines.forEach((r, i) =>
        r.plan.splits.forEach((s) =>
          s.exercises.forEach((e) => {
            if (e.machine_id != null && !machineIds.has(e.machine_id))
              issue(`routines[${i}]: references machine ${e.machine_id} that is not in the backup`);
          }),
        ),
      );
    }),
});
type ParsedBackup = z.infer<typeof backupSchema>;
type BodyRow = Backup['data']['body_measurements'][number];
type CardioBackupRow = NonNullable<ParsedBackup['data']['cardio_sessions']>[number];
type CardioGoalBackupRow = NonNullable<ParsedBackup['data']['cardio_goals']>[number];
// #359: the lists a v4 file carries and an older file does not.
const v4Lists = [
  'body_measurements',
  'exercise_body_parts',
  'exercise_weight_steps',
  'routine_rests',
] as const;
type V4List = (typeof v4Lists)[number];
// After parseBackup every backup has cardio_sessions (empty for a v1 file), cardio_goals
// (empty for v1 and v2 files) and the v4 lists (empty for older files).
export type Backup = Omit<ParsedBackup, 'data'> & {
  data: Omit<ParsedBackup['data'], 'cardio_sessions' | 'cardio_goals' | V4List> & {
    cardio_sessions: CardioBackupRow[];
    cardio_goals: CardioGoalBackupRow[];
  } & { [K in V4List]: NonNullable<ParsedBackup['data'][K]> };
};

export function parseBackup(value: unknown): Backup {
  const head = value as { format?: unknown; version?: unknown } | null;
  if (typeof head !== 'object' || head === null || Array.isArray(head))
    throw new BackupInvalid('Not a Workout Memo backup file');
  if (head.format !== backupFormat)
    throw new BackupInvalid('Not a Workout Memo backup file (CSV for analysis cannot be restored)');
  if (!(supportedBackupVersions as readonly unknown[]).includes(head.version))
    throw new BackupInvalid(
      `Unsupported backup version (v${String(head.version)}). Supported versions: ${supportedBackupVersions.map((v) => 'v' + v).join(', ')}`,
    );
  // v1 predates cardio sessions (#114) and v1·v2 predate cardio goals (#253): such stray keys in
  // an older file are ignored, not validated, so they never make an otherwise valid restore fail.
  const input = (() => {
    const file = value as { version?: unknown; data?: unknown };
    if (file.version === 4 || typeof file.data !== 'object' || file.data === null) return value;
    const rest = { ...(file.data as Record<string, unknown>) };
    for (const list of v4Lists) delete rest[list];
    if (file.version === 3) return { ...file, data: rest };
    delete rest.cardio_goals;
    if (file.version === 1) delete rest.cardio_sessions;
    return { ...file, data: rest };
  })();
  const parsed = backupSchema.safeParse(input);
  if (parsed.success) {
    // Both missing lists are reported together so one fix is enough.
    const { version, data } = parsed.data;
    const missing = [
      version >= 2 && !data.cardio_sessions
        ? `data.cardio_sessions: a v${version} backup needs a cardio records list`
        : null,
      version >= 3 && !data.cardio_goals
        ? `data.cardio_goals: a v${version} backup needs a cardio goals list`
        : null,
      ...(version === 4
        ? v4Lists
            .filter((list) => !data[list])
            .map((list) => `data.${list}: a v4 backup needs this list`)
        : []),
    ].filter((m) => m !== null);
    if (missing.length)
      throw new BackupInvalid('Backup validation failed — ' + missing.join(' / '));
  }
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((x) => {
      const path = x.path.join('.');
      return path ? `${path}: ${x.message}` : x.message;
    });
    throw new BackupInvalid('Backup validation failed — ' + issues.join(' / '));
  }
  const { data, version } = parsed.data;
  // v1 predates cardio sessions (#114): it restores as a backup without any.
  return {
    ...parsed.data,
    data: {
      ...data,
      cardio_sessions: version === 1 ? [] : (data.cardio_sessions ?? []),
      // #253: v1 and v2 predate cardio goals.
      cardio_goals: version >= 3 ? (data.cardio_goals ?? []) : [],
      // #359: older files carry none of these.
      body_measurements: data.body_measurements ?? [],
      exercise_body_parts: data.exercise_body_parts ?? [],
      exercise_weight_steps: data.exercise_weight_steps ?? [],
      routine_rests: data.routine_rests ?? [],
    },
  };
}

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

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
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

async function restore(client: PoolClient, backup: Backup, mode: 'merge' | 'replace') {
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
const cardioGoalValues = `goal_type, kind, period, target_distance_km::float8 target_distance_km,
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
const cardioValues = `date, to_char(start_time, 'HH24:MI') start_time, kind, duration_sec,
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

// One consistent snapshot across all tables.
const snapshot = <T>(pool: Pool, read: (client: PoolClient) => Promise<T>) =>
  inTransaction(pool, read, { setup: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY' });

const seoulToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
export const exportQuery = z
  .object({ from: date.optional(), to: date.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'The end date must be after the start date');
export const restoreRequest = z.object({
  mode: z.enum(['merge', 'replace']).default('merge'),
  confirm: z.string().optional(),
  // Optional so a missing backup reaches parseBackup and its message.
  backup: z.unknown().optional(),
});

// Registered before the app-wide 256kb JSON parser so a backup may be up to 10MB.
export function registerBackupRoutes(app: express.Express, pool: Pool) {
  app.get('/api/export/workouts.csv', async (req, res) => {
    const q = exportQuery.parse(req.query);
    const rows = await snapshot(
      pool,
      async (client) =>
        (
          await client.query(
            `SELECT w.id workout_id, w.date, w.title, w.notes workout_notes, w.feedback workout_feedback,
              CASE WHEN s.id IS NULL THEN NULL ELSE row_number() OVER (PARTITION BY w.id ORDER BY s.position, s.id) END set_number,
              s.exercise, s.weight, s.reps, s.notes set_notes, s.machine_id, b.name brand, m.name machine_name, m.base_weight
            FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id LEFT JOIN machines m ON m.id=s.machine_id LEFT JOIN brands b ON b.id=m.brand_id
            WHERE ($1::date IS NULL OR w.date >= $1::date) AND ($2::date IS NULL OR w.date <= $2::date)
            ORDER BY w.date, w.id, s.position, s.id`,
            [q.from ?? null, q.to ?? null],
          )
        ).rows,
    );
    const csv = toCsv([
      csvColumns,
      ...rows.map((r) => {
        const weight = num(r.weight);
        return [
          r.workout_id,
          r.date,
          r.title,
          r.workout_notes,
          num(r.set_number),
          r.exercise,
          weight,
          r.reps,
          weight === null ? null : Number((weight * r.reps).toFixed(2)),
          r.set_notes,
          r.machine_id,
          r.brand,
          r.machine_name,
          num(r.base_weight),
          r.workout_feedback,
        ];
      }),
    ]);
    res
      .attachment(`workout-memo-workouts-${seoulToday()}.csv`)
      .type('text/csv; charset=utf-8')
      .send(csv);
  });

  app.get('/api/export/cardio.csv', async (req, res) => {
    const q = exportQuery.parse(req.query);
    const rows = await snapshot(
      pool,
      async (client) =>
        (
          await client.query(
            `SELECT id, date, to_char(start_time, 'HH24:MI') start_time, kind, duration_sec,
              distance_km::float8 distance_km, ${cardioPaceSql()} pace_sec_per_km, ${cardioSpeedSql()} speed_kmh,
              avg_heart_rate, max_heart_rate, calories_kcal, elevation_gain_m, avg_cadence, effort,
              workout_id, source, external_id, memo
            FROM cardio_sessions
            WHERE ($1::date IS NULL OR date >= $1::date) AND ($2::date IS NULL OR date <= $2::date)
            ORDER BY date, start_time NULLS FIRST, id`,
            [q.from ?? null, q.to ?? null],
          )
        ).rows,
    );
    // Same escaping and formula guard as the workouts CSV (memo and external id are free text).
    const csv = toCsv([
      cardioCsvColumns,
      ...rows.map((r) => [
        r.id,
        r.date,
        r.start_time,
        r.kind,
        r.duration_sec,
        r.distance_km,
        r.pace_sec_per_km,
        r.speed_kmh,
        r.avg_heart_rate,
        r.max_heart_rate,
        r.calories_kcal,
        r.elevation_gain_m,
        r.avg_cadence,
        r.effort,
        r.workout_id,
        r.source,
        r.external_id,
        r.memo,
      ]),
    ]);
    res
      .attachment(`workout-memo-cardio-${seoulToday()}.csv`)
      .type('text/csv; charset=utf-8')
      .send(csv);
  });

  app.get('/api/backup', async (_req, res) => {
    const backup = await snapshot(pool, async (client) => ({
      format: backupFormat,
      version: backupVersion,
      exported_at: new Date().toISOString(),
      data: {
        brands: (await client.query('SELECT id, name FROM brands ORDER BY id')).rows,
        machines: (
          await client.query(
            'SELECT id, brand_id, name, base_weight, notes, single_joint, official_weight_id FROM machines ORDER BY id',
          )
        ).rows.map((m) => ({ ...m, base_weight: num(m.base_weight) })),
        workouts: (
          await client.query(
            `SELECT w.id, w.date, w.title, w.notes, w.feedback, w.created_at, COALESCE(json_agg(json_build_object('exercise',s.exercise,'machine_id',s.machine_id,'weight',s.weight,'reps',s.reps,'notes',s.notes,'completed',s.completed,'rpe',s.rpe) ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id GROUP BY w.id ORDER BY w.date, w.id`,
          )
        ).rows,
        goals: (
          await client.query(
            'SELECT id, exercise, target_weight, target_reps, start_date, deadline FROM goals ORDER BY id',
          )
        ).rows.map((g) => ({ ...g, target_weight: Number(g.target_weight) })),
        routines: (await client.query('SELECT id, created_at, plan FROM routines ORDER BY id'))
          .rows,
        cardio_sessions: (
          await client.query(
            `SELECT id, ${cardioValues}, workout_id, created_at FROM cardio_sessions ORDER BY date, id`,
          )
        ).rows,
        cardio_goals: (
          await client.query(`SELECT id, ${cardioGoalValues} FROM cardio_goals ORDER BY id`)
        ).rows,
        body_measurements: (
          await client.query(
            `SELECT id, date, body_weight_kg::float8 body_weight_kg, body_fat_percent::float8 body_fat_percent,
              skeletal_muscle_kg::float8 skeletal_muscle_kg, created_at, updated_at FROM body_measurements ORDER BY date`,
          )
        ).rows,
        exercise_body_parts: (
          await client.query(
            'SELECT exercise, body_part FROM exercise_body_parts ORDER BY exercise, body_part',
          )
        ).rows,
        exercise_weight_steps: (
          await client.query(
            'SELECT exercise, weight_step::float8 weight_step FROM exercise_weight_steps ORDER BY exercise',
          )
        ).rows,
        routine_rests: (
          await client.query(
            'SELECT routine_id, rest_date FROM routine_rests ORDER BY routine_id, rest_date',
          )
        ).rows,
      },
    }));
    res.attachment(`workout-memo-backup-${seoulToday()}.json`).json(backup);
  });

  const json = express.json({ limit: backupMaxBytes + 64 * 1024 });
  for (const action of ['preview', 'restore'] as const)
    app.post('/api/backup/' + action, json, async (req, res) => {
      const request = restoreRequest.parse(req.body ?? {});
      let backup: Backup;
      try {
        backup = parseBackup(request.backup);
      } catch (e) {
        if (e instanceof BackupInvalid) {
          res.status(400).json({ error: e.message });
          return;
        }
        throw e;
      }
      if (
        action === 'restore' &&
        request.mode === 'replace' &&
        request.confirm !== replaceConfirmation
      ) {
        res.status(400).json({
          error: `Replace all deletes every existing record (workouts, machines, goals, routines, cardio, body records, and settings the backup carries). Type the confirmation phrase "${replaceConfirmation}" exactly.`,
        });
        return;
      }
      try {
        // Preview runs the exact same steps and rolls back, so its summary matches a real run.
        const summary = await inTransaction(
          pool,
          async (client) => {
            const result = await restore(client, backup, request.mode);
            // #360: a real restore leaves one audit row in the same transaction; a preview rolls back.
            if (action === 'restore')
              await writeAudit(client, {
                ...auditContext(req, res),
                action: request.mode === 'replace' ? 'delete' : 'create',
                entity: 'backup',
                after: { mode: request.mode, version: backup.version, tables: result.tables },
              });
            return result;
          },
          { commit: () => action !== 'preview' },
        );
        if (action !== 'preview') summary.dry_run = false;
        res.json(summary);
      } catch (e) {
        console.error(
          JSON.stringify({
            event: 'backup_restore_error',
            action,
            requestId: res.locals.requestId,
            message: (e as Error).message,
          }),
        );
        res.status(500).json({
          error:
            'An error occurred during the restore, so everything was rolled back. Existing records are unchanged.',
        });
      }
    });
}
