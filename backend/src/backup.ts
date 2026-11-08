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

// Two deliberately separate artifacts (#33):
// - analysis CSV: one row per set for spreadsheets; lossy (formula guard) and never restorable.
// - restore backup: versioned JSON that keeps every relationship and is validated before use.
export const backupFormat = 'workout-memo-backup';
// v2 (#114) adds data.cardio_sessions. A v1 file is still restored, as a backup without cardio.
// v3 (#253) adds data.cardio_goals. v1 and v2 files restore as backups without cardio goals; an
// app older than v3 cannot restore a v3 file (2026-11-08 user decision B1).
export const backupVersion = 3;
export const supportedBackupVersions = [1, 2, 3] as const;
export const backupMaxBytes = 10 * 1024 * 1024;
export const replaceConfirmation = '전체 교체';

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

export const csvColumns = [
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
export const cardioCsvColumns = [
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
const backupSchema = z.object({
  format: z.literal(backupFormat),
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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
            .refine((g) => g.deadline >= g.start_date, '목표 종료일을 확인하세요'),
        )
        .max(5000),
      routines: z.array(z.object({ id, created_at: timestamp, plan: routineSchema })).max(1000),
      // #114: required in v2 (checked in parseBackup); a v1 file has none.
      cardio_sessions: z.array(cardioRow).max(50000).optional(),
      // #253: required in v3 (checked in parseBackup); v1 and v2 files have none.
      cardio_goals: z.array(cardioGoalRow).max(5000).optional(),
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
      ] as const) {
        const seen = new Set<number>();
        for (const row of data[table] ?? []) {
          if (seen.has(row.id)) issue(`${table}: 중복된 id ${row.id}`);
          seen.add(row.id);
        }
      }
      const brandIds = new Set(data.brands.map((b) => b.id));
      if (new Set(data.brands.map((b) => b.name)).size !== data.brands.length)
        issue('브랜드 이름이 중복되었습니다');
      const machineIds = new Set(data.machines.map((m) => m.id));
      const machineKeys = new Set<string>();
      data.machines.forEach((m, i) => {
        if (!brandIds.has(m.brand_id))
          issue(`machines[${i}]: 백업에 없는 브랜드 ${m.brand_id}를 참조합니다`);
        const key = m.brand_id + '\u0000' + m.name;
        if (machineKeys.has(key)) issue(`같은 브랜드의 머신 이름이 중복되었습니다: ${m.name}`);
        machineKeys.add(key);
      });
      data.workouts.forEach((w, i) =>
        w.sets.forEach((s, j) => {
          if (s.machine_id !== null && !machineIds.has(s.machine_id))
            issue(`workouts[${i}].sets[${j}]: 백업에 없는 머신 ${s.machine_id}를 참조합니다`);
        }),
      );
      const workoutIds = new Set(data.workouts.map((w) => w.id));
      const externalIds = new Set<string>();
      (data.cardio_sessions ?? []).forEach((c, i) => {
        if (c.workout_id !== null && !workoutIds.has(c.workout_id))
          issue(`cardio_sessions[${i}]: 백업에 없는 일지 ${c.workout_id}를 참조합니다`);
        if (c.external_id === null) return;
        const key = c.source + '\u0000' + c.external_id;
        if (externalIds.has(key))
          issue(
            `같은 출처와 외부 ID의 유산소 기록이 중복되었습니다: ${c.source} / ${c.external_id}`,
          );
        externalIds.add(key);
      });
      data.routines.forEach((r, i) =>
        r.plan.splits.forEach((s) =>
          s.exercises.forEach((e) => {
            if (e.machine_id != null && !machineIds.has(e.machine_id))
              issue(`routines[${i}]: 백업에 없는 머신 ${e.machine_id}를 참조합니다`);
          }),
        ),
      );
    }),
});
type ParsedBackup = z.infer<typeof backupSchema>;
type CardioBackupRow = NonNullable<ParsedBackup['data']['cardio_sessions']>[number];
type CardioGoalBackupRow = NonNullable<ParsedBackup['data']['cardio_goals']>[number];
// After parseBackup every backup has cardio_sessions (empty for a v1 file) and cardio_goals
// (empty for v1 and v2 files).
export type Backup = Omit<ParsedBackup, 'data'> & {
  data: Omit<ParsedBackup['data'], 'cardio_sessions' | 'cardio_goals'> & {
    cardio_sessions: CardioBackupRow[];
    cardio_goals: CardioGoalBackupRow[];
  };
};

export function parseBackup(value: unknown): Backup {
  const head = value as { format?: unknown; version?: unknown } | null;
  if (typeof head !== 'object' || head === null || Array.isArray(head))
    throw new BackupInvalid('워크아웃 메모 백업 파일 형식이 아닙니다');
  if (head.format !== backupFormat)
    throw new BackupInvalid(
      '워크아웃 메모 백업 파일 형식이 아닙니다 (분석용 CSV는 복원할 수 없습니다)',
    );
  if (!(supportedBackupVersions as readonly unknown[]).includes(head.version))
    throw new BackupInvalid(
      `지원하지 않는 백업 버전입니다 (v${String(head.version)}). 지원 버전: ${supportedBackupVersions.map((v) => 'v' + v).join(', ')}`,
    );
  // v1 predates cardio sessions (#114) and v1·v2 predate cardio goals (#253): such stray keys in
  // an older file are ignored, not validated, so they never make an otherwise valid restore fail.
  const input = (() => {
    const file = value as { version?: unknown; data?: unknown };
    if (file.version === 3 || typeof file.data !== 'object' || file.data === null) return value;
    const rest = { ...(file.data as Record<string, unknown>) };
    delete rest.cardio_goals;
    if (file.version === 1) delete rest.cardio_sessions;
    return { ...file, data: rest };
  })();
  const parsed = backupSchema.safeParse(input);
  if (parsed.success && parsed.data.version >= 2 && !parsed.data.data.cardio_sessions)
    throw new BackupInvalid(
      `백업 검증 실패 — data.cardio_sessions: v${parsed.data.version} 백업에는 유산소 기록 목록이 필요합니다`,
    );
  if (parsed.success && parsed.data.version === 3 && !parsed.data.data.cardio_goals)
    throw new BackupInvalid(
      '백업 검증 실패 — data.cardio_goals: v3 백업에는 유산소 목표 목록이 필요합니다',
    );
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((x) => {
      const path = x.path.join('.');
      return path ? `${path}: ${x.message}` : x.message;
    });
    throw new BackupInvalid('백업 검증 실패 — ' + issues.join(' / '));
  }
  const { data, version } = parsed.data;
  // v1 predates cardio sessions (#114): it restores as a backup without any.
  return {
    ...parsed.data,
    data: {
      ...data,
      cardio_sessions: version === 1 ? [] : (data.cardio_sessions ?? []),
      // #253: v1 and v2 predate cardio goals.
      cardio_goals: version === 3 ? (data.cardio_goals ?? []) : [],
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
  }[],
) =>
  JSON.stringify([
    w.date,
    w.title,
    w.notes,
    sets.map((s) => [s.exercise, s.machine_id, s.weight, s.reps, s.notes]),
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
    'LOCK TABLE brands, machines, workouts, sets, goals, routines, cardio_sessions, cardio_goals IN EXCLUSIVE MODE',
  );
  if (mode === 'replace') {
    for (const table of tables)
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
            `${brandName.get(m.brand_id)} / ${m.name}: 기존 값 유지 (기본중량 ${existing.base_weight ?? '미확인'}kg, 백업 ${m.base_weight ?? '미확인'}kg)`,
          );
      }
      continue;
    }
    const inserted = (
      await client.query(
        'INSERT INTO machines(brand_id,name,base_weight,notes,single_joint) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [brandId, m.name, m.base_weight, m.notes, m.single_joint],
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
    `SELECT w.id, w.date, w.title, w.notes, COALESCE(json_agg(json_build_object('exercise',s.exercise,'machine_id',s.machine_id,'weight',s.weight,'reps',s.reps,'notes',s.notes) ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id GROUP BY w.id`,
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
    for (const [i, s] of sets.entries())
      await client.query(
        'INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [workoutId, s.exercise, s.machine_id, s.weight, s.reps, i, s.notes],
      );
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
  for (const r of (await client.query('SELECT plan FROM routines')).rows)
    seenRoutines.add(canonical(r.plan));
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
    if (seenRoutines.take(canonical(plan)) !== undefined) {
      t.routines.skipped++;
      continue;
    }
    await client.query('INSERT INTO routines(plan, created_at) VALUES($1::jsonb, $2)', [
      JSON.stringify(plan),
      r.created_at,
    ]);
    t.routines.added++;
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
            `유산소 ${c.date} ${c.source} / ${c.external_id}: 기존 값 유지 (같은 외부 ID, 다른 내용)`,
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

async function snapshot<T>(pool: Pool, read: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    // One consistent snapshot across all tables.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await read(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const seoulToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
export const exportQuery = z
  .object({ from: date.optional(), to: date.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, '조회 종료일은 시작일 이후여야 합니다');
export const restoreRequest = z.object({
  mode: z.enum(['merge', 'replace']).default('merge'),
  confirm: z.string().optional(),
  // Optional so a missing backup reaches parseBackup and its Korean message.
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
            'SELECT id, brand_id, name, base_weight, notes, single_joint FROM machines ORDER BY id',
          )
        ).rows.map((m) => ({ ...m, base_weight: num(m.base_weight) })),
        workouts: (
          await client.query(
            `SELECT w.id, w.date, w.title, w.notes, w.feedback, w.created_at, COALESCE(json_agg(json_build_object('exercise',s.exercise,'machine_id',s.machine_id,'weight',s.weight,'reps',s.reps,'notes',s.notes) ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id GROUP BY w.id ORDER BY w.date, w.id`,
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
          error: `전체 교체는 기존 기록을 모두 삭제합니다. 확인 문구 "${replaceConfirmation}"을 정확히 입력하세요.`,
        });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const summary = await restore(client, backup, request.mode);
        // Preview runs the exact same steps and rolls back, so its summary matches a real run.
        if (action === 'preview') await client.query('ROLLBACK');
        else {
          await client.query('COMMIT');
          summary.dry_run = false;
        }
        res.json(summary);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error(
          JSON.stringify({ event: 'backup_restore_error', action, message: (e as Error).message }),
        );
        res.status(500).json({
          error: '복원 중 오류가 발생해 전체 취소했습니다. 기존 기록은 변경되지 않았습니다.',
        });
      } finally {
        client.release();
      }
    });
}
