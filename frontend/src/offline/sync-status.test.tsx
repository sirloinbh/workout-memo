import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { QueuedSave } from './queue';
import { SyncBadge, SyncStatus } from './sync-status';
import type { OfflineSync } from './use-offline-sync';

// #483: waiting logs are marked, the shell shows a count, and a rejected save can be retried or discarded.
const entry = (key: string, extra: Partial<QueuedSave> = {}): QueuedSave => ({
  key,
  path: '/workouts',
  method: 'POST',
  body: JSON.stringify({ title: 'Legs', date: '2026-11-25' }),
  queuedAt: 1,
  ...extra,
});
function fake(queue: QueuedSave[]): OfflineSync {
  return {
    queue,
    waiting: queue.filter((q) => !q.error),
    rejected: queue.filter((q) => q.error),
    notice: '',
    dismissNotice: vi.fn(),
    flush: vi.fn(),
    retry: vi.fn(),
    discard: vi.fn(),
  };
}

test('a queued log is marked as waiting to sync and counted in the shell', () => {
  const sync = fake([entry('a'), entry('b')]);
  render(
    <>
      <SyncBadge sync={sync} />
      <SyncStatus sync={sync} />
    </>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('2 waiting to sync');
  expect(screen.getAllByText(/Legs \(2026-11-25\)/)).toHaveLength(2);
  expect(screen.getByRole('list', { name: 'Logs waiting to sync' })).toBeInTheDocument();
});

test('nothing is shown when the queue is empty', () => {
  const { container } = render(
    <>
      <SyncBadge sync={fake([])} />
      <SyncStatus sync={fake([])} />
    </>,
  );
  expect(container).toBeEmptyDOMElement();
});

test('a rejected save shows its error with retry and discard', async () => {
  const sync = fake([entry('bad', { error: 'Enter a title' })]);
  render(
    <>
      <SyncBadge sync={sync} />
      <SyncStatus sync={sync} />
    </>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('1 not saved');
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a title');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(sync.retry).toHaveBeenCalledWith('bad');
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(sync.discard).toHaveBeenCalledWith('bad');
});
