import type express from 'express';
import type { Pool } from 'pg';

import { bodyMeasurementSchema, dateRange } from '../domain.js';
import { id } from './shared.js';

// NUMERIC(5,2) is returned as a JSON number; NULL stays null (never estimated or 0).
const bodyColumns =
  'id, date, body_weight_kg::float8 AS body_weight_kg, body_fat_percent::float8 AS body_fat_percent, skeletal_muscle_kg::float8 AS skeletal_muscle_kg';
const bodyConflict = '이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요.';
const bodyMissing = '신체 기록을 찾을 수 없습니다';

export function registerBodyMeasurementRoutes(app: express.Express, pool: Pool) {
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
}
