import { AlertBanner } from '../components/ui/alert-banner';
import { Button } from '../components/ui/button';
import { Notice } from '../components/ui/notice';
import type { OfflineSync } from './use-offline-sync';

const titleOf = (body: string) => {
  try {
    const w = JSON.parse(body) as { title?: string; date?: string };
    return `${w.title ?? 'Workout'} (${w.date ?? ''})`;
  } catch {
    return 'Workout';
  }
};

/** #476: what is waiting on the phone, what the server rejected, and what the last send replaced. */
export function SyncStatus({ sync }: { sync: OfflineSync }) {
  const { waiting, rejected, notice } = sync;
  return (
    <>
      {waiting.length > 0 && (
        <Notice
          className="mb-5"
          notice={{
            kind: 'status',
            text: `${waiting.length} workout ${waiting.length === 1 ? 'save is' : 'saves are'} waiting on this phone. They are sent when you are back online.`,
          }}
        />
      )}
      {notice && <Notice className="mb-5" notice={{ kind: 'status', text: notice }} />}
      {rejected.map((r) => (
        <AlertBanner
          key={r.key}
          className="mb-5"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void sync.discard(r.key)}
            >
              Discard
            </Button>
          }
        >
          The server rejected {titleOf(r.body)}: {r.error}
        </AlertBanner>
      ))}
    </>
  );
}
