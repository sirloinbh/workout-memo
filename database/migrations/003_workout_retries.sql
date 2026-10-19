ALTER TABLE workouts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
-- Keep expired keys as tombstones: an old request must never become a new insert.
CREATE TABLE IF NOT EXISTS workout_requests (
  key uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status integer NOT NULL,
  response jsonb NOT NULL
);
