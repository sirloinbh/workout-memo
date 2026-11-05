import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #85: statistics for a directly chosen start–end range, kept in the address.
const workout = (id: number, date: string, weight: number) => ({
  id,
  date,
  title: `기록 ${id}`,
  notes: '',
  sets: [{ exercise: 'Squat', machine_id: null, weight, reps: 10 }],
});
const records = [
  workout(1, '2026-09-30', 1000), // the day before the range
  workout(2, '2026-10-01', 100), // first day
  workout(3, '2026-10-10', 200), // last day
  workout(4, '2026-10-11', 1000), // the day after
];

function mount(url = '/') {
  fixClock();
  window.history.replaceState(null, '', url);
  const api = mockApi(({ url }) => {
    if (url.pathname !== '/api/workouts') return [];
    return records.filter(
      (w) => w.date >= url.searchParams.get('from')! && w.date <= url.searchParams.get('to')!,
    );
  });
  const user = userEvent.setup();
  render(<App />);
  const workoutQueries = () =>
    api.requests.filter((r) => r.path.startsWith('/api/workouts?')).map((r) => r.path);
  return { user, workoutQueries };
}
const form = () => screen.getByRole('form', { name: '기간 직접 선택' });
const field = (label: string) => within(form()).getByLabelText(label);
const stat = (label: string) =>
  screen
    .getAllByText(
      (_, el) => el?.getAttribute('data-slot') === 'stat' && el.textContent.startsWith(label),
    )
    .at(0)!
    .querySelector('[data-slot=stat-value]')!.textContent;
const chart = () => screen.getByRole('img').getAttribute('aria-label') ?? '';
async function choose(ui: ReturnType<typeof mount>, from: string, to: string) {
  await ui.user.click(screen.getByRole('radio', { name: '직접 선택' }));
  fireEvent.change(field('시작일'), { target: { value: from } });
  fireEvent.change(field('종료일'), { target: { value: to } });
  await ui.user.click(within(form()).getByRole('button', { name: '적용' }));
}

test('a chosen range includes both ends and is kept in the address', async () => {
  const ui = mount();
  await choose(ui, '2026-10-01', '2026-10-10');
  await waitFor(() =>
    expect(ui.workoutQueries()).toContain('/api/workouts?from=2026-10-01&to=2026-10-10'),
  );
  expect(window.location.search).toBe('?from=2026-10-01&to=2026-10-10');
  await waitFor(() => expect(stat('누적 볼륨')).toBe('3,000kg'));
  expect(stat('운동한 날')).toBe('2일');
  expect(document.body.textContent).toMatch(/2026-10-01 — 2026-10-10/);
  // Ten days are drawn as daily bars.
  expect(chart()).toMatch(/^기간별 운동 볼륨: 10\/1 1,000kg, 10\/2 0kg/);
  expect(chart()).toMatch(/10\/10 2,000kg$/);
  // Moving to the journal keeps the range; a preset clears it.
  await openPage('운동 일지', ui.user);
  expect(window.location.search).toBe('?from=2026-10-01&to=2026-10-10');
  await ui.user.click(screen.getByRole('radio', { name: '1주' }));
  await waitFor(() => expect(window.location.search).toBe(''));
  expect(screen.getByLabelText('기준 날짜')).toHaveValue('2026-10-15');
});

test('opening an address with a range shows that range after a reload', async () => {
  const ui = mount('/journal?from=2026-10-10&to=2026-10-11');
  await waitFor(() =>
    expect(ui.workoutQueries()).toContain('/api/workouts?from=2026-10-10&to=2026-10-11'),
  );
  expect(field('시작일')).toHaveValue('2026-10-10');
  expect(field('종료일')).toHaveValue('2026-10-11');
  expect(screen.getByRole('radio', { name: '직접 선택' })).toBeChecked();
});

test('pressing the current preset clears an invalid range from the address', async () => {
  const ui = mount('/?from=bad&to=bad');
  await waitFor(() => expect(ui.workoutQueries().length).toBeGreaterThan(0));
  expect(window.location.search).toBe('?from=bad&to=bad');
  const current = screen.getByRole('radio', { name: '1주' });
  expect(current).toBeChecked();
  await ui.user.click(current);
  await waitFor(() => expect(window.location.search).toBe(''));
});

test('invalid ranges are explained per field and not requested', async () => {
  const ui = mount();
  await waitFor(() => expect(ui.workoutQueries().length).toBeGreaterThan(0));
  const before = ui.workoutQueries().length;
  await choose(ui, '2026-10-10', '2026-10-01');
  expect(field('종료일')).toHaveAttribute('aria-invalid', 'true');
  expect(form().textContent).toMatch(/종료일은 시작일과 같거나 이후여야 합니다/);
  fireEvent.change(field('시작일'), { target: { value: '2025-01-01' } });
  fireEvent.change(field('종료일'), { target: { value: '2026-10-01' } });
  await ui.user.click(within(form()).getByRole('button', { name: '적용' }));
  expect(form().textContent).toMatch(/최대 371일/);
  expect(ui.workoutQueries()).toHaveLength(before);
  expect(window.location.search).toBe('');
});

test('a broken range in the address falls back to the default period with a notice', async () => {
  const ui = mount('/?from=2026-10-10&to=2026-10-01');
  await waitFor(() => expect(ui.workoutQueries().length).toBeGreaterThan(0));
  expect(screen.getByRole('alert').textContent).toMatch(/주소의 기간이 올바르지 않아/);
  expect(ui.workoutQueries()[0]).toBe('/api/workouts?from=2026-10-12&to=2026-10-18');
});

// #101: 31 daily bars label every 3rd day and thin those out further on a narrow plot.
test('a 31-day range labels every third day in width tiers', async () => {
  const ui = mount();
  await choose(ui, '2026-10-01', '2026-10-31');
  await waitFor(() => expect(document.querySelectorAll('[data-slot=volume-bar]')).toHaveLength(31));
  const labels = [...document.querySelectorAll('[data-slot=volume-label]')];
  expect(labels.map((l) => l.textContent)).toEqual(
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31].map((d) => `10/${d}`),
  );
  const tier = (l: Element) =>
    l.classList.contains('@min-[400px]:inline')
      ? 'wide'
      : l.classList.contains('@min-[200px]:inline')
        ? 'medium'
        : 'always';
  expect(labels.map(tier)).toEqual([
    'always',
    'wide',
    'medium',
    'wide',
    'always',
    'wide',
    'medium',
    'wide',
    'always',
    'wide',
    'medium',
  ]);
});
