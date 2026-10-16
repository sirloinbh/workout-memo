import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';
import { ZodError, z } from 'zod';
import { date, workoutSchema, machineSchema, goalSchema } from './domain.js';
types.setTypeParser(1082, (value) => value);
export function createApp(pool: Pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.get('/api/brands', async (_req, res) =>
    res.json((await pool.query('SELECT * FROM brands ORDER BY id')).rows),
  );
  app.get('/api/machines', async (_req, res) =>
    res.json(
      (
        await pool.query(
          'SELECT m.*, b.name brand FROM machines m JOIN brands b ON b.id=m.brand_id ORDER BY m.id DESC',
        )
      ).rows,
    ),
  );
  app.post('/api/machines', async (req, res) => {
    const m = machineSchema.parse(req.body);
    res
      .status(201)
      .json(
        (
          await pool.query(
            'INSERT INTO machines(brand_id,name,base_weight,notes) VALUES($1,$2,$3,$4) RETURNING *',
            [m.brand_id, m.name, m.base_weight, m.notes],
          )
        ).rows[0],
      );
  });
  app.put('/api/machines/:id', async (req, res) => {
    const m = machineSchema.parse(req.body);
    const r = await pool.query(
      'UPDATE machines SET brand_id=$1,name=$2,base_weight=$3,notes=$4 WHERE id=$5 RETURNING *',
      [m.brand_id, m.name, m.base_weight, m.notes, id(req.params.id)],
    );
    res.status(r.rowCount ? 200 : 404).json(r.rows[0] ?? { error: '머신을 찾을 수 없습니다' });
  });
  app.get('/api/workouts', async (req, res) => {
    const q = z
      .object({ from: date, to: date })
      .refine((value) => value.from <= value.to, '조회 종료일은 시작일 이후여야 합니다')
      .parse(req.query);
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let workoutId: number;
        if (method === 'post')
          workoutId = (
            await client.query(
              'INSERT INTO workouts(date,title,notes) VALUES($1,$2,$3) RETURNING id',
              [w.date, w.title, w.notes],
            )
          ).rows[0].id;
        else {
          workoutId = id(req.params.id);
          const r = await client.query(
            'UPDATE workouts SET date=$1,title=$2,notes=$3 WHERE id=$4 RETURNING id',
            [w.date, w.title, w.notes, workoutId],
          );
          if (!r.rowCount) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: '일지를 찾을 수 없습니다' });
            return;
          }
          await client.query('DELETE FROM sets WHERE workout_id=$1', [workoutId]);
        }
        for (const [i, s] of w.sets.entries())
          await client.query(
            'INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position) VALUES($1,$2,$3,$4,$5,$6)',
            [workoutId, s.exercise, s.machine_id, s.weight, s.reps, i],
          );
        await client.query('COMMIT');
        res.status(method === 'post' ? 201 : 200).json({ id: workoutId });
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
  app.get('/api/goals', async (_req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT g.*, EXISTS(SELECT 1 FROM sets s JOIN workouts w ON w.id=s.workout_id WHERE lower(trim(s.exercise))=lower(trim(g.exercise)) AND s.weight>=g.target_weight AND s.reps>=g.target_reps AND w.date BETWEEN g.start_date AND LEAST(g.deadline,CURRENT_DATE)) achieved FROM goals g ORDER BY g.deadline,g.id DESC`,
        )
      ).rows,
    ),
  );
  app.post('/api/goals', async (req, res) => {
    const g = goalSchema.parse(req.body);
    res
      .status(201)
      .json(
        (
          await pool.query(
            'INSERT INTO goals(exercise,target_weight,target_reps,start_date,deadline) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [g.exercise, g.target_weight, g.target_reps, g.start_date, g.deadline],
          )
        ).rows[0],
      );
  });
  app.delete('/api/goals/:id', async (req, res) => {
    const r = await pool.query('DELETE FROM goals WHERE id=$1', [id(req.params.id)]);
    res.status(r.rowCount ? 200 : 404).json({ ok: !!r.rowCount });
  });
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues.map((x) => x.message).join(', ') });
        return;
      }
      const error =
        typeof err === 'object' && err !== null
          ? (err as { code?: unknown; status?: unknown; message?: unknown })
          : {};
      if (error.code === '23505') {
        res.status(409).json({ error: '이미 등록된 항목입니다' });
        return;
      }
      if (error.code === '23503') {
        res.status(400).json({ error: '선택한 머신 또는 브랜드가 존재하지 않습니다' });
        return;
      }
      if (error.status === 400) {
        res.status(400).json({ error: '요청 형식을 확인하세요' });
        return;
      }
      console.error(JSON.stringify({ event: 'request_error', message: error.message }));
      res.status(500).json({ error: '저장소에 연결할 수 없습니다. 서버 상태를 확인하세요.' });
    },
  );
  return app;
}
function id(v: unknown) {
  return z.coerce.number().int().positive().parse(v);
}
