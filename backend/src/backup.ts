import express from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import { date, feedbackLevels, routineSchema } from './domain.js';

// Two deliberately separate artifacts (#33):
// - analysis CSV: one row per set for spreadsheets; lossy (formula guard) and never restorable.
// - restore backup: versioned JSON that keeps every relationship and is validated before use.
export const backupFormat = 'workout-memo-backup';
export const backupVersion = 1;
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

const id = z.number().int().positive();
const kg = z.number().min(0).max(99999);
const name = z.string().trim().min(1).max(120);
const timestamp = z.string().datetime({ offset: true });
const backupSchema = z.object({
  format: z.literal(backupFormat),
  version: z.literal(backupVersion),
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
            notes: z.string().max(2000),
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
            notes: z.string().max(4000),
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
                  notes: z.string().max(4000),
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
    })
    .superRefine((data, ctx) => {
      const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
      for (const table of ['brands', 'machines', 'workouts', 'goals', 'routines'] as const) {
        const seen = new Set<number>();
        for (const row of data[table]) {
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
export type Backup = z.infer<typeof backupSchema>;

export function parseBackup(value: unknown): Backup {
  const head = value as { format?: unknown; version?: unknown } | null;
  if (typeof head !== 'object' || head === null || Array.isArray(head))
    throw new BackupInvalid('워크아웃 메모 백업 파일 형식이 아닙니다');
  if (head.format !== backupFormat)
    throw new BackupInvalid(
      '워크아웃 메모 백업 파일 형식이 아닙니다 (분석용 CSV는 복원할 수 없습니다)',
    );
  if (head.version !== backupVersion)
    throw new BackupInvalid(
      `지원하지 않는 백업 버전입니다 (v${String(head.version)}). 지원 버전: v${backupVersion}`,
    );
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((x) => {
      const path = x.path.join('.');
      return path ? `${path}: ${x.message}` : x.message;
    });
    throw new BackupInvalid('백업 검증 실패 — ' + issues.join(' / '));
  }
  return parsed.data;
}

const tables = ['brands', 'machines', 'workouts', 'sets', 'goals', 'routines'] as const;
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
class Seen {
  private counts = new Map<string, number>();
  add(key: string) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  take(key: string) {
    const n = this.counts.get(key) ?? 0;
    if (n) this.counts.set(key, n - 1);
    return n > 0;
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
    'LOCK TABLE brands, machines, workouts, sets, goals, routines IN EXCLUSIVE MODE',
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
    for (const table of ['workouts', 'goals', 'routines', 'machines', 'brands'])
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
    `SELECT w.date, w.title, w.notes, COALESCE(json_agg(json_build_object('exercise',s.exercise,'machine_id',s.machine_id,'weight',s.weight,'reps',s.reps,'notes',s.notes) ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id GROUP BY w.id`,
  );
  for (const r of existingWorkouts.rows) seenWorkouts.add(workoutKey(r, r.sets));
  for (const w of backup.data.workouts) {
    const sets = w.sets.map((s) => ({
      ...s,
      machine_id: s.machine_id === null ? null : machineMap.get(s.machine_id)!,
    }));
    if (seenWorkouts.take(workoutKey(w, sets))) {
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
    for (const [i, s] of sets.entries())
      await client.query(
        'INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [workoutId, s.exercise, s.machine_id, s.weight, s.reps, i, s.notes],
      );
    t.workouts.added++;
    t.sets.added += sets.length;
  }

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
    if (seenGoals.take(goalKey(g))) {
      t.goals.skipped++;
      continue;
    }
    await client.query(
      'INSERT INTO goals(exercise,target_weight,target_reps,start_date,deadline) VALUES($1,$2,$3,$4,$5)',
      [g.exercise, g.target_weight, g.target_reps, g.start_date, g.deadline],
    );
    t.goals.added++;
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
    if (seenRoutines.take(canonical(plan))) {
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
  backup: z.unknown(),
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
