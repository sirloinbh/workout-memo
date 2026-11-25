import { AlertBanner } from '../components/ui/alert-banner';
import { Button } from '../components/ui/button';
import { Notice } from '../components/ui/notice';
import type { QueuedSave } from './queue';
import type { OfflineSync } from './use-offline-sync';

const describe = (entry: QueuedSave) => {
  try {
    const w = JSON.parse(entry.body) as { title?: string; date?: string };
    return `${w.title || 'Workout'} (${w.date ?? ''})`;
  } catch {
    return 'Workout';
  }
};

/** #483: the app-shell count of logs that are only on the phone, and of saves the server rejected. */
export function SyncBadge({ sync }: { sync: Pick<OfflineSync, 'waiting' | 'rejected'> }) {
  const { waiting, rejected } = sync;
  const parts = [
    waiting.length ? `${waiting.length} waiting to sync` : '',
    rejected.length ? `${rejected.length} not saved` : '',
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <span
      data-slot="sync-badge"
      role="status"
      className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
    >
      {parts.join(' · ')}
    </span>
  );
}

/** #476 / #483: each log still only on the phone, saves the server rejected (retry or discard), and what the last send replaced. */
export function SyncStatus({ sync }: { sync: OfflineSync }) {
  const { waiting, rejected, notice } = sync;
  return (
    <>
      {waiting.length > 0 && (
        <ul aria-label="Logs waiting to sync" className="mb-5 grid gap-1 text-sm">
          {waiting.map((w) => (
            <li
              key={w.key}
              data-slot="waiting-log"
              className="rounded-md border border-border px-3 py-2 text-muted-foreground"
            >
              <span className="font-medium text-foreground">Waiting to sync</span> · {describe(w)}{' '}
              is only on this phone. It is sent when you are back online.
            </li>
          ))}
        </ul>
      )}
      {notice && <Notice className="mb-5" notice={{ kind: 'status', text: notice }} />}
      {rejected.map((r) => (
        <AlertBanner
          key={r.key}
          className="mb-5"
          action={
            <span className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void sync.retry(r.key)}>
                Retry
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void sync.discard(r.key)}
              >
                Discard
              </Button>
            </span>
          }
        >
          The server rejected {describe(r)}: {r.error}
        </AlertBanner>
      ))}
    </>
  );
}
