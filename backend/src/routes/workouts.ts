import { createHash } from 'node:crypto';

import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { dateRange, workoutSchema } from '../domain.js';
import { auditContext, writeAudit } from '../standard/audit.js';
import { parseId } from '../standard/http.js';
import { inTransaction } from '../transaction.js';
import type { Db } from './shared.js';

// The audit summary of a journal (project-standards#553): what identifies it, not every set.
export const summary = (w: { date: string; title: string; version: number }, sets?: number) => ({
  date: w.date,
  title: w.title,
  version: w.version,
  ...(sets === undefined ? {} : { sets }),
});

type Workout = z.infer<typeof workoutSchema>;

// Shared by the routes and the AI tools (ai-tools.ts).
export async function listWorkouts(db: Db, range: { from: string; to: string }) {
  return (
    await db.query(
      `SELECT w.*,COALESCE(json_agg(s ORDER BY s.position) FILTER(WHERE s.id IS NOT NULL),'[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id WHERE w.date BETWEEN $1 AND $2 GROUP BY w.id ORDER BY w.date DESC,w.id DESC`,
      [range.from, range.to],
    )
  ).rows;
}

export async function insertWorkout(db: Db, w: Workout): Promise<number> {
  const id: number = (
    await db.query(
      'INSERT INTO workouts(date,title,notes,feedback) VALUES($1,$2,$3,$4) RETURNING id',
      [w.date, w.title, w.notes, w.feedback],
    )
  ).rows[0].id;
  await insertSets(db, id, w.sets);
  return id;
}

async function insertSets(db: Db, workoutId: number, sets: Workout['sets']) {
  for (const [i, s] of sets.entries())
    await db.query(
      'INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position,notes,completed,rpe) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [workoutId, s.exercise, s.machine_id, s.weight, s.reps, i, s.notes, s.completed, s.rpe],
    );
}

export function registerWorkoutRoutes(app: express.Express, pool: Pool) {
  app.get('/api/workouts', async (req, res) => {
    res.json(await listWorkouts(pool, dateRange.parse(req.query)));
  });
  for (const method of ['post', 'put'] as const)
    app[method]('/api/workouts' + (method === 'put' ? '/:id' : ''), async (req, res) => {
      const w = workoutSchema.parse(req.body);
      const key = req.get('Idempotency-Key');
      // guid(), not uuid(): zod 4's uuid() also rejects keys with a nonstandard version digit.
      if (key !== undefined) z.guid().parse(key);
      const target = method === 'put' ? parseId(req.params.id, 'journal') : null;
      if (method === 'put') z.number().int().positive().parse(w.version);
      // A request without feedback keeps the fingerprint it had before #83, so a retry key
      // stored by an older server still replays instead of reporting different content.
      const { feedback, ...withoutFeedback } = w;
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([method, target, feedback === null ? withoutFeedback : w]))
        .digest('hex');
      const reply = await inTransaction(
        pool,
        async (client): Promise<{ status: number; body: unknown }> => {
          if (key) {
            // Serialize identical keys across connections, including their first use.
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
            const previous = await client.query(
              'SELECT *, expires_at <= now() expired FROM workout_requests WHERE key=$1',
              [key],
            );
            if (previous.rowCount) {
              const saved = previous.rows[0];
              if (saved.expired)
                return {
                  status: 409,
                  body: {
                    error:
                      'The 7-day validity of the retry key has passed. Check the server record.',
                  },
                };
              if (saved.fingerprint !== fingerprint)
                return {
                  status: 409,
                  body: {
                    error: 'The request content differs from the one with the same retry key.',
                  },
                };
              return { status: saved.status, body: saved.response };
            }
          }
          let workoutId: number;
          let version = 1;
          let before: ReturnType<typeof summary> | null = null;
          if (method === 'post') workoutId = await insertWorkout(client, w);
          else {
            workoutId = target!;
            const existing = await client.query(
              'SELECT date,title,version FROM workouts WHERE id=$1 FOR UPDATE',
              [workoutId],
            );
            if (!existing.rowCount) {
              return { status: 404, body: { error: 'Journal not found' } };
            }
            if (existing.rows[0].version !== w.version) {
              return {
                status: 409,
                body: {
                  error:
                    'This record was edited on another device. Keep your draft and check the latest record.',
                },
              };
            }
            before = summary(existing.rows[0]);
            const r = await client.query(
              'UPDATE workouts SET date=$1,title=$2,notes=$3,feedback=$4,version=version+1 WHERE id=$5 RETURNING id,version',
              [w.date, w.title, w.notes, w.feedback, workoutId],
            );
            if (!r.rowCount) {
              return { status: 404, body: { error: 'Journal not found' } };
            }
            version = r.rows[0].version;
            await client.query('DELETE FROM sets WHERE workout_id=$1', [workoutId]);
            await insertSets(client, workoutId, w.sets);
          }
          const status = method === 'post' ? 201 : 200;
          const response = { id: workoutId, version };
          await writeAudit(client, {
            ...auditContext(req, res),
            action: method === 'post' ? 'create' : 'update',
            entity: 'workout',
            entityId: workoutId,
            before,
            after: summary({ date: w.date, title: w.title, version }, w.sets.length),
          });
          if (key)
            await client.query(
              'INSERT INTO workout_requests(key,fingerprint,status,response) VALUES($1,$2,$3,$4)',
              [key, fingerprint, status, response],
            );
          return { status, body: response };
        },
        { commit: (r) => r.status < 400 },
      );
      res.status(reply.status).json(reply.body);
    });
  app.delete('/api/workouts/:id', async (req, res) => {
    const id = parseId(req.params.id, 'journal');
    const deleted = await inTransaction(pool, async (client) => {
      const r = await client.query(
        'DELETE FROM workouts WHERE id=$1 RETURNING date,title,version',
        [id],
      );
      if (r.rowCount)
        await writeAudit(client, {
          ...auditContext(req, res),
          action: 'delete',
          entity: 'workout',
          entityId: id,
          before: summary(r.rows[0]),
        });
      return r.rowCount;
    });
    res.status(deleted ? 200 : 404).json(deleted ? { ok: true } : { error: 'Journal not found' });
  });
}
