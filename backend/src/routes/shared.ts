import type express from 'express';
import type { Pool } from 'pg';

import { sendError } from '../standard/http.js';

export type Db = Pick<Pool, 'query'>;
export const seoulTodaySql = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date";

// The app's own error messages (#172). Everything else goes on to the central errorHandler in
// standard/http.ts, which keeps the one `{ error }` shape for every app.
export function appErrors(
  err: unknown,
  _req: express.Request,
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
  if (error.code === '23503') {
    sendError(res, 400, '선택한 머신 또는 브랜드가 존재하지 않습니다');
    return;
  }
  // The backup restore is the one body that may be large, so the limit names it.
  if (error.status === 413) {
    sendError(res, 413, '요청 크기 제한을 초과했습니다 (백업 파일은 최대 10MB).');
    return;
  }
  next(err);
}
