import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import type { Progress } from './progress-data';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #82: a new journal defaults to today (Asia/Seoul), a date title and today's routine sets.
// The device clock is 2026-10-14 UTC while Seoul is already Thursday 2026-10-15.
const today = '2026-10-15';
const machines = [
  {
    id: 5,
    brand_id: 1,
    brand: '해머',
    name: '레그프레스',
    base_weight: 50,
    notes: '',
    official_status: null,
  },
];
const exercise = (name: string, machine_id: number | null, sets: number, weight: number) => ({
  exercise: name,
  machine_id,
  sets,
  weight,
  reps: 10,
  base: { sets, weight, reps: 10 },
});
const target = {
  order: 1,
  week: 1,
  is_deload: false,
  split_index: 0,
  split_name: '하체',
  change: null,
  // Machine 99 is no longer in the machine list, so it falls back to a free exercise.
  exercises: [exercise('레그프레스', 5, 2, 150), exercise('스쿼트', 99, 1, 100)],
};
const withRoutine = (todayPlan: Progress['today_plan']): Progress => ({
  today,
  routine: { id: 7, name: '12주 루틴' },
  start_date: today,
  status: 'active',
  today_plan: todayPlan,
  this_week: [],
  weeks: [],
  previous: {},
});

function mount(progress: Progress) {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/routine-progress') return progress;
    if (url.pathname === '/api/machines') return machines;
    if (url.pathname === '/api/workouts' && method === 'POST')
      return json({ id: 1, version: 1 }, 201);
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return { user, requests: api.requests };
}
const dialog = () => screen.getByRole('dialog');
const inputs = (label: string) =>
  within(dialog()).getAllByLabelText<HTMLInputElement | HTMLSelectElement>(label);
const values = (label: string) => inputs(label).map((e) => e.value);
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await openPage('운동 일지', user);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="루틴 목표"]')?.textContent ?? '').not.toMatch(
      /불러오는 중/,
    ),
  );
  await waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
  await user.click(screen.getAllByRole('button', { name: '운동 기록하기' })[0]);
}

test('a new journal is dated today with a date title even when another day is browsed', async () => {
  const ui = mount({ today, routine: null });
  await openPage('운동 일지', ui.user);
  fireEvent.change(screen.getByLabelText('기준 날짜'), { target: { value: '2026-09-01' } });
  await openEditor(ui.user);
  expect(inputs('운동 날짜')[0]).toHaveValue(today);
  expect(inputs('일지 제목')[0]).toHaveValue('10월 15일(목)');
  // Without a routine the journal starts with three empty sets as before (#28).
  expect(values('운동명')).toEqual(['', '', '']);
  // Defaults stay editable.
  await ui.user.clear(inputs('일지 제목')[0]);
  await ui.user.type(inputs('일지 제목')[0], '하체 데이');
  expect(inputs('일지 제목')[0]).toHaveValue('하체 데이');
});

test("today's routine fills the sets with exercise, machine, total kg and reps", async () => {
  const ui = mount(withRoutine({ date: today, week: 1, rest: false, target }));
  await openEditor(ui.user);
  expect(values('운동명')).toEqual(['레그프레스', '레그프레스', '스쿼트']);
  expect(values('머신')).toEqual(['5', '5', '']);
  expect(values('총중량 kg')).toEqual(['150', '150', '100']);
  expect(values('횟수')).toEqual(['10', '10', '10']);
  expect(inputs('일지 제목')[0]).toHaveValue('10월 15일(목)');
  fireEvent.submit(dialog().querySelector('form')!);
  await waitFor(() =>
    expect(ui.requests.some((r) => r.method === 'POST' && r.path === '/api/workouts')).toBe(true),
  );
  const body = ui.requests.find((r) => r.method === 'POST' && r.path === '/api/workouts')!.body as {
    date: string;
    title: string;
    sets: { machine_id: number | null; completed: boolean }[];
  };
  expect(body.date).toBe(today);
  expect(body.title).toBe('10월 15일(목)');
  expect(body.sets.map((s) => s.machine_id)).toEqual([5, 5, null]);
  // Planned sets are not performed until the user marks them.
  expect(body.sets.every((s) => !s.completed)).toBe(true);
});

test('a rest day starts with three empty sets', async () => {
  const ui = mount(withRoutine({ date: today, week: 1, rest: true, target: null }));
  await openEditor(ui.user);
  expect(values('운동명')).toEqual(['', '', '']);
  expect(values('머신')).toEqual(['', '', '']);
});
