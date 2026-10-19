-- One row per rest chosen on a routine's training day. The shifted schedule is
-- derived from these dates, so saved workouts and sets are never rewritten.
CREATE TABLE IF NOT EXISTS routine_rests (
  routine_id integer NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  rest_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (routine_id, rest_date)
);
