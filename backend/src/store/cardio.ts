import type { z } from 'zod/v4';

import type { cardioSessionSchemaFor } from '../domain.js';

// Cardio session data access (#366). The writable columns are defined once, in `fields`: the column list, the
// values, the $1..$n placeholders and the multi-row (unnest) insert are all built from it, so they cannot drift.

// #114: pace and speed are never stored. They are computed from the stored duration (whole seconds) and
// distance (km): pace in seconds per km (1 decimal), speed in km/h (2 decimals). Both are null when the session
// has no distance. CSV export uses the same expressions.
export const cardioPaceSql = (alias = '') =>
  `CASE WHEN ${alias}distance_km IS NULL THEN NULL ELSE round(${alias}duration_sec / ${alias}distance_km, 1)::float8 END`;
export const cardioSpeedSql = (alias = '') =>
  `CASE WHEN ${alias}distance_km IS NULL THEN NULL ELSE round(${alias}distance_km * 3600 / ${alias}duration_sec, 2)::float8 END`;

export type Cardio = z.output<ReturnType<typeof cardioSessionSchemaFor>>;

// Column name → the PostgreSQL type of its array in a multi-row insert, in the order of the INSERT.
const fields = [
  ['date', 'date'],
  ['start_time', 'time'],
  ['kind', 'text'],
  ['duration_sec', 'int'],
  ['distance_km', 'numeric'],
  ['avg_heart_rate', 'int'],
  ['max_heart_rate', 'int'],
  ['calories_kcal', 'int'],
  ['elevation_gain_m', 'int'],
  ['avg_cadence', 'int'],
  ['effort', 'text'],
  ['workout_id', 'int'],
  ['source', 'text'],
  ['external_id', 'text'],
  ['memo', 'text'],
] as const satisfies readonly (readonly [keyof Cardio, string])[];

export const cardioFields = fields.map(([name]) => name).join(', ');
const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');

// TIME comes back as HH:MM (the API's format); NUMERIC(8,3) as a JSON number.
export const cardioColumns = `id, date, to_char(start_time, 'HH24:MI') AS start_time, kind, duration_sec,
  distance_km::float8 AS distance_km, avg_heart_rate, max_heart_rate, calories_kcal, elevation_gain_m,
  avg_cadence, effort, workout_id, source, external_id, memo, created_at, updated_at,
  ${cardioPaceSql()} AS pace_sec_per_km, ${cardioSpeedSql()} AS speed_kmh`;

/** The values of one session, in the order of the columns (`$1..$n`). */
export const cardioValues = (c: Cardio) => fields.map(([name]) => c[name]);

export const insertCardioSql = `INSERT INTO cardio_sessions(${cardioFields}) VALUES(${placeholders}) RETURNING ${cardioColumns}`;

/** `$n+1` is the id of the session to replace; the values are `[...cardioValues(c), id]`. */
export const updateCardioSql = `UPDATE cardio_sessions SET (${cardioFields}, updated_at) = (${placeholders},CURRENT_TIMESTAMP) WHERE id=$${fields.length + 1} RETURNING ${cardioColumns}`;

/** One INSERT for many sessions (#368); ids follow the order of `rows`. Its values are `cardioColumnArrays(rows)`. */
export const insertCardioRowsSql = `INSERT INTO cardio_sessions(${cardioFields})
  SELECT ${cardioFields} FROM unnest(${fields.map(([, type], i) => `$${i + 1}::${type}[]`).join(', ')})
    WITH ORDINALITY AS t(${cardioFields}, ord) ORDER BY ord
  RETURNING ${cardioColumns}`;

/** The same values as `cardioValues`, one array per column (for `insertCardioRowsSql`). */
export const cardioColumnArrays = (rows: Cardio[]) =>
  fields.map(([name]) => rows.map((r) => r[name]));
