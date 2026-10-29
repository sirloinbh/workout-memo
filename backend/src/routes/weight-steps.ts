import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { defaultWeightStep, exerciseKeySql, weightStepSchema } from '../domain.js';

export const goalSuggestionQuery = z
  .object({ exercise: z.string().trim().min(1).max(120) })
  .strict();
const round = (value: number) => Math.round(value * 100) / 100;

// #86: progressive overload increments per exercise (default 5 kg) and the next goal
// suggested from them. Exercise identity is the normalized name shared with goals.
export function registerWeightStepRoutes(app: express.Express, pool: Pool) {
  app.get('/api/exercise-weight-steps', async (_req, res) => {
    const result = await pool.query(
      'SELECT exercise, weight_step::float8 weight_step FROM exercise_weight_steps ORDER BY exercise',
    );
    res.json(result.rows);
  });
  // null removes the setting so the exercise goes back to the default increment.
  app.put('/api/exercise-weight-steps', async (req, res) => {
    const s = weightStepSchema.parse(req.body);
    const key: string = (
      await pool.query(`SELECT ${exerciseKeySql('$1::text')} AS key`, [s.exercise])
    ).rows[0].key;
    if (s.weight_step === null)
      await pool.query('DELETE FROM exercise_weight_steps WHERE exercise=$1', [key]);
    else
      await pool.query(
        `INSERT INTO exercise_weight_steps(exercise, weight_step) VALUES($1,$2)
         ON CONFLICT (exercise) DO UPDATE SET weight_step=EXCLUDED.weight_step`,
        [key, s.weight_step],
      );
    res.json({
      exercise: key,
      weight_step: s.weight_step ?? defaultWeightStep,
      custom: s.weight_step !== null,
    });
  });
  // The next goal adds the increment to the latest goal of the exercise, or without one
  // to the heaviest completed set of its latest workout. Nothing is saved here.
  app.get('/api/goal-suggestion', async (req, res) => {
    const q = goalSuggestionQuery.parse(req.query);
    const key: string = (
      await pool.query(`SELECT ${exerciseKeySql('$1::text')} AS key`, [q.exercise])
    ).rows[0].key;
    const step = (
      await pool.query(
        'SELECT weight_step::float8 weight_step FROM exercise_weight_steps WHERE exercise=$1',
        [key],
      )
    ).rows[0]?.weight_step as number | undefined;
    const goal = (
      await pool.query(
        `SELECT target_weight::float8 weight, target_reps reps FROM goals
         WHERE ${exerciseKeySql('exercise')}=$1 ORDER BY id DESC LIMIT 1`,
        [key],
      )
    ).rows[0];
    const record = goal
      ? undefined
      : (
          await pool.query(
            `SELECT s.weight::float8 weight, s.reps, w.date FROM sets s JOIN workouts w ON w.id=s.workout_id
             WHERE s.completed AND ${exerciseKeySql('s.exercise')}=$1
             ORDER BY w.date DESC, w.id DESC, s.weight DESC, s.reps DESC LIMIT 1`,
            [key],
          )
        ).rows[0];
    const base = goal
      ? { source: 'goal' as const, ...goal }
      : record
        ? { source: 'record' as const, ...record }
        : null;
    const weightStep = step ?? defaultWeightStep;
    res.json({
      exercise: key,
      weight_step: weightStep,
      custom: step !== undefined,
      base,
      target_weight: base ? Math.min(99999, round(base.weight + weightStep)) : null,
    });
  });
}
