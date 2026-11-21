-- #368: almost every query joins sets on workout_id, and deleting a workout cascades through it.
CREATE INDEX IF NOT EXISTS sets_workout_idx ON sets(workout_id, position);
