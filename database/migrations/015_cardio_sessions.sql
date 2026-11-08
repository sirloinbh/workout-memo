-- #114: cardio sessions (running, cycling, rowing, ...). Summary values only: no laps, no GPS
-- route. Pace and speed are not stored; the API computes them from duration and distance.
-- The CHECK constraints mirror shared/contract.ts so a direct SQL write cannot store what the
-- API would reject. "Not after today (Asia/Seoul)" is checked by the API only, because a CHECK
-- must not depend on the current date. Safe for existing volumes and reruns.
CREATE TABLE IF NOT EXISTS cardio_sessions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date NOT NULL,
  -- Local start time in Asia/Seoul; NULL when not recorded.
  start_time time(0),
  kind text NOT NULL CHECK (
    kind IN (
      'running', 'walking', 'outdoor_cycling', 'indoor_cycling', 'rowing',
      'stairs', 'elliptical', 'swimming', 'other'
    )
  ),
  duration_sec integer NOT NULL CHECK (duration_sec > 0 AND duration_sec <= 86400),
  -- Every kind is stored in km (1 m precision); swimming is only shown in m on screens.
  distance_km numeric(8, 3) CHECK (distance_km > 0 AND distance_km <= 1000),
  avg_heart_rate integer CHECK (avg_heart_rate BETWEEN 30 AND 250),
  max_heart_rate integer CHECK (max_heart_rate BETWEEN 30 AND 250),
  calories_kcal integer CHECK (calories_kcal BETWEEN 0 AND 20000),
  elevation_gain_m integer CHECK (elevation_gain_m BETWEEN 0 AND 10000),
  avg_cadence integer CHECK (avg_cadence BETWEEN 1 AND 300),
  -- #83 levels reused: how hard the session felt. NULL means not recorded.
  effort text CHECK (effort IN ('hard', 'medium', 'easy')),
  -- Optional link to a strength workout; deleting the workout only removes the link.
  workout_id integer REFERENCES workouts(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'garmin', 'nike', 'file')),
  external_id text CHECK (external_id IS NULL OR char_length(external_id) BETWEEN 1 AND 200),
  memo text NOT NULL DEFAULT '' CHECK (char_length(memo) <= 2000),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cardio_sessions_heart_rate_order CHECK (
    avg_heart_rate IS NULL OR max_heart_rate IS NULL OR max_heart_rate >= avg_heart_rate
  ),
  CONSTRAINT cardio_sessions_manual_has_no_external_id CHECK (
    source <> 'manual' OR external_id IS NULL
  )
);

-- One imported activity per source: only rows that carry an external id are unique.
CREATE UNIQUE INDEX IF NOT EXISTS cardio_sessions_source_external_id_key
  ON cardio_sessions (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cardio_sessions_date_idx ON cardio_sessions (date);
CREATE INDEX IF NOT EXISTS cardio_sessions_workout_id_idx ON cardio_sessions (workout_id);
