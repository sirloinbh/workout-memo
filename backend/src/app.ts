import express from 'express';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { types } from 'pg';
import { ZodError, z } from 'zod';
import {
  date,
  workoutSchema,
  machineSchema,
  goalSchema,
  routineSchema,
  routineSchedule,
  exerciseKeySql,
  bodyParts,
  type RoutinePlan,
} from './domain.js';
import { analyze, bodyPartMappingSchema, type AnalysisSet } from './analysis.js';
import {
  exerciseKey,
  isAuto,
  planEndDate,
  routineProgress,
  seoulToday,
  type WorkoutRecord,
} from './progress.js';
const seoulTodaySql = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date";
const partOrder = `array_position(ARRAY[${bodyParts.map((p) => `'${p}'`).join(',')}]::text[], body_part)`;
types.setTypeParser(1082, (value) => value);
type Db = Pick<Pool, 'query'>;
type ActiveRoutine = { id: number; plan: RoutinePlan };
// The routine in progress: started on or before today (Asia/Seoul), latest start wins.
async function activeRoutine(db: Db, today: string) {
  const result = await db.query(
    `SELECT id, plan FROM routines WHERE plan->>'start_date' <= $1 ORDER BY plan->>'start_date' DESC, id DESC LIMIT 1`,
    [today],
  );
  return result.rows[0] as ActiveRoutine | undefined;
}
async function restDates(db: Db, routineId: number) {
  const result = await db.query(
    'SELECT rest_date FROM routine_rests WHERE routine_id=$1 ORDER BY rest_date',
    [routineId],
  );
  return result.rows.map((row: { rest_date: string }) => row.rest_date);
}
// Planned goals and actual records stay separate: the latest earlier journal sets
// for each of today's exercises are returned only as a reference.
// Auto targets adapt to saved sets of the plan's exercises within its 12 weeks.
// to_jsonb keeps this working before and after sets gain a `completed` column.
async function planRecords(db: Db, plan: RoutinePlan, today: string) {
  if (!isAuto(plan)) return [];
  const names = [
    ...new Set(plan.splits.flatMap((s) => s.exercises.map((e) => exerciseKey(e.exercise)))),
  ];
  const result = await db.query(
    `SELECT w.id, w.date, lower(trim(s.exercise)) AS key, s.weight, s.reps,
       to_jsonb(s)->'completed' AS completed
     FROM sets s JOIN workouts w ON w.id = s.workout_id
     WHERE lower(trim(s.exercise)) = ANY($1::text[]) AND w.date BETWEEN $2 AND $3
     ORDER BY w.date, w.id, s.position`,
    [names, plan.start_date, today < planEndDate(plan) ? today : planEndDate(plan)],
  );
  const grouped = new Map<string, WorkoutRecord>();
  for (const row of result.rows as {
    id: number;
    date: string;
    key: string;
    weight: string | number;
    reps: number;
    completed: unknown;
  }[]) {
    const id = `${row.id}:${row.key}`;
    if (!grouped.has(id)) grouped.set(id, { date: row.date, exercise: row.key, sets: [] });
    grouped.get(id)!.sets.push({
      weight: Number(row.weight),
      reps: row.reps,
      completed: typeof row.completed === 'boolean' ? row.completed : null,
    });
  }
  return [...grouped.values()];
}
async function progressResponse(db: Db, routine: ActiveRoutine, rests: string[], today: string) {
  const records = await planRecords(db, routine.plan, today);
  const progress = routineProgress(routine.plan, rests, today, records);
  const names = [
    ...new Set(
      (progress.today_plan?.target?.exercises ?? []).map((e) => e.exercise.trim().toLowerCase()),
    ),
  ];
  const previous: Record<string, { date: string; sets: { weight: number; reps: number }[] }> = {};
  if (names.length) {
    const result = await db.query(
      `WITH latest AS (
        SELECT DISTINCT ON (lower(trim(s.exercise))) lower(trim(s.exercise)) AS key, w.id, w.date
        FROM sets s JOIN workouts w ON w.id = s.workout_id
        WHERE lower(trim(s.exercise)) = ANY($1::text[]) AND w.date < $2 AND s.completed
        ORDER BY lower(trim(s.exercise)), w.date DESC, w.id DESC
      )
      SELECT l.key, l.date, json_agg(json_build_object('weight', s.weight, 'reps', s.reps) ORDER BY s.position) AS sets
      FROM latest l JOIN sets s ON s.workout_id = l.id AND lower(trim(s.exercise)) = l.key AND s.completed
      GROUP BY l.key, l.date`,
      [names, today],
    );
    for (const row of result.rows as {
      key: string;
      date: string;
      sets: { weight: number | string; reps: number }[];
    }[])
      previous[row.key] = {
        date: row.date,
        sets: row.sets.map((s) => ({ weight: Number(s.weight), reps: s.reps })),
      };
  }
  return {
    routine: { id: routine.id, name: routine.plan.name, splits: routine.plan.splits.length },
    ...progress,
    previous,
  };
}
export function createApp(pool: Pool, options: { today?: () => string } = {}) {
  const today = options.today ?? (() => seoulToday());
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
  app.get('/api/routine-progress', async (_req, res) => {
    const day = today();
    const routine = await activeRoutine(pool, day);
    if (!routine) {
      res.json({ today: day, routine: null });
      return;
    }
    res.json(await progressResponse(pool, routine, await restDates(pool, routine.id), day));
  });
  // Rest today: one row per routine and date. The derived schedule shifts every
  // remaining target at once, so the transaction either applies all or nothing.
  app.post('/api/routines/:id/rests', async (req, res) => {
    const routineId = id(req.params.id);
    const body = z.object({ date }).parse(req.body ?? {});
    const day = today();
    if (body.date !== day) {
      res.status(409).json({ error: '날짜가 바뀌었습니다. 오늘 일정을 다시 확인하세요.' });
      return;
    }
    const result = await routineTransaction(routineId, async (client, routine) => {
      const active = await activeRoutine(client, day);
      if (active?.id !== routineId)
        return fail(409, '진행 중인 루틴에서만 휴식을 선택할 수 있습니다');
      const rests = await restDates(client, routineId);
      // A duplicate click or resend never applies the same rest twice.
      if (rests.includes(day))
        return done(200, {
          applied: false,
          ...(await progressResponse(client, routine, rests, day)),
        });
      const unavailable = routineProgress(routine.plan, rests, day).rest_unavailable;
      if (unavailable) return fail(409, unavailable);
      await client.query(
        'INSERT INTO routine_rests(routine_id, rest_date) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [routineId, day],
      );
      return done(201, {
        applied: true,
        ...(await progressResponse(client, routine, [...rests, day], day)),
      });
    });
    res.status(result.status).json(result.body);
  });
  app.delete('/api/routines/:id/rests/:date', async (req, res) => {
    const routineId = id(req.params.id);
    const restDate = date.parse(req.params.date);
    const day = today();
    if (restDate !== day) {
      res.status(409).json({ error: '휴식 취소는 휴식을 선택한 당일에만 할 수 있습니다' });
      return;
    }
    const result = await routineTransaction(routineId, async (client, routine) => {
      const removed = await client.query(
        'DELETE FROM routine_rests WHERE routine_id=$1 AND rest_date=$2',
        [routineId, day],
      );
      const rests = await restDates(client, routineId);
      return done(200, {
        applied: !!removed.rowCount,
        ...(await progressResponse(client, routine, rests, day)),
      });
    });
    res.status(result.status).json(result.body);
  });
  type Outcome = { status: number; body: unknown; commit: boolean };
  const done = (status: number, body: unknown): Outcome => ({ status, body, commit: true });
  const fail = (status: number, error: string): Outcome => ({
    status,
    body: { error },
    commit: false,
  });
  // Locks the routine row so concurrent rest requests for it are serialized.
  // The response is sent only after the commit succeeds.
  async function routineTransaction(
    routineId: number,
    run: (client: Db, routine: ActiveRoutine) => Promise<Outcome>,
  ): Promise<Outcome> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT id, plan FROM routines WHERE id=$1 FOR UPDATE', [
        routineId,
      ]);
      const routine = found.rows[0] as ActiveRoutine | undefined;
      const outcome = routine ? await run(client, routine) : fail(404, '루틴을 찾을 수 없습니다');
      await client.query(outcome.commit ? 'COMMIT' : 'ROLLBACK');
      return outcome;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
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
  app.get('/api/goals', async (_req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT g.*, EXISTS(SELECT 1 FROM sets s JOIN workouts w ON w.id=s.workout_id WHERE s.completed AND ${exerciseKeySql('s.exercise')}=${exerciseKeySql('g.exercise')} AND s.weight>=g.target_weight AND s.reps>=g.target_reps AND w.date BETWEEN g.start_date AND LEAST(g.deadline,${seoulTodaySql})) achieved FROM goals g ORDER BY g.deadline,g.id DESC`,
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
  // PRs, estimates and weekly body-part totals are recomputed from saved sets on
  // every read. Like goal judgment, sets dated after the Seoul service date are
  // excluded; unsaved browser drafts never reach the server.
  app.get('/api/analysis', async (req, res) => {
    const q = z
      .object({ from: date, to: date })
      .refine((value) => value.from <= value.to, '조회 종료일은 시작일 이후여야 합니다')
      .refine(
        (value) => +new Date(value.to) - +new Date(value.from) <= 370 * 86400000,
        '분석 기간은 371일 이하로 선택하세요',
      )
      .parse(req.query);
    const today: string = (await pool.query(`SELECT ${seoulTodaySql} AS today`)).rows[0].today;
    // Only completed sets are performance (#31); planned sets never set a PR or volume.
    const sets = await pool.query(
      `SELECT s.id, w.date, s.exercise, ${exerciseKeySql('s.exercise')} exercise_key, s.weight, s.reps, (s.machine_id IS NOT NULL AND m.base_weight IS NULL) unknown_base FROM sets s JOIN workouts w ON w.id=s.workout_id LEFT JOIN machines m ON m.id=s.machine_id WHERE w.date <= $1 AND s.completed ORDER BY w.date, s.id`,
      [today],
    );
    const mappings = await pool.query('SELECT exercise, body_part FROM exercise_body_parts');
    res.json({ ...analyze(sets.rows as AnalysisSet[], mappings.rows, q.from, q.to), today });
  });
  app.get('/api/exercise-body-parts', async (_req, res) => {
    const result = await pool.query(
      `SELECT exercise, json_agg(body_part ORDER BY ${partOrder}) body_parts FROM exercise_body_parts GROUP BY exercise ORDER BY exercise`,
    );
    res.json(result.rows);
  });
  // Explicit user mapping only; body parts are never inferred from exercise names.
  // An empty list removes the mapping so the exercise is counted as 미분류.
  app.put('/api/exercise-body-parts', async (req, res) => {
    const m = bodyPartMappingSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const key: string = (
        await client.query(`SELECT ${exerciseKeySql('$1::text')} AS key`, [m.exercise])
      ).rows[0].key;
      await client.query('DELETE FROM exercise_body_parts WHERE exercise=$1', [key]);
      for (const part of m.body_parts)
        await client.query('INSERT INTO exercise_body_parts(exercise, body_part) VALUES($1,$2)', [
          key,
          part,
        ]);
      await client.query('COMMIT');
      res.json({
        exercise: key,
        body_parts: bodyParts.filter((p) => m.body_parts.includes(p)),
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
