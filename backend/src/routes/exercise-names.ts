import type express from 'express';
import type { Pool } from 'pg';

import { exerciseKeySql } from '../domain.js';

export const exerciseNameLimit = 50;

// #124: exercise name candidates for autocomplete, gathered from journal sets, goals, routine
// plans and machine names. Names are grouped by the identity shared with goals (case and
// surrounding spaces ignored) and shown with their most recent spelling. `uses` counts
// journals, goals and routines that use the name (a journal with three sets counts once);
// `last_used` is the latest journal date, goal start or routine creation day (Asia/Seoul).
// Machines add names without a date. Recent names come first, then frequent ones.
const sql = `
WITH names AS (
  SELECT s.exercise AS name, w.date AS used_on, 'w' || w.id AS use_id
    FROM sets s JOIN workouts w ON w.id = s.workout_id
  UNION ALL
  SELECT exercise, start_date, 'g' || id FROM goals
  UNION ALL
  SELECT e->>'exercise', (r.created_at AT TIME ZONE 'Asia/Seoul')::date, 'r' || r.id
    FROM routines r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.plan->'splits', '[]'::jsonb)) sp
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sp->'exercises', '[]'::jsonb)) e
  UNION ALL
  SELECT name, NULL::date, NULL FROM machines
), keyed AS (
  SELECT trim(name) AS name, ${exerciseKeySql('name')} AS key, used_on, use_id
    FROM names WHERE trim(COALESCE(name, '')) <> ''
)
SELECT (array_agg(name ORDER BY used_on DESC NULLS LAST, name))[1] AS name,
       count(DISTINCT use_id)::int AS uses,
       to_char(max(used_on), 'YYYY-MM-DD') AS last_used
  FROM keyed
 GROUP BY key
 ORDER BY max(used_on) DESC NULLS LAST, count(DISTINCT use_id) DESC, key
 LIMIT ${exerciseNameLimit}`;

export type ExerciseNameRow = { name: string; uses: number; last_used: string | null };

export async function listExerciseNames(db: Pick<Pool, 'query'>): Promise<ExerciseNameRow[]> {
  return (await db.query<ExerciseNameRow>(sql)).rows;
}

export function registerExerciseNameRoutes(app: express.Express, pool: Pool) {
  app.get('/api/exercise-names', async (_req, res) => {
    res.json(await listExerciseNames(pool));
  });
}
