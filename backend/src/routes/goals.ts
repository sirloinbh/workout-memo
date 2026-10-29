import type express from 'express';
import type { Pool } from 'pg';

import { exerciseKeySql, goalSchema } from '../domain.js';
import { id, seoulTodaySql } from './shared.js';

export function registerGoalRoutes(app: express.Express, pool: Pool) {
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
}
