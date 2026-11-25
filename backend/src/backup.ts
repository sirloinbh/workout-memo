import express from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { cardioCsvColumns, csvColumns, toCsv } from './backup-csv.js';
import { cardioGoalValues, cardioValues, num, restore } from './backup-restore.js';
import type { Backup } from './backup-schema.js';
import { backupFormat, BackupInvalid, backupVersion, parseBackup } from './backup-schema.js';
import { date } from './domain.js';
import { auditContext, writeAudit } from './standard/audit.js';
import { cardioPaceSql, cardioSpeedSql } from './store/cardio.js';
import { inTransaction } from './transaction.js';

// The tests and other modules keep importing these from backup.js.
export { backupFormat, BackupInvalid, backupVersion, parseBackup };
export type { Backup };
export { csvCell, toCsv } from './backup-csv.js';
export type { RestoreSummary } from './backup-restore.js';

const backupMaxBytes = 10 * 1024 * 1024;
const replaceConfirmation = 'Replace all';

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
            `SELECT w.id, w.date, w.title, w.notes, w.feedback, w.created_at, COALESCE(json_agg(json_build_object('exercise',s.exercise,'machine_id',s.machine_id,'weight',s.weight,'reps',s.reps,'notes',s.notes,'completed',s.completed,'rpe',s.rpe,'superset',s.superset) ORDER BY s.position, s.id) FILTER (WHERE s.id IS NOT NULL), '[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id GROUP BY w.id ORDER BY w.date, w.id`,
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
