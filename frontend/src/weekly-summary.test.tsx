import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import * as push from './push';
import { json, mockApi } from './test/api';
import { WeeklySummaryToggle } from './workspace/weekly-summary-toggle';

// #485: the switch for the Sunday weekly summary push.
vi.mock('./push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./push')>()),
  loadPushStatus: vi.fn(),
  enablePush: vi.fn(),
}));
const loadPushStatus = vi.mocked(push.loadPushStatus);
const enablePush = vi.mocked(push.enablePush);

afterEach(() => vi.resetAllMocks());

function api(enabled = false) {
  let current = enabled;
  return mockApi(({ method, body }) => {
    if (method === 'PUT') current = (body as { enabled: boolean }).enabled;
    return json({ enabled: current });
  });
}

test('it is hidden where push is unsupported or not set up', async () => {
  for (const status of ['unsupported', 'unavailable'] as const) {
    loadPushStatus.mockResolvedValue({ status, publicKey: null });
    const mock = api();
    const { container, unmount } = render(<WeeklySummaryToggle />);
    await waitFor(() => expect(loadPushStatus).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    expect(mock.requests).toHaveLength(0);
    unmount();
    loadPushStatus.mockClear();
  }
});

test('it starts off and turning it on and off is saved on the server', async () => {
  loadPushStatus.mockResolvedValue({ status: 'on', publicKey: 'key' });
  const mock = api();
  const user = userEvent.setup();
  render(<WeeklySummaryToggle />);
  const toggle = await screen.findByRole('switch', { name: /weekly summary on Sunday at 21:00/ });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await user.click(toggle);
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
  expect(mock.requests.at(-1)).toMatchObject({ method: 'PUT', body: { enabled: true } });
  expect(enablePush).not.toHaveBeenCalled();
  await user.click(toggle);
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  expect(mock.requests.at(-1)).toMatchObject({ method: 'PUT', body: { enabled: false } });
});

test('turning it on asks for notification permission first, and a refusal leaves it off', async () => {
  loadPushStatus.mockResolvedValue({ status: 'off', publicKey: 'key' });
  enablePush.mockResolvedValue('denied');
  const mock = api();
  const user = userEvent.setup();
  render(<WeeklySummaryToggle />);
  const toggle = await screen.findByRole('switch');
  await user.click(toggle);
  expect(enablePush).toHaveBeenCalledWith('key');
  expect(await screen.findByText(/Notifications are blocked for this site/)).toBeTruthy();
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(mock.requests.some((r) => r.method === 'PUT')).toBe(false);
});

test('a server error is shown and the switch stays as it was', async () => {
  loadPushStatus.mockResolvedValue({ status: 'on', publicKey: 'key' });
  mockApi(({ method }) =>
    method === 'PUT'
      ? json({ error: 'Push notifications are not set up on the server' }, 503)
      : json({ enabled: false }),
  );
  const user = userEvent.setup();
  render(<WeeklySummaryToggle />);
  const toggle = await screen.findByRole('switch');
  await user.click(toggle);
  expect(await screen.findByText('Push notifications are not set up on the server')).toBeTruthy();
  expect(toggle.getAttribute('aria-checked')).toBe('false');
});
