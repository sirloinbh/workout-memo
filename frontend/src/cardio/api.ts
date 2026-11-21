import type { z } from 'zod/v4';

import type { cardioSessionSchema } from '../../../shared/contract';
import { RequestError, requestJson } from '../lib/api';

// #115: a stored session as GET answers it (backend/src/routes/cardio.ts). Pace and speed are
// computed by the server and null without a distance; start_time is HH:MM.
export type CardioSession = z.output<typeof cardioSessionSchema> & {
  id: number;
  pace_sec_per_km: number | null;
  speed_kmh: number | null;
};
export type CardioBody = z.output<typeof cardioSessionSchema>;

const base = '/api/cardio-sessions';

export const listCardioSessions = (from: string, to: string) =>
  requestJson<CardioSession[]>(`${base}?from=${from}&to=${to}`);

// PUT replaces the whole record, so the body must carry every field (source and external_id
// included) or the server resets them to their defaults.
export const saveCardioSession = (body: CardioBody, id?: number) =>
  requestJson<CardioSession>(id === undefined ? base : `${base}/${id}`, {
    method: id === undefined ? 'POST' : 'PUT',
    body,
  });

export const deleteCardioSession = (id: number) =>
  requestJson<{ ok: true }>(`${base}/${id}`, { method: 'DELETE' });

// #115: all-time personal records (GET /api/cardio-sessions/records). The 5 km and 10 km bests
// count only running sessions within ±2% of the distance; null when there is none.
export type CardioRecord = { id: number; date: string; distance_km: number; duration_sec: number };
export type CardioRecords = {
  longest: (CardioRecord & { kind: CardioSession['kind'] })[];
  best5k: CardioRecord | null;
  best10k: CardioRecord | null;
};
export const getCardioRecords = () => requestJson<CardioRecords>(`${base}/records`);

// #119: activities read from files, saved together (POST /api/cardio-sessions/import). Every row
// is saved or none. A refusal carries each refused row's reason by its index; the central
// requestJson keeps only the message, so this request reads the answer itself.
export type CardioImportProblem = { index: number; message: string };
export class CardioImportError extends RequestError {
  readonly rows: CardioImportProblem[];

  constructor(message: string, status: number | undefined, rows: CardioImportProblem[] = []) {
    super(message, status);
    this.name = 'CardioImportError';
    this.rows = rows;
  }
}
type ImportAnswer = { error?: unknown; rows?: CardioImportProblem[]; sessions?: CardioSession[] };
// The answer body as JSON, or {} when it is not JSON (a proxy's HTML page): the message then comes
// from the status, never from a JSON parse error.
const readAnswer = async (response: Response): Promise<ImportAnswer | null> => {
  try {
    return JSON.parse(await response.text()) as ImportAnswer;
  } catch {
    return null;
  }
};
export async function importCardioSessions(sessions: CardioBody[]) {
  let response: Response;
  try {
    response = await fetch(`${base}/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessions }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CardioImportError('Cannot reach the server', undefined);
  }
  const data = await readAnswer(response);
  if (!response.ok)
    throw new CardioImportError(
      typeof data?.error === 'string' && data.error
        ? data.error
        : `The server could not process the import (HTTP ${response.status})`,
      response.status,
      Array.isArray(data?.rows) ? data.rows : [],
    );
  return data?.sessions ?? [];
}
