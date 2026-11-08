import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { cardioKinds, cardioSessionSchemaFor, date } from '../domain.js';
import { parseId, sendError } from '../standard/http.js';

// #114: pace and speed are never stored. They are computed here from the stored duration (whole
// seconds) and distance (km): pace in seconds per km (1 decimal), speed in km/h (2 decimals).
// Both are null when the session has no distance. CSV export uses the same expressions.
export const cardioPaceSql = (alias = '') =>
  `CASE WHEN ${alias}distance_km IS NULL THEN NULL ELSE round(${alias}duration_sec / ${alias}distance_km, 1)::float8 END`;
export const cardioSpeedSql = (alias = '') =>
  `CASE WHEN ${alias}distance_km IS NULL THEN NULL ELSE round(${alias}distance_km * 3600 / ${alias}duration_sec, 2)::float8 END`;
// TIME comes back as HH:MM (the API's format); NUMERIC(8,3) as a JSON number.
const cardioColumns = `id, date, to_char(start_time, 'HH24:MI') AS start_time, kind, duration_sec,
  distance_km::float8 AS distance_km, avg_heart_rate, max_heart_rate, calories_kcal, elevation_gain_m,
  avg_cadence, effort, workout_id, source, external_id, memo, created_at, updated_at,
  ${cardioPaceSql()} AS pace_sec_per_km, ${cardioSpeedSql()} AS speed_kmh`;
const cardioFields =
  'date, start_time, kind, duration_sec, distance_km, avg_heart_rate, max_heart_rate, calories_kcal, elevation_gain_m, avg_cadence, effort, workout_id, source, external_id, memo';
const cardioMissing = '유산소 기록을 찾을 수 없습니다';
const label = '유산소 기록';

export const cardioQuery = z
  .object({
    from: date,
    to: date,
    kind: z.enum(cardioKinds, { error: '종류 필터는 유산소 종류 중 하나여야 합니다' }).optional(),
  })
  .refine((value) => value.from <= value.to, '조회 종료일은 시작일 이후여야 합니다');

type Cardio = z.output<ReturnType<typeof cardioSessionSchemaFor>>;
const values = (c: Cardio) => [
  c.date,
  c.start_time,
  c.kind,
  c.duration_sec,
  c.distance_km,
  c.avg_heart_rate,
  c.max_heart_rate,
  c.calories_kcal,
  c.elevation_gain_m,
  c.avg_cadence,
  c.effort,
  c.workout_id,
  c.source,
  c.external_id,
  c.memo,
];

// A duplicate (source, external_id) is a 409 and an unknown workout_id a 400; both are
// answered by appErrors in routes/shared.ts so create and update share the messages.
export function registerCardioRoutes(app: express.Express, pool: Pool, today: () => string) {
  app.get('/api/cardio-sessions', async (req, res) => {
    const q = cardioQuery.parse(req.query);
    res.json(
      (
        await pool.query(
          `SELECT ${cardioColumns} FROM cardio_sessions WHERE date BETWEEN $1 AND $2 AND ($3::text IS NULL OR kind=$3) ORDER BY date DESC, start_time DESC NULLS LAST, id DESC`,
          [q.from, q.to, q.kind ?? null],
        )
      ).rows,
    );
  });
  app.get('/api/cardio-sessions/:id', async (req, res) => {
    const r = await pool.query(`SELECT ${cardioColumns} FROM cardio_sessions WHERE id=$1`, [
      parseId(req.params.id, label),
    ]);
    if (!r.rowCount) {
      sendError(res, 404, cardioMissing);
      return;
    }
    res.json(r.rows[0]);
  });
  app.post('/api/cardio-sessions', async (req, res) => {
    const c = cardioSessionSchemaFor(today()).parse(req.body);
    const r = await pool.query(
      `INSERT INTO cardio_sessions(${cardioFields}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${cardioColumns}`,
      values(c),
    );
    res.status(201).json(r.rows[0]);
  });
  app.put('/api/cardio-sessions/:id', async (req, res) => {
    const target = parseId(req.params.id, label);
    const c = cardioSessionSchemaFor(today()).parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the row first so a concurrent delete or update waits for this replacement.
      const existing = await client.query('SELECT id FROM cardio_sessions WHERE id=$1 FOR UPDATE', [
        target,
      ]);
      if (!existing.rowCount) {
        await client.query('ROLLBACK');
        sendError(res, 404, cardioMissing);
        return;
      }
      // A full replacement: omitted optional fields become null (memo '', source 'manual').
      const r = await client.query(
        `UPDATE cardio_sessions SET (${cardioFields}, updated_at) = ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP) WHERE id=$16 RETURNING ${cardioColumns}`,
        [...values(c), target],
      );
      await client.query('COMMIT');
      res.json(r.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });
  app.delete('/api/cardio-sessions/:id', async (req, res) => {
    const r = await pool.query('DELETE FROM cardio_sessions WHERE id=$1', [
      parseId(req.params.id, label),
    ]);
    if (!r.rowCount) {
      sendError(res, 404, cardioMissing);
      return;
    }
    res.json({ ok: true });
  });
}
