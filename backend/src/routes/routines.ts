import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  date,
  routineSchema,
  routineSchedule,
  type Feedback,
  type RoutinePlan,
} from '../domain.js';
import {
  exerciseKey,
  isAuto,
  planEndDate,
  routineProgress,
  withWeightSteps,
  type WorkoutRecord,
} from '../progress.js';
import { id, type Db } from './shared.js';

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
    `SELECT w.id, w.date, w.feedback, lower(trim(s.exercise)) AS key, s.weight, s.reps,
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
    feedback: Feedback | null;
    key: string;
    weight: string | number;
    reps: number;
    completed: unknown;
  }[]) {
    const id = `${row.id}:${row.key}`;
    if (!grouped.has(id))
      grouped.set(id, { date: row.date, exercise: row.key, sets: [], feedback: row.feedback });
    grouped.get(id)!.sets.push({
      weight: Number(row.weight),
      reps: row.reps,
      completed: typeof row.completed === 'boolean' ? row.completed : null,
    });
  }
  return [...grouped.values()];
}
// #86: the user's per-exercise increments, keyed by the normalized exercise name.
async function weightSteps(db: Db) {
  const result = await db.query('SELECT exercise, weight_step FROM exercise_weight_steps');
  return Object.fromEntries(
    result.rows.map((r: { exercise: string; weight_step: string }) => [
      r.exercise,
      Number(r.weight_step),
    ]),
  );
}
async function progressResponse(db: Db, routine: ActiveRoutine, rests: string[], today: string) {
  const plan = withWeightSteps(routine.plan, await weightSteps(db));
  const records = await planRecords(db, plan, today);
  const progress = routineProgress(plan, rests, today, records);
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

type Outcome = { status: number; body: unknown; commit: boolean };
const done = (status: number, body: unknown): Outcome => ({ status, body, commit: true });
const fail = (status: number, error: string): Outcome => ({
  status,
  body: { error },
  commit: false,
});

export function registerRoutineRoutes(app: express.Express, pool: Pool, today: () => string) {
  app.post('/api/routines', async (req, res) => {
    const plan = routineSchema.parse(req.body);
    // jsonb has no foreign key, so a referenced machine is checked here (#82).
    const machineIds = [
      ...new Set(plan.splits.flatMap((s) => s.exercises.map((e) => e.machine_id ?? null))),
    ].filter((v): v is number => v !== null);
    if (machineIds.length) {
      const found = await pool.query('SELECT count(*)::int n FROM machines WHERE id = ANY($1)', [
        machineIds,
      ]);
      if (found.rows[0].n !== machineIds.length) {
        res.status(400).json({ error: '루틴에 지정한 머신을 찾을 수 없습니다' });
        return;
      }
    }
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
}
