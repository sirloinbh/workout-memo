import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { importCardioSessions } from './cardio/api';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #373: a proxy answers 502 with an HTML page while the API restarts. Every screen reads that through
// the one API client, so the user sees a readable message and never "Unexpected token '<'".
const html502 = () =>
  new Response('<html><body>502 Bad Gateway</body></html>', {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
  });
const page = () => document.body.textContent ?? '';

function mountWithProxyDown(failing: (pathname: string) => boolean) {
  fixClock();
  mockApi(({ url }) => (failing(url.pathname) ? html502() : json([])));
  render(<App />);
}

test.each([
  ['Exercise Analysis', '/api/analysis'],
  ['Body records', '/api/body-measurements'],
  ['My Goals', '/api/cardio-goals'],
  ['Routine Builder', '/api/routines'],
])('%s shows a readable message when the proxy answers an HTML 502', async (label, path) => {
  mountWithProxyDown((pathname) => pathname.startsWith(path));
  await openPage(label, userEvent.setup());
  await waitFor(() => expect(page()).toMatch(/Could not process the request/));
  expect(page()).not.toMatch(/Unexpected token|is not valid JSON/);
});

test('the backup preview shows a readable message for an HTML 502', async () => {
  mountWithProxyDown((pathname) => pathname.startsWith('/api/backup'));
  const user = userEvent.setup();
  await openPage('Backup & Export', user);
  const file = new File(['{"version":1}'], 'workout-memo-backup-2026-10-19.json');
  await user.upload(screen.getByLabelText('Choose backup file'), file);
  await waitFor(() => expect(page()).toMatch(/Could not process the request/));
  expect(page()).not.toMatch(/Unexpected token|is not valid JSON/);
});

test('the cardio import reports an HTML 502 with its status', async () => {
  mockApi(() => html502());
  await expect(importCardioSessions([])).rejects.toMatchObject({
    status: 502,
    message: 'The server could not process the import (HTTP 502)',
  });
});
