import { createHash } from 'node:crypto';

import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { dateRange, workoutSchema } from '../domain.js';
import { newRecordsFor } from '../records.js';
import { auditContext, writeAudit } from '../standard/audit.js';
import { parseId } from '../standard/http.js';
import { findRetry, insertSets, insertWorkout, listWorkouts, summary } from '../store/workouts.js';
import { inTransaction } from '../transaction.js';

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
            const replay = await findRetry(client, key, fingerprint);
            if (replay) return replay;
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
          // #477: which saved sets beat the earlier best estimated 1RM; stored with the retry key so a replay repeats it.
          const response = {
            id: workoutId,
            version,
            records: await newRecordsFor(client, workoutId),
          };
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
