-- #360: the audit log is append-only. UPDATE is always rejected; DELETE is rejected too, except for
-- rows older than the retention window (365 days, AUDIT_RETENTION_DAYS), which the nightly backup
-- (deploy/backup.sh) removes.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.at < now() - make_interval(days => 365) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% rejected)', TG_OP USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
