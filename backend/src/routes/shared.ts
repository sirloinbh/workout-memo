import type express from 'express';
import type { Pool } from 'pg';
import { ZodError, z } from 'zod';

export type Db = Pick<Pool, 'query'>;
export const seoulTodaySql = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date";

export function id(v: unknown) {
  return z.coerce.number().int().positive().parse(v);
}

// Every feature shares one error shape: `{ error: string }` with a Korean message.
export function errorHandler(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((x) => x.message).join(', ') });
    return;
  }
  const error =
    typeof err === 'object' && err !== null
      ? (err as { code?: unknown; constraint?: unknown; status?: unknown; message?: unknown })
      : {};
  if (error.code === '23505') {
    res.status(409).json({ error: '이미 등록된 항목입니다' });
    return;
  }
  if (error.code === '23503' && error.constraint === 'machines_official_weight_id_fkey') {
    res.status(400).json({ error: '선택한 공식 참고값이 존재하지 않습니다' });
    return;
  }
  if (error.code === '23503') {
    res.status(400).json({ error: '선택한 머신 또는 브랜드가 존재하지 않습니다' });
    return;
  }
  if (error.status === 413) {
    res.status(413).json({ error: '요청 크기 제한을 초과했습니다 (백업 파일은 최대 10MB).' });
    return;
  }
  if (error.status === 400) {
    res.status(400).json({ error: '요청 형식을 확인하세요' });
    return;
  }
  console.error(JSON.stringify({ event: 'request_error', message: error.message }));
  res.status(500).json({ error: '저장소에 연결할 수 없습니다. 서버 상태를 확인하세요.' });
}
