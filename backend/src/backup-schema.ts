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
export class BackupInvalid extends Error {}

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
export type BodyRow = Backup['data']['body_measurements'][number];
export type CardioBackupRow = NonNullable<ParsedBackup['data']['cardio_sessions']>[number];
export type CardioGoalBackupRow = NonNullable<ParsedBackup['data']['cardio_goals']>[number];
// #359: the lists a v4 file carries and an older file does not.
export const v4Lists = [
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
