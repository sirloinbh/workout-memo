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
    sendError(res, 400, '선택한 공식 참고값이 존재하지 않습니다');
    return;
  }
  // #114: a cardio session links to a strength workout that does not exist, or repeats an
  // imported activity (same source and external id).
  if (error.code === '23503' && error.constraint === 'cardio_sessions_workout_id_fkey') {
    sendError(res, 400, '연결할 근력 일지가 존재하지 않습니다');
    return;
  }
  if (error.code === '23505' && error.constraint === 'cardio_sessions_source_external_id_key') {
    sendError(res, 409, '같은 출처와 외부 ID의 유산소 기록이 이미 있습니다');
    return;
  }
  if (error.code === '23503') {
    sendError(res, 400, '선택한 머신 또는 브랜드가 존재하지 않습니다');
    return;
  }
  // Only the backup routes take a large body, so only they name the 10MB limit. Other routes
  // over the 256kb limit get the central "요청 본문이 너무 큽니다".
  if (error.status === 413 && req.path.startsWith('/api/backup/')) {
    sendError(res, 413, '요청 크기 제한을 초과했습니다 (백업 파일은 최대 10MB).');
    return;
  }
  next(err);
}
