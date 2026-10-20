import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { analyze, bodyPartMappingSchema, type AnalysisSet } from '../analysis.js';
import { bodyParts, date, exerciseKeySql } from '../domain.js';
import { seoulTodaySql } from './shared.js';

const partOrder = `array_position(ARRAY[${bodyParts.map((p) => `'${p}'`).join(',')}]::text[], body_part)`;

export function registerAnalysisRoutes(app: express.Express, pool: Pool) {
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
}
