import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #62: pages are URLs and journal data comes from TanStack Query.
function mount(path = '/', failWorkouts = false) {
  fixClock();
  window.history.replaceState(null, '', path);
  let fail = failWorkouts;
  const api = mockApi(({ url }) => {
    if (url.pathname === '/api/workouts' && fail) return json({ error: '저장소 연결 실패' }, 500);
    if (url.pathname === '/api/routine-progress') return { today: '2026-10-15', routine: null };
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return {
    user,
    api,
    recover: () => (fail = false),
    workoutLoads: () =>
      api.requests.filter((r) => r.method === 'GET' && r.url.pathname === '/api/workouts').length,
  };
}
const menu = () => screen.getByRole('navigation', { name: '주 메뉴' });
const current = () =>
  within(menu())
    .getAllByRole('link')
    .find((link) => link.getAttribute('aria-current') === 'page')?.textContent;

test('a page opened by its URL shows that page and marks it in the menu', async () => {
  mount('/routines');
  expect(await screen.findByRole('button', { name: '새 루틴 만들기' })).toBeInTheDocument();
  expect(current()).toBe('루틴짜기');
  expect(window.location.pathname).toBe('/routines');
});

test('an unknown address falls back to the dashboard', async () => {
  mount('/no-such-page');
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(current()).toBe('대시보드');
});

test('menu links change the URL and browser back returns to the previous page', async () => {
  const ui = mount();
  await openPage('나의 목표', ui.user);
  expect(window.location.pathname).toBe('/goals');
  await openPage('머신 라이브러리', ui.user);
  expect(window.location.pathname).toBe('/machines');
  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe('/goals'));
  await waitFor(() => expect(current()).toBe('나의 목표'));
});

test('switching pages reuses the loaded period instead of fetching it again', async () => {
  const ui = mount();
  await waitFor(() => expect(ui.workoutLoads()).toBe(1));
  await openPage('나의 목표', ui.user);
  await openPage('운동 일지', ui.user);
  await openPage('대시보드', ui.user);
  expect(ui.workoutLoads()).toBe(1);
});

test('a failed load is reported and 다시 연결 reloads the selected period', async () => {
  const ui = mount('/', true);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('저장소 연결 실패');
  ui.recover();
  await ui.user.click(within(alert).getByRole('button', { name: '다시 연결' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(ui.workoutLoads()).toBe(2);
});
