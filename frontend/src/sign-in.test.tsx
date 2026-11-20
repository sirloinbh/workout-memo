import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { SignInGate } from './sign-in';
import { deferred, json } from './test/api';
import { findLive } from './test/live';

// #317: the gate runs only on the production address, so the tests pretend to be there.
function atProduction(me: Promise<Response>) {
  vi.stubGlobal('location', {
    protocol: 'https:',
    hostname: 'workout-memo.daysofme.com',
    href: 'https://workout-memo.daysofme.com/journal',
    origin: 'https://workout-memo.daysofme.com',
    assign: vi.fn(),
    reload: vi.fn(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => me),
  );
  render(
    <SignInGate>
      <p>App content</p>
    </SignInGate>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('while the session is checked, a named busy region shows the shared spinner and a status line', async () => {
  const me = deferred<Response>();
  atProduction(me.promise);
  const status = screen.getByText('Checking your sign-in…');
  expect(status).toHaveAttribute('role', 'status');
  const busy = status.closest('[aria-busy="true"]')!;
  expect(busy).toHaveAttribute('aria-label', 'Sign-in check');
  expect(busy.querySelector('[data-slot="spinner"]')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByText('App content')).toBeNull();

  me.resolve(json({ user: { id: 'u1', email: 'me@example.com', name: null } }));
  expect(await screen.findByText('App content')).toBeInTheDocument();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});

test('a failed check still shows the error and the retry button, without the spinner', async () => {
  atProduction(Promise.resolve(json({ error: 'auth_unavailable' }, 503)));
  const alert = await findLive('alert');
  expect(alert).toHaveTextContent('Could not check your sign-in.');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
});
