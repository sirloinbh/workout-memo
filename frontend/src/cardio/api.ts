import type { z } from 'zod/v4';

import type { cardioSessionSchema } from '../contract';
import { requestJson } from '../lib/api';

// #115: a stored session as GET answers it (backend/src/routes/cardio.ts). Pace and speed are
// computed by the server and null without a distance; start_time is HH:MM.
export type CardioSession = z.output<typeof cardioSessionSchema> & {
  id: number;
  pace_sec_per_km: number | null;
  speed_kmh: number | null;
};
type CardioBody = z.output<typeof cardioSessionSchema>;

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
