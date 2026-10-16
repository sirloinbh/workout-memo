-- Safe for existing volumes; existing sets retain an empty memo.
ALTER TABLE sets ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
