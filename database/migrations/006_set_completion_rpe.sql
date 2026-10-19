-- Safe for existing volumes and reruns. Sets saved before completion tracking were
-- recorded as performed, so they default to completed and keep their goal results.
ALTER TABLE sets ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT true;
-- RPE is optional: NULL means not recorded and is never treated as 0.
ALTER TABLE sets ADD COLUMN IF NOT EXISTS rpe numeric(3,1)
  CONSTRAINT sets_rpe_check CHECK (rpe IS NULL OR (rpe BETWEEN 1 AND 10 AND rpe * 2 = trunc(rpe * 2)));
