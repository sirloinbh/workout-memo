-- #116: cardio goals. Two families (2026-11-08 user decisions D1~D5):
--   * repeating period totals: distance, duration or session count per week (Mon~Sun, Seoul)
--     or calendar month, judged period by period between start_date and deadline;
--   * records: one session of at least a distance within a time (record_time), or a longest
--     distance (longest_distance). Records always name a cardio kind.
-- The CHECK constraints mirror shared/contract.ts so a direct SQL write cannot store what the
-- API would reject. Strength goals stay in the goals table. Safe for existing volumes and reruns.
CREATE TABLE IF NOT EXISTS cardio_goals (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  goal_type text NOT NULL CHECK (
    goal_type IN ('distance', 'duration', 'count', 'record_time', 'longest_distance')
  ),
  -- NULL means every kind; record goals require one.
  kind text CHECK (
    kind IN (
      'running', 'walking', 'outdoor_cycling', 'indoor_cycling', 'rowing',
      'stairs', 'elliptical', 'swimming', 'other'
    )
  ),
  period text CHECK (period IN ('week', 'month')),
  target_distance_km numeric(8, 3) CHECK (target_distance_km > 0 AND target_distance_km <= 10000),
  target_duration_sec integer CHECK (target_duration_sec > 0 AND target_duration_sec <= 2678400),
  target_count integer CHECK (target_count BETWEEN 1 AND 1000),
  start_date date NOT NULL,
  deadline date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cardio_goals_dates CHECK (deadline >= start_date),
  -- Each goal type carries exactly its own targets; period totals have a period, records do not.
  CONSTRAINT cardio_goals_shape CHECK (
    CASE goal_type
      WHEN 'distance' THEN period IS NOT NULL AND target_distance_km IS NOT NULL
        AND target_duration_sec IS NULL AND target_count IS NULL
      WHEN 'duration' THEN period IS NOT NULL AND target_duration_sec IS NOT NULL
        AND target_distance_km IS NULL AND target_count IS NULL
      WHEN 'count' THEN period IS NOT NULL AND target_count IS NOT NULL
        AND target_distance_km IS NULL AND target_duration_sec IS NULL
      WHEN 'record_time' THEN period IS NULL AND kind IS NOT NULL
        AND target_distance_km IS NOT NULL AND target_duration_sec IS NOT NULL AND target_count IS NULL
      WHEN 'longest_distance' THEN period IS NULL AND kind IS NOT NULL
        AND target_distance_km IS NOT NULL AND target_duration_sec IS NULL AND target_count IS NULL
    END
  )
);
