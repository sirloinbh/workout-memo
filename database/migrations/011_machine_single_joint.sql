-- #84: whether a machine trains a single joint (e.g. leg extension), set by the user.
-- The rest timer uses it to pick the single-joint default. Existing machines start as
-- not single-joint, which keeps their current rest. Safe for existing volumes and reruns.
ALTER TABLE machines ADD COLUMN IF NOT EXISTS single_joint boolean NOT NULL DEFAULT false;