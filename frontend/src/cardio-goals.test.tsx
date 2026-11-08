import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #116: cardio goals on the 나의 목표 page. The server's judgment is shown as given. Today is
// Thursday 2026-10-15 in Seoul, so the current week is 10-12 ~ 10-18.
const weekly = {
  id: 1,
  goal_type: 'distance',
  kind: 'running',
  period: 'week',
  target_distance_km: 15,
  target_duration_sec: null,
  target_count: null,
  start_date: '2026-10-05',
  deadline: '2026-10-25',
  achieved: false,
  progress: {
    kind: 'period',
    current: { start: '2026-10-12', end: '2026-10-18', value: 9.5, achieved: false },
    periods: [
      { start: '2026-10-05', end: '2026-10-11', value: 16, achieved: true },
      { start: '2026-10-12', end: '2026-10-18', value: 9.5, achieved: false },
      { start: '2026-10-19', end: '2026-10-25', value: 0, achieved: false },
    ],
    periods_achieved: 1,
  },
};
const fiveK = {
  id: 2,
  goal_type: 'record_time',
  kind: 'running',
  period: null,
  target_distance_km: 5,
  target_duration_sec: 1800,
  target_count: null,
  start_date: '2026-10-01',
  deadline: '2026-12-31',
  achieved: true,
  progress: { kind: 'record', best: 1750 },
};
const ended = {
  ...weekly,
  id: 3,
  goal_type: 'count',
  kind: null,
  target_distance_km: null,
  target_count: 3,
  deadline: '2026-10-11',
  progress: { ...weekly.progress, current: null, periods: weekly.progress.periods.slice(0, 1) },
};

function mount(goals: unknown[]) {
  fixClock();
  vi.stubGlobal('confirm', () => true);
  const posted: unknown[] = [];
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/cardio-goals' && method === 'POST') {
      posted.push(body);
      return { id: 9, ...(body as object) };
    }
    if (url.pathname.startsWith('/api/cardio-goals/') && method === 'DELETE') {
      const id = Number(url.pathname.split('/').at(-1));
      goals = goals.filter((g) => (g as { id: number }).id !== id);
      return { ok: true };
    }
    if (url.pathname === '/api/cardio-goals') return goals;
    return [];
  });
  return { user: userEvent.setup(), posted, requests: api.requests };
}
const section = () => screen.getByRole('region', { name: '유산소 목표' });
const card = (name: string) =>
  within(section())
    .getByRole('heading', { level: 3, name })
    .closest<HTMLElement>('[data-slot="cardio-goal"]')!;

test('cardio goals show the current period, achieved periods and records', async () => {
  const ui = mount([weekly, fiveK, ended]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  await within(section()).findByRole('heading', { level: 3, name: '주간 러닝 15 km' });

  const week = card('주간 러닝 15 km');
  expect(within(week).getByText('도전 중')).toHaveAttribute('data-slot', 'badge');
  expect(week.textContent).toMatch(/이번 주 9\.5 km \/ 15 km/);
  expect(
    within(week).getByRole('progressbar', { name: '주간 러닝 15 km 이번 주 진행률' }),
  ).toHaveAttribute('aria-valuenow', '63');
  expect(week.textContent).toMatch(/달성한 주 1 \/ 전체 3주/);

  const record = card('러닝 5 km 30:00 이내');
  expect(within(record).getByText('달성 완료')).toBeInTheDocument();
  expect(record.textContent).toMatch(/가장 빠른 기록 29:10/);

  // After the deadline there is no current period: 기간 종료 with the period summary only.
  const over = card('주간 유산소 3회');
  expect(within(over).getByText('기간 종료')).toBeInTheDocument();
  expect(within(over).queryByRole('progressbar')).toBeNull();
  expect(over.textContent).toMatch(/달성한 주 1 \/ 전체 1주/);
});

test('a new cardio goal sends only the targets of its type', async () => {
  const ui = mount([]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  await within(section()).findByText('유산소 목표가 없습니다');

  await ui.user.click(screen.getByRole('button', { name: '유산소 목표 추가' }));
  const dialog = screen.getByRole('dialog', { name: '유산소 목표' });
  // A time record without a kind is stopped on the screen; nothing is sent.
  await ui.user.selectOptions(within(dialog).getByLabelText('목표 종류'), 'record_time');
  await ui.user.type(within(dialog).getByLabelText('목표 거리 (km)'), '5');
  await ui.user.type(within(dialog).getByLabelText('목표 시간 (분)'), '29');
  await ui.user.type(within(dialog).getByLabelText('목표 시간 (초)'), '30');
  await ui.user.click(within(dialog).getByRole('button', { name: '유산소 목표 저장하기' }));
  expect(
    await within(dialog).findByText('기록 목표는 운동 종류를 하나 선택하세요'),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText('운동 종류')).toHaveAttribute('aria-invalid', 'true');
  expect(ui.posted).toEqual([]);

  // Seconds above 59 are stopped too; both time fields are marked.
  await ui.user.selectOptions(within(dialog).getByLabelText('운동 종류'), 'running');
  await ui.user.clear(within(dialog).getByLabelText('목표 시간 (초)'));
  await ui.user.type(within(dialog).getByLabelText('목표 시간 (초)'), '90');
  await ui.user.click(within(dialog).getByRole('button', { name: '유산소 목표 저장하기' }));
  expect(
    await within(dialog).findByText('목표 시간은 분(0 이상 정수)과 초(0~59 정수)로 입력하세요'),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText('목표 시간 (초)')).toHaveAttribute('aria-invalid', 'true');
  expect(ui.posted).toEqual([]);
  await ui.user.clear(within(dialog).getByLabelText('목표 시간 (초)'));
  await ui.user.type(within(dialog).getByLabelText('목표 시간 (초)'), '30');
  await ui.user.click(within(dialog).getByRole('button', { name: '유산소 목표 저장하기' }));
  await waitFor(() => expect(ui.posted).toHaveLength(1));
  expect(ui.posted[0]).toEqual({
    goal_type: 'record_time',
    kind: 'running',
    period: null,
    target_distance_km: 5,
    target_duration_sec: 1770,
    target_count: null,
    start_date: '2026-10-15',
    deadline: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '유산소 목표' })).toBeNull());
  expect(within(section()).getByText('유산소 목표를 저장했습니다.')).toBeInTheDocument();

  // A weekly count for every kind keeps the period and leaves distance and time empty.
  await ui.user.click(screen.getByRole('button', { name: '유산소 목표 추가' }));
  const next = screen.getByRole('dialog', { name: '유산소 목표' });
  await ui.user.selectOptions(within(next).getByLabelText('목표 종류'), 'count');
  await ui.user.type(within(next).getByLabelText('목표 횟수'), '3');
  await ui.user.click(within(next).getByRole('button', { name: '유산소 목표 저장하기' }));
  await waitFor(() => expect(ui.posted).toHaveLength(2));
  expect(ui.posted[1]).toMatchObject({
    goal_type: 'count',
    kind: null,
    period: 'week',
    target_distance_km: null,
    target_duration_sec: null,
    target_count: 3,
  });
});

test('deleting a cardio goal removes only that card', async () => {
  const ui = mount([weekly, fiveK]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  await within(section()).findByRole('heading', { level: 3, name: '주간 러닝 15 km' });
  await ui.user.click(screen.getByRole('button', { name: '주간 러닝 15 km 목표 삭제' }));
  await waitFor(() =>
    expect(within(section()).queryByRole('heading', { name: '주간 러닝 15 km' })).toBeNull(),
  );
  expect(card('러닝 5 km 30:00 이내')).toBeInTheDocument();
  expect(ui.requests.some((r) => r.method === 'DELETE' && r.path === '/api/cardio-goals/1')).toBe(
    true,
  );
});

// Distances follow the cardio session screen (#115): swimming in metres.
test('a swimming goal reads its distance in metres', async () => {
  const ui = mount([
    {
      ...fiveK,
      id: 4,
      goal_type: 'longest_distance',
      kind: 'swimming',
      target_distance_km: 1.5,
      target_duration_sec: null,
      achieved: false,
      progress: { kind: 'record', best: 1.2 },
    },
  ]);
  render(<App />);
  await openPage('나의 목표', ui.user);
  const swim = card(
    (await within(section()).findByRole('heading', { level: 3, name: '수영 한 번에 1,500 m' }))
      .textContent,
  );
  expect(swim.textContent).toMatch(/가장 긴 거리 1,200 m/);
});
