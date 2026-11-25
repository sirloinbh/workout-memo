import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { listQueue, type QueuedSave, type QueueStore, useQueueStore } from './queue';
import { useOfflineSync } from './use-offline-sync';

// #483: retry puts a rejected save back to waiting and sends it again.
const rows = new Map<string, QueuedSave>();
const store: QueueStore = {
  all: () => Promise.resolve([...rows.values()]),
  put: (e) => Promise.resolve(void rows.set(e.key, e)),
  remove: (k) => Promise.resolve(void rows.delete(k)),
};
let previous: QueueStore;
let fail: boolean;
beforeEach(() => {
  rows.clear();
  fail = true;
  previous = useQueueStore(store);
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(JSON.stringify(fail ? { error: 'Enter a title' } : { id: 1, version: 1 }), {
        status: fail ? 400 : 201,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});
afterEach(() => {
  useQueueStore(previous);
  vi.unstubAllGlobals();
});

test('retry clears the error, resends the save and empties the queue once the server accepts it', async () => {
  rows.set('k', {
    key: 'k',
    path: '/workouts',
    method: 'POST',
    body: JSON.stringify({ title: 'Legs', date: '2026-11-25' }),
    queuedAt: 1,
  });
  const onSynced = vi.fn();
  const { result } = renderHook(() => useOfflineSync({ onSynced }));
  await waitFor(() => expect(result.current.rejected).toHaveLength(1));
  expect(result.current.rejected[0].error).toBe('Enter a title');
  fail = false;
  await act(() => result.current.retry('k'));
  await waitFor(() => expect(result.current.queue).toHaveLength(0));
  expect(await listQueue()).toEqual([]);
  expect(onSynced).toHaveBeenCalled();
});

test('discard removes a rejected save', async () => {
  rows.set('k', {
    key: 'k',
    path: '/workouts',
    method: 'POST',
    body: JSON.stringify({ title: 'Legs', date: '2026-11-25' }),
    queuedAt: 1,
  });
  const { result } = renderHook(() => useOfflineSync({ onSynced: vi.fn() }));
  await waitFor(() => expect(result.current.rejected).toHaveLength(1));
  await act(() => result.current.discard('k'));
  expect(result.current.queue).toHaveLength(0);
});
