import express from 'express';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { types } from 'pg';
import { ZodError, z } from 'zod';
import {
  workoutSchema,
  machineSchema,
  goalSchema,
  routineSchema,
  routineSchedule,
  type RoutinePlan,
  bodyMeasurementSchema,
  dateRange,
} from './domain.js';
types.setTypeParser(1082, (value) => value);
export function createApp(pool: Pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.post('/api/routines', async (req, res) => {
    const plan = routineSchema.parse(req.body);
    const result = await pool.query('INSERT INTO routines(plan) VALUES($1::jsonb) RETURNING id', [
      JSON.stringify(plan),
    ]);
    res.status(201).json(result.rows[0]);
  });
  app.get('/api/routines', async (_req, res) => {
    const result = await pool.query('SELECT id, plan FROM routines ORDER BY id DESC');
    res.json(
      result.rows.map((row: { id: number; plan: RoutinePlan }) => ({
        ...row.plan,
        id: row.id,
        schedule: routineSchedule(row.plan),
      })),
    );
  });
  app.get('/api/routines/:id', async (req, res) => {
    const result = await pool.query('SELECT id, plan FROM routines WHERE id=$1', [
      id(req.params.id),
    ]);
    const row = result.rows[0] as { id: number; plan: RoutinePlan } | undefined;
    res
      .status(row ? 200 : 404)
      .json(
        row
          ? { ...row.plan, id: row.id, schedule: routineSchedule(row.plan) }
          : { error: '루틴을 찾을 수 없습니다' },
      );
  });
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
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([method, target, w]))
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
              'INSERT INTO workouts(date,title,notes) VALUES($1,$2,$3) RETURNING id',
              [w.date, w.title, w.notes],
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
            'UPDATE workouts SET date=$1,title=$2,notes=$3,version=version+1 WHERE id=$4 RETURNING id,version',
            [w.date, w.title, w.notes, workoutId],
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
            'INSERT INTO sets(workout_id,exercise,machine_id,weight,reps,position,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [workoutId, s.exercise, s.machine_id, s.weight, s.reps, i, s.notes],
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
  // NUMERIC(5,2) is returned as a JSON number; NULL stays null (never estimated or 0).
  const bodyColumns =
    'id, date, body_weight_kg::float8 AS body_weight_kg, body_fat_percent::float8 AS body_fat_percent, skeletal_muscle_kg::float8 AS skeletal_muscle_kg';
  const bodyConflict = '이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요.';
  const bodyMissing = '신체 기록을 찾을 수 없습니다';
  app.get('/api/body-measurements', async (req, res) => {
    const q = dateRange.parse(req.query);
    res.json(
      (
        await pool.query(
          `SELECT ${bodyColumns} FROM body_measurements WHERE date BETWEEN $1 AND $2 ORDER BY date`,
          [q.from, q.to],
        )
      ).rows,
    );
  });
  app.post('/api/body-measurements', async (req, res) => {
    const b = bodyMeasurementSchema.parse(req.body);
    // One record per date: an existing date is a 409, never an implicit overwrite.
    const r = await pool.query(
      `INSERT INTO body_measurements(date,body_weight_kg,body_fat_percent,skeletal_muscle_kg) VALUES($1,$2,$3,$4) ON CONFLICT (date) DO NOTHING RETURNING ${bodyColumns}`,
      [b.date, b.body_weight_kg, b.body_fat_percent, b.skeletal_muscle_kg],
    );
    if (r.rowCount) res.status(201).json(r.rows[0]);
    else res.status(409).json({ error: bodyConflict });
  });
  app.put('/api/body-measurements/:id', async (req, res) => {
    const target = id(req.params.id);
    const b = bodyMeasurementSchema.parse(req.body);
    try {
      // A full replacement: omitted metrics become NULL.
      const r = await pool.query(
        `UPDATE body_measurements SET date=$1,body_weight_kg=$2,body_fat_percent=$3,skeletal_muscle_kg=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING ${bodyColumns}`,
        [b.date, b.body_weight_kg, b.body_fat_percent, b.skeletal_muscle_kg, target],
      );
      if (r.rowCount) res.json(r.rows[0]);
      else res.status(404).json({ error: bodyMissing });
    } catch (e) {
      if ((e as { code?: unknown }).code === '23505') res.status(409).json({ error: bodyConflict });
      else throw e;
    }
  });
  app.delete('/api/body-measurements/:id', async (req, res) => {
    const r = await pool.query('DELETE FROM body_measurements WHERE id=$1', [id(req.params.id)]);
    res.status(r.rowCount ? 200 : 404).json(r.rowCount ? { ok: true } : { error: bodyMissing });
  });
  app.get('/api/goals', async (_req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT g.*, EXISTS(SELECT 1 FROM sets s JOIN workouts w ON w.id=s.workout_id WHERE lower(trim(s.exercise))=lower(trim(g.exercise)) AND s.weight>=g.target_weight AND s.reps>=g.target_reps AND w.date BETWEEN g.start_date AND LEAST(g.deadline,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date)) achieved FROM goals g ORDER BY g.deadline,g.id DESC`,
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
