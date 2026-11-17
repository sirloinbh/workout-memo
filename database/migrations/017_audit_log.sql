-- Audit log (project-standards#553, docs/audit-log.md there): one row for each change a user or an AI tool makes.
-- backend/src/standard/audit.ts writes it; the nightly backup deletes rows older than a year.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'ai-tool', 'system')),
  actor_id TEXT,
  client TEXT,
  tool TEXT,
  action TEXT NOT NULL CHECK (action IN ('read', 'create', 'update', 'delete')),
  entity TEXT NOT NULL,
  entity_id TEXT,
  result TEXT NOT NULL DEFAULT 'ok' CHECK (result IN ('ok', 'denied', 'error')),
  before JSONB,
  after JSONB,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity, entity_id);
