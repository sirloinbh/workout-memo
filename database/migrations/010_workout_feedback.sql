-- #83: how the whole workout felt. NULL means not recorded; it never defaults to a value.
-- Safe for existing volumes and reruns.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS feedback text
  CONSTRAINT workouts_feedback_check CHECK (feedback IS NULL OR feedback IN ('hard', 'medium', 'easy'));