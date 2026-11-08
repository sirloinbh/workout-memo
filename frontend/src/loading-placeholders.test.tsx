import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { deferred, fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #173: while a page's first load is pending it shows placeholders in a busy region and keeps
// the loading line for screen readers only; once the data arrives both go away.
const cases = [
  { page: '종목 분석', api: '/api/analysis', slot: 'skeleton-card', text: '분석 불러오는 중…' },
  {
    page: '신체 기록',
    api: '/api/body-measurements',
    slot: 'skeleton-list',
    text: '기록을 불러오는 중…',
  },
  { page: '루틴짜기', api: '/api/routines', slot: 'skeleton-list', text: '루틴 불러오는 중…' },
];

test.each(cases)(
  '$page shows placeholders while it first loads',
  async ({ page, api, slot, text }) => {
    fixClock();
    const pending = deferred();
    mockApi(async ({ url }) => {
      if (url.pathname === api) await pending.promise;
      if (url.pathname === '/api/analysis')
        return { exercises: [], weeks: [], today: '2026-10-15' };
      return [];
    });
    const user = userEvent.setup();
    render(<App />);
    await openPage(page, user);

    const busy = await waitFor(() => {
      const region = document.querySelector(`[aria-busy="true"]:has([data-slot="${slot}"])`);
      expect(region).not.toBeNull();
      return region!;
    });
    expect(screen.getByText(text)).toHaveClass('sr-only');
    // The placeholders are decoration; assistive tech hears only the status line.
    for (const el of busy.querySelectorAll('[data-slot="skeleton"]'))
      expect(el).toHaveAttribute('aria-hidden');

    pending.resolve();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(screen.queryByText(text)).toBeNull();
  },
);

// #173: a save that is waiting shows a small spinner on its disabled button.
test('the body record save button shows a spinner while it saves', async () => {
  fixClock();
  const saved = deferred();
  mockApi(async ({ method, url }) => {
    if (url.pathname === '/api/body-measurements' && method === 'POST') {
      await saved.promise;
      return { id: 1, date: '2026-10-15' };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('신체 기록', user);
  await user.click(await screen.findByRole('button', { name: '신체 기록 추가' }));
  await user.type(screen.getByLabelText(/^체중/), '70');
  await user.click(screen.getByRole('button', { name: '신체 기록 저장' }));

  const saving = await screen.findByRole('button', { name: '저장 중…' });
  expect(saving).toBeDisabled();
  expect(saving.querySelector('[data-slot="spinner"]')).toHaveAttribute('aria-hidden');
  saved.resolve();
  await waitFor(() => expect(screen.queryByRole('button', { name: '저장 중…' })).toBeNull());
});
