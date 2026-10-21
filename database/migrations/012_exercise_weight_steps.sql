-- #86: per-exercise weight increment for progressive overload, set by the user.
-- exercise stores the normalized identity lower(trim(name)) shared with goal judgment
-- and the body part mapping (#32). An exercise without a row uses the 5 kg default.
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS exercise_weight_steps (
  exercise text PRIMARY KEY CHECK (exercise <> '' AND length(exercise) <= 120),
  weight_step numeric(6,2) NOT NULL CHECK (weight_step > 0 AND weight_step <= 100)
);