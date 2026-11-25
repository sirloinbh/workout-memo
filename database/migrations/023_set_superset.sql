-- #481: the superset group of a set within one workout log. NULL means not in a superset.
-- Sets that share a number are one superset; the number has no meaning outside its log.
-- Safe for existing volumes and reruns.
ALTER TABLE sets ADD COLUMN IF NOT EXISTS superset smallint
  CONSTRAINT sets_superset_check CHECK (superset IS NULL OR superset BETWEEN 1 AND 20);
