import type express from 'express';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { dateRange, workoutSchema } from '../domain.js';
import { id } from './shared.js';

export function registerWorkoutRoutes(app: express.Express, pool: Pool) {
  app.get('/api/workouts', async (req, res) => {
    const q = dateRange.parse(req.query);
    res.json(
      (
        await pool.query(
          `SELECT w.*,COALESCE(json_agg(s ORDER BY s.position) FILTER(WHERE s.id IS NOT NULL),'[]') sets FROM workouts w LEFT JOIN sets s ON s.workout_id=w.id WHERE w.date BETWEEN $1 AND $2 GROUP BY w.id ORDER BY w.date DESC,w.id DESC`,
          [q.from, q.to],
        )
      ).rows,
    );
  });
  for (const method of ['post', 'put'] as const)
    app[method]('/api/workouts' + (method === 'put' ? '/:id' : ''), async (req, res) => {
      const w = workoutSchema.parse(req.body);
      const key = req.get('Idempotency-Key');
      if (key !== undefined) z.string().uuid().parse(key);
      const target = method === 'put' ? id(req.params.id) : null;
      if (method === 'put') z.number().int().positive().parse(w.version);
      // A request without feedback keeps the fingerprint it had before #83, so a retry key
      // stored by an older server still replays instead of reporting different content.
      const { feedback, ...withoutFeedback } = w;
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([method, target, feedback === null ? withoutFeedback : w]))
        .digest('hex');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (key) {
          // Serialize identical keys across connections, including their first use.
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
          const previous = await client.query(
            'SELECT *, expires_at <= now() expired FROM workout_requests WHERE key=$1',
            [key],
          );
          if (previous.rowCount) {
            const saved = previous.rows[0];
            await client.query('ROLLBACK');
            if (saved.expired)
              res
                .status(409)
                .json({ error: '재시도 키의 7일 유효기간이 지났습니다. 서버 기록을 확인하세요.' });
            else if (saved.fingerprint !== fingerprint)
              res.status(409).json({ error: '같은 재시도 키의 요청 내용이 다릅니다.' });
            else res.status(saved.status).json(saved.response);
            return;
          }
        }
        let workoutId: number;
        let version = 1;
        if (method === 'post')
          workoutId = (
            await client.query(
              'INSERT INTO workouts(date,title,notes,feedback) VALUES($1,$2,$3,$4) RETURNING id',
              [w.date, w.title, w.notes, w.feedback],
            )
          ).rows[0].id;
        else {
          workoutId = target!;
          const existing = await client.query(
            'SELECT version FROM workouts WHERE id=$1 FOR UPDATE',
            [workoutId],
          );
          if (!existing.rowCount) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: '일지를 찾을 수 없습니다' });
            return;
          }
          if (existing.rows[0].version !== w.version) {
            await client.query('ROLLBACK');
            res.status(409).json({
              error: '다른 기기에서 수정된 기록입니다. 초안을 보관하고 최신 기록을 확인하세요.',
            });
            return;
          }
          const r = await client.query(
            'UPDATE workouts SET date=$1,title=$2,notes=$3,feedback=$4,version=version+1 WHERE id=$5 RETURNING id,version',
            [w.date, w.title, w.notes, w.feedback, workoutId],
          );
          if (!r.rowCount) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: '일지를 찾을 수 없습니다' });
            return;
          }
          version = r.rows[0].version;
          await client.query('DELETE FROM sets WHERE workout_id=$1', [workoutId]);
        }
        for (const [i, s] of w.sets.entries())
          await client.query(
            'INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position,notes,completed,rpe) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [workoutId, s.exercise, s.machine_id, s.weight, s.reps, i, s.notes, s.completed, s.rpe],
          );
        const status = method === 'post' ? 201 : 200;
        const response = { id: workoutId, version };
        if (key)
          await client.query(
            'INSERT INTO workout_requests(key,fingerprint,status,response) VALUES($1,$2,$3,$4)',
            [key, fingerprint, status, response],
          );
        await client.query('COMMIT');
        res.status(status).json(response);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  app.delete('/api/workouts/:id', async (req, res) => {
    const r = await pool.query('DELETE FROM workouts WHERE id=$1', [id(req.params.id)]);
    res
      .status(r.rowCount ? 200 : 404)
      .json(r.rowCount ? { ok: true } : { error: '일지를 찾을 수 없습니다' });
  });
}
