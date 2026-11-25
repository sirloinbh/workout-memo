import { useCallback, useEffect, useRef, useState } from 'react';

import { listQueue, type QueuedSave, removeQueued, updateQueued } from './queue';
import { flushQueue } from './sync';

/**
 * #476: the queue of saves waiting for the server. It is sent when the app opens, when the browser
 * comes back online, and when a new save is queued. `onSynced` runs after the server took any of them.
 */
export function useOfflineSync({ onSynced }: { onSynced: () => void | Promise<unknown> }) {
  const [queue, setQueue] = useState<QueuedSave[]>([]);
  const [notice, setNotice] = useState('');
  const running = useRef(false);
  const again = useRef(false);
  const synced = useRef(onSynced);
  synced.current = onSynced;

  const refresh = useCallback(async () => {
    try {
      setQueue(await listQueue());
    } catch {
      setQueue([]);
    }
  }, []);

  const flush = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        let result;
        try {
          result = await flushQueue();
        } catch {
          break;
        }
        if (result.sent > 0) {
          await synced.current();
          setNotice(
            result.replaced.length
              ? result.replaced
                  .map(
                    (r) =>
                      `The server copy of "${r.title}" (${r.date}) was replaced by the version saved on this phone.`,
                  )
                  .join(' ')
              : `Sent ${result.sent} saved ${result.sent === 1 ? 'workout' : 'workouts'} from this phone to the server.`,
          );
        }
      } while (again.current);
    } finally {
      running.current = false;
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void flush();
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);

  const discard = useCallback(
    async (key: string) => {
      try {
        await removeQueued(key);
      } catch {
        // The entry stays listed; the user can try again.
      }
      await refresh();
    },
    [refresh],
  );

  // #483: a rejected save goes back to waiting (its error cleared) and is sent again at once.
  const retry = useCallback(
    async (key: string) => {
      try {
        const entry = (await listQueue()).find((q) => q.key === key);
        if (entry) {
          const { error: _error, ...waiting } = entry;
          await updateQueued(waiting);
        }
      } catch {
        // The entry stays rejected; the user can try again.
      }
      await flush();
    },
    [flush],
  );

  return {
    queue,
    waiting: queue.filter((q) => !q.error),
    rejected: queue.filter((q) => q.error),
    notice,
    dismissNotice: () => setNotice(''),
    flush,
    retry,
    discard,
  };
}
export type OfflineSync = ReturnType<typeof useOfflineSync>;
