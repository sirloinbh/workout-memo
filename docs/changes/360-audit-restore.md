# Audit backup restores and make the audit log append-only (#360)

## Change

- A real restore (merge or replace) writes one `audit_log` row (`entity: backup`, `create` for merge, `delete` for replace, with mode, backup version and the per-table summary) in the restore transaction. A preview writes none.
- The restore error log line now carries `requestId`.
- Migration `019_audit_log_append_only.sql`: a trigger rejects every `UPDATE` and any `DELETE` of a row younger than 365 days. Older rows can still be deleted, so the nightly retention delete in `deploy/backup.sh` keeps working.

## Checks

- `backend/test/backup.integration.test.ts`: merge and replace leave one row each with the request ID, preview none, `UPDATE`/early `DELETE` fail, and an old row can be deleted.
