import express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { cardioKinds, cardioSessionObject, cardioSessionSchemaFor, date } from '../domain.js';
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

// #115: all-time personal records (not limited to a period). Best 5 km and 10 km times count
// only running sessions whose distance is within ±2% of the target (4.9–5.1 km, 9.8–10.2 km); a
// longer run's time is never scaled down (2026-11-08 user decision 4). The window is computed in
// NUMERIC, so 4.9 and 5.1 are exact bounds. Ties go to the earlier session.
const recordColumns = 'id, date, distance_km::float8 AS distance_km, duration_sec';
const bestTimeSql = `SELECT ${recordColumns} FROM cardio_sessions
  WHERE kind='running' AND distance_km BETWEEN $1::numeric * 0.98 AND $1::numeric * 1.02
  ORDER BY duration_sec, date, id LIMIT 1`;
type CardioRecord = { id: number; date: string; distance_km: number; duration_sec: number };

export async function cardioRecords(pool: Pool) {
  const [longest, best5k, best10k] = await Promise.all([
    pool.query<CardioRecord & { kind: (typeof cardioKinds)[number] }>(
      `SELECT DISTINCT ON (kind) kind, ${recordColumns} FROM cardio_sessions
        WHERE distance_km IS NOT NULL ORDER BY kind, distance_km DESC, date, id`,
    ),
    pool.query<CardioRecord>(bestTimeSql, [5]),
    pool.query<CardioRecord>(bestTimeSql, [10]),
  ]);
  // One row per kind that has a distance, in the order of cardioKinds (running first).
  const order = (kind: (typeof cardioKinds)[number]) => cardioKinds.indexOf(kind);
  return {
    longest: [...longest.rows].sort((a, b) => order(a.kind) - order(b.kind)),
    best5k: best5k.rows[0] ?? null,
    best10k: best10k.rows[0] ?? null,
  };
}

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
  // Registered before /:id so "records" is never read as an id.
  app.get('/api/cardio-sessions/records', async (_req, res) => {
    res.json(await cardioRecords(pool));
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

// #119: activities read from files, saved together. Every row is checked first; if any row is
// invalid or was imported before (same source and external id, in the table or twice in the
// request), nothing is saved and each such row's reason comes back by its index, so the preview
// can show it next to the row (2026-11-08 user decision 3). Cross-source look-alikes are only
// candidates the preview asks about; they are not refused here.
export const cardioImportLimit = 200;
export const cardioImportRequest = z.object({
  sessions: z
    .array(z.unknown(), { error: '가져올 유산소 기록 목록(sessions)을 배열로 보내세요' })
    .min(1, '가져올 유산소 기록을 1건 이상 선택하세요')
    .max(cardioImportLimit, `유산소 기록은 한 번에 ${cardioImportLimit}건까지 가져올 수 있습니다`),
});
// The same body with the row schema spelled out, for the OpenAPI document.
export const cardioImportDocument = z.object({
  sessions: z.array(cardioSessionObject).min(1).max(cardioImportLimit),
});
export type CardioImportProblem = { index: number; message: string };
const importedOnly = '가져온 기록에는 출처(file·garmin·nike)와 외부 ID가 필요합니다';
const shownIssues = 3;

function importRows(body: unknown, today: string) {
  const { sessions } = cardioImportRequest.parse(body);
  const schema = cardioSessionSchemaFor(today);
  const rows: Cardio[] = [];
  const problems: CardioImportProblem[] = [];
  const seen = new Map<string, number>();
  sessions.forEach((input, index) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message);
      problems.push({ index, message: messages.slice(0, shownIssues).join(', ') });
      return;
    }
    const row = parsed.data;
    if (row.source === 'manual' || row.external_id === null) {
      problems.push({ index, message: importedOnly });
      return;
    }
    const key = `${row.source}\u0000${row.external_id}`;
    const first = seen.get(key);
    if (first !== undefined) {
      problems.push({ index, message: `${first + 1}번째 행과 같은 활동입니다` });
      return;
    }
    seen.set(key, index);
    rows[index] = row;
  });
  return { rows, problems };
}

function sendImportProblems(
  res: express.Response,
  status: number,
  problems: CardioImportProblem[],
) {
  const rows = [...problems].sort((a, b) => a.index - b.index);
  res.status(status).json({
    error: `${rows.length}건에 문제가 있어 아무것도 저장하지 않았습니다`,
    rows,
  });
}

// A row may carry a 2000-character memo (about 6 KB of Korean in JSON), so 200 rows do not fit
// the app-wide 256kb body limit. This route parses its own body and is registered before that
// parser (app.ts), like the backup routes.
export const cardioImportMaxBytes = 2 * 1024 * 1024;
export function registerCardioImportRoute(
  app: express.Express,
  pool: Pool,
  today: () => string,
  json = express.json({ limit: cardioImportMaxBytes }),
) {
  app.post('/api/cardio-sessions/import', json, async (req, res) => {
    const { rows, problems } = importRows(req.body, today());
    if (problems.length) {
      sendImportProblems(res, 400, problems);
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ source: string; external_id: string }>(
        `SELECT source, external_id FROM cardio_sessions
          WHERE (source, external_id) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
        [rows.map((r) => r.source), rows.map((r) => r.external_id)],
      );
      const taken = new Set(existing.rows.map((r) => `${r.source}\u0000${r.external_id}`));
      const repeated = rows.flatMap((r, index) =>
        taken.has(`${r.source}\u0000${r.external_id}`)
          ? [{ index, message: '이미 가져온 활동입니다' }]
          : [],
      );
      if (repeated.length) {
        await client.query('ROLLBACK');
        sendImportProblems(res, 409, repeated);
        return;
      }
      const saved = [];
      for (const row of rows)
        saved.push(
          (
            await client.query(
              `INSERT INTO cardio_sessions(${cardioFields}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${cardioColumns}`,
              values(row),
            )
          ).rows[0],
        );
      await client.query('COMMIT');
      res.status(201).json({ sessions: saved });
    } catch (e) {
      // A concurrent import of the same activity ends in the unique index (409 by appErrors);
      // an unknown workout_id in its foreign key (400). Either way nothing is kept.
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });
}
