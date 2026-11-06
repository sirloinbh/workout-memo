import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #102: the goal list on the common Card and Badge. Today is 2026-10-15 in Seoul.
const goal = (id: number, exercise: string, deadline: string, achieved: boolean) => ({
  id,
  exercise,
  target_weight: 100,
  target_reps: 10,
  start_date: '2026-10-01',
  deadline,
  achieved,
});

function mount(goals: ReturnType<typeof goal>[], answer = true) {
  fixClock();
  vi.stubGlobal('confirm', () => answer);
  const api = mockApi(({ method, url }) => {
    if (url.pathname.startsWith('/api/goals/') && method === 'DELETE') {
      const id = Number(url.pathname.split('/').at(-1));
      goals = goals.filter((g) => g.id !== id);
      return { ok: true };
    }
    if (url.pathname === '/api/goals') return goals;
    return [];
  });
  return { user: userEvent.setup(), requests: api.requests };
}
const card = (name: string) =>
  screen.getByRole('heading', { level: 2, name }).closest<HTMLElement>('[data-slot="card"]')!;

test('each goal card shows its state, target and period', async () => {
  const ui = mount([
    goal(1, '벤치프레스', '2026-12-31', false),
    goal(2, '레그프레스', '2026-10-10', false),
    goal(3, '랫풀다운', '2026-10-10', true),
  ]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  await screen.findByRole('heading', { level: 2, name: '벤치프레스' });

  const challenge = card('벤치프레스');
  expect(within(challenge).getByText('도전 중')).toHaveAttribute('data-slot', 'badge');
  expect(challenge.textContent).toMatch(/100 kg × 10 회/);
  expect(challenge.textContent).toMatch(/2026-10-01 — 2026-12-31/);
  expect(challenge.textContent).toMatch(/같은 운동명으로 기록하면/);
  expect(within(card('레그프레스')).getByText('기간 종료')).toBeInTheDocument();
  const done = card('랫풀다운');
  expect(within(done).getByText('달성 완료')).toBeInTheDocument();
  expect(done.textContent).toMatch(/모두 달성했어요/);
});

test('deleting a goal asks first and removes only that card', async () => {
  const ui = mount([
    goal(1, '벤치프레스', '2026-12-31', false),
    goal(2, '스쿼트', '2026-12-31', false),
  ]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  await ui.user.click(await screen.findByRole('button', { name: '벤치프레스 목표 삭제' }));
  await waitFor(() =>
    expect(screen.queryByRole('heading', { level: 2, name: '벤치프레스' })).toBeNull(),
  );
  expect(screen.getByRole('heading', { level: 2, name: '스쿼트' })).toBeInTheDocument();
  expect(ui.requests.filter((r) => r.method === 'DELETE').map((r) => r.url.pathname)).toEqual([
    '/api/goals/1',
  ]);
});

test('a cancelled delete sends nothing', async () => {
  const ui = mount([goal(1, '벤치프레스', '2026-12-31', false)], false);
  render(<App />);
  await openPage('나의 목표', ui.user);
  await ui.user.click(await screen.findByRole('button', { name: '벤치프레스 목표 삭제' }));
  expect(ui.requests.some((r) => r.method === 'DELETE')).toBe(false);
  expect(screen.getByRole('heading', { level: 2, name: '벤치프레스' })).toBeInTheDocument();
});

test('without goals the empty state explains what to add', async () => {
  const ui = mount([]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  const empty = await screen.findByRole('heading', { name: '다음 운동의 목표를 세워보세요' });
  expect(empty.closest('[data-slot="empty-state"]')!.textContent).toMatch(/10회 달성/);
});
