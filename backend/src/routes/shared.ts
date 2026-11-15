import type express from 'express';
import type { Pool } from 'pg';

import { sendError } from '../standard/http.js';

export type Db = Pick<Pool, 'query'>;
export const seoulTodaySql = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date";

// The app's own error messages (#172). Everything else goes on to the central errorHandler in
// standard/http.ts, which keeps the one `{ error }` shape for every app.
export function appErrors(
  err: unknown,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const error =
    typeof err === 'object' && err !== null
      ? (err as { code?: unknown; constraint?: unknown; status?: unknown })
      : {};
  if (error.code === '23503' && error.constraint === 'machines_official_weight_id_fkey') {
    sendError(res, 400, 'The selected official reference does not exist');
    return;
  }
  // #114: a cardio session links to a strength workout that does not exist, or repeats an
  // imported activity (same source and external id).
  if (error.code === '23503' && error.constraint === 'cardio_sessions_workout_id_fkey') {
    sendError(res, 400, 'The strength journal to link does not exist');
    return;
  }
  if (error.code === '23505' && error.constraint === 'cardio_sessions_source_external_id_key') {
    sendError(res, 409, 'A cardio record with the same source and external ID already exists');
    return;
  }
  if (error.code === '23503') {
    sendError(res, 400, 'The selected machine or brand does not exist');
    return;
  }
  // Only the backup routes take a large body, so only they name the 10MB limit. Other routes
  // over the 256kb limit get the central "Request body is too large".
  if (error.status === 413 && req.path.startsWith('/api/backup/')) {
    sendError(res, 413, 'Request size limit exceeded (backup files up to 10 MB).');
    return;
  }
  next(err);
}
