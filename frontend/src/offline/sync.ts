import { RequestError } from '../lib/api';
import { api, Unreachable } from '../workspace/api';
import { listQueue, type QueuedSave, removeQueued, updateQueued } from './queue';

export type SyncResult = {
  /** Saves the server accepted (removed from the queue). */
  sent: number;
  /** Saves that replaced a copy edited on another device meanwhile (#476: last write wins). */
  replaced: { title: string; date: string }[];
  /** The connection failed again; the rest of the queue is untouched. */
  offline: boolean;
};

const conflictText = 'edited on another device';
const windowDays = 180;

const shiftDate = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function newKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The server's current version of the log a queued PUT edits, or null when it cannot be found. */
async function currentVersion(entry: QueuedSave, date: string): Promise<number | null> {
  const id = Number(entry.path.split('/').pop());
  const rows = await api<{ id: number; version: number }[]>(
    `/workouts?from=${shiftDate(date, -windowDays)}&to=${shiftDate(date, windowDays)}`,
  );
  return rows.find((r) => r.id === id)?.version ?? null;
}

async function reject(entry: QueuedSave, error: string) {
  await updateQueued({ ...entry, error });
}

/**
 * Sends the queued saves in order. A rejected save stays with its error and later saves still go out;
 * a lost connection stops the run. A queued edit that hits a version conflict is resent on top of the
 * server's current version, so the phone's copy wins and the caller can tell the user.
 */
export async function flushQueue(): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, replaced: [], offline: false };
  for (const entry of await listQueue()) {
    if (entry.error) continue;
    const payload = JSON.parse(entry.body) as { title: string; date: string; version?: number };
    try {
      await api(entry.path, entry.method, payload, entry.key);
      await removeQueued(entry.key);
      result.sent++;
    } catch (e) {
      if (e instanceof Unreachable) {
        result.offline = true;
        return result;
      }
      const message = e instanceof Error ? e.message : 'The save was rejected';
      if (
        entry.method === 'PUT' &&
        e instanceof RequestError &&
        e.status === 409 &&
        message.includes(conflictText)
      ) {
        let live = entry;
        try {
          const version = await currentVersion(entry, payload.date);
          if (version === null) {
            await reject(entry, 'The log was deleted or moved on another device.');
            continue;
          }
          const retry = { ...payload, version };
          const key = newKey();
          // Replace the entry first: if the resend is cut off, the queue still holds the new key and version.
          await removeQueued(entry.key);
          live = { ...entry, key, body: JSON.stringify(retry) };
          await updateQueued(live);
          await api(entry.path, entry.method, retry, key);
          await removeQueued(key);
          result.sent++;
          result.replaced.push({ title: payload.title, date: payload.date });
          continue;
        } catch (again) {
          if (again instanceof Unreachable) {
            result.offline = true;
            return result;
          }
          await reject(live, again instanceof Error ? again.message : 'The save was rejected');
          continue;
        }
      }
      await reject(entry, message);
    }
  }
  return result;
}
