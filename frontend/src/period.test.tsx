import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { App } from './app';
import { deferred, fixClock, mockApi } from './test/api';

type Workout = {
  id: number;
  date: string;
  title: string;
  notes: string;
  sets: { exercise: string; machine_id: null; weight: number | string; reps: number }[];
};
const workout = (id: number, date: string, weight: number | string = 100): Workout => ({
  id,
  date,
  title: `기록 ${id}`,
  notes: '',
  sets: [{ exercise: 'Squat', machine_id: null, weight, reps: 10 }],
});

// Ported from backend/test/period-ui.test.ts (vm hook harness) to a real DOM.
function mount(initial: Workout[] = []) {
  fixClock();
  vi.stubGlobal('confirm', () => true);
  let records = structuredClone(initial);
  let holdWorkouts: Promise<void> | undefined;
  let holdMutation: Promise<void> | undefined;
  const api = mockApi(async ({ method, url, body }) => {
    const id = Number(url.pathname.split('/').at(-1));
    if (method === 'PUT' || method === 'DELETE') {
      const pending = holdMutation;
      holdMutation = undefined;
      await pending;
    }
    if (method === 'PUT')
      records = records.map((w) => (w.id === id ? { ...(body as Workout), id } : w));
    else if (method === 'DELETE') records = records.filter((w) => w.id !== id);
    if (url.pathname !== '/api/workouts') return [];
    if (method === 'GET') {
      const pending = holdWorkouts;
      holdWorkouts = undefined;
      await pending;
    }
    return records
      .filter(
        (w) => w.date >= url.searchParams.get('from')! && w.date <= url.searchParams.get('to')!,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  });
  const user = userEvent.setup();
  render(<App />);
  const workoutQueries = () =>
    api.requests
      .filter((r) => r.method === 'GET' && r.path.startsWith('/api/workouts?'))
      .map((r) => r.path);
  return {
    user,
    workoutQueries,
    holdNextWorkouts() {
      const gate = deferred();
      holdWorkouts = gate.promise;
      return gate;
    },
    holdNextMutation() {
      const gate = deferred();
      holdMutation = gate.promise;
      return gate;
    },
    async select(period: string, anchor: string) {
      const before = workoutQueries().length;
      // jsdom date inputs do not accept typed keys; set the value as the browser would.
      fireEvent.change(screen.getByLabelText('기준 날짜'), { target: { value: anchor } });
      await user.click(screen.getByRole('button', { name: period }));
      await waitFor(() => expect(workoutQueries().length).toBeGreaterThan(before));
    },
  };
}
const stat = (label: string) => {
  const card = screen
    .getAllByText(
      (_, el) => el?.classList.contains('stat') === true && el.textContent!.startsWith(label),
    )
    .at(0)!;
  return card.querySelector('.stat-value')!.textContent;
};
const chart = () => screen.getByRole('img').getAttribute('aria-label') ?? '';
const rows = () => [...document.querySelectorAll('.workout-row')];
const loaded = () => waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());

test('default date is today in Asia/Seoul even on a UTC device', async () => {
  mount();
  expect(screen.getByLabelText('기준 날짜')).toHaveValue('2026-10-15');
  await loaded();
});

for (const outcome of ['success', 'failure'] as const) {
  test(`an older period's delayed ${outcome} cannot overwrite the latest results`, async () => {
    const ui = mount([workout(1, '2024-02-29', 100), workout(2, '2024-03-01', 200)]);
    await loaded();
    await ui.select('1일', '2024-02-28');
    const older = ui.holdNextWorkouts();
    await ui.select('1일', '2024-02-29');
    await ui.select('1일', '2024-03-01');
    await waitFor(() => expect(stat('누적 볼륨')).toBe('2,000kg'));
    if (outcome === 'success') older.resolve();
    else older.reject(new Error('Old period failed'));
    await older.promise.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stat('누적 볼륨')).toBe('2,000kg');
    expect(stat('운동한 날')).toBe('1일');
    expect(stat('완료한 세트')).toBe('1세트');
    expect(chart()).toMatch(/2,000kg/);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('기록 2');
    expect(screen.queryByRole('alert')).toBeNull();
  });
}

test('an older response cannot clear loading while the latest period is still pending', async () => {
  const ui = mount([workout(1, '2024-02-29', 100), workout(2, '2024-03-01', 200)]);
  await loaded();
  await ui.select('1일', '2024-02-28');
  const older = ui.holdNextWorkouts();
  await ui.select('1일', '2024-02-29');
  const latest = ui.holdNextWorkouts();
  await ui.select('1일', '2024-03-01');
  older.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getAllByText('기록을 불러오는 중…')).toHaveLength(1);
  latest.resolve();
  await waitFor(() => expect(stat('누적 볼륨')).toBe('2,000kg'));
  expect(rows()).toHaveLength(1);
});

// #159: an edit is saved from the modal, which blocks the page behind it and cannot be closed
// while its save is pending, so only a delete can race with a period change.
for (const mutation of ['delete'] as const) {
  test(`a delayed ${mutation} refreshes the currently selected period`, async () => {
    const ui = mount([
      workout(1, '2024-02-29', 100),
      workout(2, '2024-03-01', 200),
      workout(3, '2024-03-02', 300),
    ]);
    await loaded();
    await ui.select('1일', '2024-02-29');
    await waitFor(() => expect(rows()).toHaveLength(1));
    const pending = ui.holdNextMutation();
    if (mutation === 'delete') {
      await ui.user.click(screen.getByRole('button', { name: '기록 1 삭제' }));
    } else {
      await ui.user.click(screen.getByRole('button', { name: '수정' }));
      const dialog = screen.getByRole('dialog');
      const weight = dialog.querySelector<HTMLInputElement>('input[type="number"][step="0.25"]')!;
      await ui.user.clear(weight);
      await ui.user.type(weight, '150');
      await ui.user.click(within(dialog).getByRole('button', { name: /저장/ }));
    }
    const period = mutation === 'delete' ? '1일' : '1달';
    const expectedVolume = mutation === 'delete' ? '2,000kg' : '5,000kg';
    await ui.select(period, '2024-03-01');
    await waitFor(() => expect(stat('누적 볼륨')).toBe(expectedVolume));
    const requestCount = ui.workoutQueries().length;
    pending.resolve();
    await waitFor(() => expect(ui.workoutQueries()).toHaveLength(requestCount + 1));
    expect(ui.workoutQueries().at(-1)).toBe(
      `/api/workouts?from=2024-03-01&to=${mutation === 'delete' ? '2024-03-01' : '2024-03-31'}`,
    );
    await waitFor(() => expect(stat('누적 볼륨')).toBe(expectedVolume));
    expect(stat('운동한 날')).toBe(mutation === 'delete' ? '1일' : '2일');
    expect(stat('완료한 세트')).toBe(mutation === 'delete' ? '1세트' : '2세트');
    expect(chart()).toMatch(mutation === 'delete' ? /2,000kg/ : /5,000kg/);
    expect(rows()).toHaveLength(mutation === 'delete' ? 1 : 2);
    expect(rows().every((row) => !row.textContent!.includes('기록 1'))).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
}

const ranges = [
  ['1일', '2024-02-29', '2024-02-29', '2024-02-29'],
  ['1주', '2024-12-30', '2024-12-30', '2025-01-05'],
  ['1주', '2025-01-05', '2024-12-30', '2025-01-05'],
  ['1달', '2024-02-29', '2024-02-01', '2024-02-29'],
  ['1달', '2025-12-31', '2025-12-01', '2025-12-31'],
  ['4주', '2024-03-01', '2024-02-03', '2024-03-01'],
  ['12주', '2025-01-05', '2024-10-14', '2025-01-05'],
];
for (const [period, anchor, from, to] of ranges) {
  test(`${period} at ${anchor} requests inclusive ${from} through ${to}`, async () => {
    const ui = mount();
    await loaded();
    await ui.select(period, anchor);
    expect(ui.workoutQueries().at(-1)).toBe(`/api/workouts?from=${from}&to=${to}`);
    await loaded();
    expect(chart()).toMatch(/0kg/);
    expect(stat('운동한 날')).toBe('0일');
    expect(stat('완료한 세트')).toBe('0세트');
    expect(stat('누적 볼륨')).toBe('0kg');
    expect(
      screen.getAllByRole('heading', { level: 3, name: '첫 번째 기록을 남겨보세요' }),
    ).toHaveLength(1);
  });
  test(`${period} graph and totals include both endpoints and exclude adjacent dates`, async () => {
    const adjacent = (date: string, offset: number) => {
      const value = new Date(date + 'T00:00:00Z');
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    const ui = mount([
      workout(1, from, 100),
      workout(2, to, 200),
      workout(3, adjacent(from, -1), 900),
      workout(4, adjacent(to, 1), 900),
    ]);
    await loaded();
    await ui.select(period, anchor);
    await waitFor(() => expect(stat('누적 볼륨')).toBe('3,000kg'));
    expect(stat('운동한 날')).toBe(from === to ? '1일' : '2일');
    expect(stat('완료한 세트')).toBe('2세트');
    const plotted = [...chart().matchAll(/([\d,.]+)kg/g)].reduce(
      (sum, match) => sum + Number(match[1].replaceAll(',', '')),
      0,
    );
    expect(plotted).toBe(3000);
    expect(rows()).toHaveLength(2);
  });
}

test('period statistics and graph combine same-day sessions and refresh after edit/delete', async () => {
  const first = workout(1, '2024-02-28', '100.25');
  first.sets.push({ exercise: 'Row', machine_id: null, weight: 50, reps: 8 });
  const ui = mount([
    first,
    workout(2, '2024-02-28', 20),
    workout(3, '2024-02-29', 40),
    workout(4, '2024-03-01', 900),
  ]);
  await loaded();
  await ui.select('1주', '2024-02-29');
  // Move to a single month to exclude March 1 and include the leap day.
  await ui.select('1달', '2024-02-29');
  await waitFor(() => expect(stat('누적 볼륨')).toBe('2,002.5kg'));
  expect(stat('운동한 날')).toBe('2일');
  expect(stat('완료한 세트')).toBe('4세트');
  expect(chart()).toMatch(/2,002.5kg/);
  expect(rows()).toHaveLength(3);
  expect(rows()[0]).toHaveTextContent('기록 3');
  await ui.user.click(within(rows()[0] as HTMLElement).getByRole('button', { name: '수정' }));
  const dialog = screen.getByRole('dialog', { name: '운동 일지 수정' });
  const weight = dialog.querySelector<HTMLInputElement>('input[type="number"][step="0.25"]')!;
  await ui.user.clear(weight);
  await ui.user.type(weight, '60');
  await ui.user.click(within(dialog).getByRole('button', { name: /저장/ }));
  await waitFor(() => expect(stat('누적 볼륨')).toBe('2,202.5kg'));
  expect(chart()).toMatch(/2,202.5kg/);
  await ui.user.click(screen.getByRole('button', { name: '기록 3 삭제' }));
  await waitFor(() => expect(stat('누적 볼륨')).toBe('1,602.5kg'));
  expect(stat('운동한 날')).toBe('1일');
  expect(stat('완료한 세트')).toBe('3세트');
  expect(chart()).toMatch(/1,602.5kg/);
  expect(rows()).toHaveLength(2);
  for (const id of [1, 2]) {
    await ui.user.click(screen.getByRole('button', { name: `기록 ${id} 삭제` }));
    await waitFor(() => expect(rows()).toHaveLength(2 - id));
  }
  expect(stat('운동한 날')).toBe('0일');
  expect(stat('완료한 세트')).toBe('0세트');
  expect(stat('누적 볼륨')).toBe('0kg');
  expect(chart()).not.toMatch(/[1-9][\d,.]*kg/);
});

test('a delayed edit keeps the page blocked until it finishes, then the new period loads', async () => {
  const ui = mount([
    workout(1, '2024-02-29', 100),
    workout(2, '2024-03-01', 200),
    workout(3, '2024-03-02', 300),
  ]);
  await loaded();
  await ui.select('1일', '2024-02-29');
  await waitFor(() => expect(rows()).toHaveLength(1));
  const pending = ui.holdNextMutation();
  await ui.user.click(screen.getByRole('button', { name: '수정' }));
  const dialog = screen.getByRole('dialog');
  const weight = dialog.querySelector<HTMLInputElement>('input[type="number"][step="0.25"]')!;
  await ui.user.clear(weight);
  await ui.user.type(weight, '150');
  await ui.user.click(within(dialog).getByRole('button', { name: /저장/ }));
  expect(screen.queryByRole('button', { name: '1달' })).toBeNull();
  await ui.user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  pending.resolve();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await ui.select('1달', '2024-03-01');
  await waitFor(() => expect(stat('누적 볼륨')).toBe('5,000kg'));
  expect(rows()).toHaveLength(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
