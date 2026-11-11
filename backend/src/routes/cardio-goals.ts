import type express from 'express';
import type { Pool } from 'pg';

import { type CardioGoalSession, judgeCardioGoal, suggestCardioGoal } from '../cardio-goals.js';
import { type CardioGoal, cardioGoalSchema } from '../domain.js';
import { parseId, sendError } from '../standard/http.js';

// #116: cardio goals beside the strength goals of routes/goals.ts. The server judges them on
// every read from the stored sessions, like the strength goals' `achieved`.
const goalColumns = `id, goal_type, kind, period, target_distance_km::float8 AS target_distance_km,
  target_duration_sec, target_count, start_date, deadline, created_at`;
const goalFields =
  'goal_type, kind, period, target_distance_km, target_duration_sec, target_count, start_date, deadline';
type StoredGoal = CardioGoal & { id: number; created_at: string };

export function registerCardioGoalRoutes(app: express.Express, pool: Pool, today: () => string) {
  app.get('/api/cardio-goals', async (_req, res) => {
    const goals = (
      await pool.query<StoredGoal>(
        `SELECT ${goalColumns} FROM cardio_goals ORDER BY deadline, id DESC`,
      )
    ).rows;
    const day = today();
    const from = goals.reduce((min, g) => (g.start_date < min ? g.start_date : min), day);
    // One read for every goal: sessions from the earliest start up to today (Seoul).
    const sessions = goals.length
      ? (
          await pool.query<CardioGoalSession>(
            'SELECT date, kind, duration_sec, distance_km::float8 AS distance_km FROM cardio_sessions WHERE date BETWEEN $1 AND $2',
            [from, day],
          )
        ).rows
      : [];
    res.json(goals.map((g) => ({ ...g, ...judgeCardioGoal(g, sessions, day) })));
  });
  app.post('/api/cardio-goals', async (req, res) => {
    const g = cardioGoalSchema.parse(req.body);
    res
      .status(201)
      .json(
        (
          await pool.query(
            `INSERT INTO cardio_goals(${goalFields}) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${goalColumns}`,
            [
              g.goal_type,
              g.kind,
              g.period,
              g.target_distance_km,
              g.target_duration_sec,
              g.target_count,
              g.start_date,
              g.deadline,
            ],
          )
        ).rows[0],
      );
  });
  // #251: the next goal after this one, computed and never stored (like GET /api/goal-suggestion).
  // The screen offers it only on an achieved goal; `suggestion` is null past the allowed range.
  app.get('/api/cardio-goals/:id/suggestion', async (req, res) => {
    const goal = (
      await pool.query<StoredGoal>(`SELECT ${goalColumns} FROM cardio_goals WHERE id=$1`, [
        parseId(req.params.id, 'cardio goal'),
      ])
    ).rows[0];
    if (!goal) {
      sendError(res, 404, 'Cardio goal not found');
      return;
    }
    const { id: _id, created_at: _created, ...input } = goal;
    res.json({ goal_id: goal.id, suggestion: suggestCardioGoal(input, today()) });
  });
  app.delete('/api/cardio-goals/:id', async (req, res) => {
    const r = await pool.query('DELETE FROM cardio_goals WHERE id=$1', [
      parseId(req.params.id, 'cardio goal'),
    ]);
    if (!r.rowCount) {
      sendError(res, 404, 'Cardio goal not found');
      return;
    }
    res.json({ ok: true });
  });
}
