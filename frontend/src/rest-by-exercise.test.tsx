import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { App } from './app';
import { fixClock, json, mockApi } from './test/api';

// #84: a completed set starts the rest of its exercise kind. Single-joint comes from the
// machine library, lower/upper body from the user's body part mapping (#32).
const machines = [
  {
    id: 5,
    brand_id: 1,
    brand: '해머',
    name: '레그 익스텐션',
    base_weight: 10,
    notes: '',
    single_joint: true,
  },
  {
    id: 6,
    brand_id: 1,
    brand: '해머',
    name: '레그 프레스',
    base_weight: 50,
    notes: '',
    single_joint: false,
  },
];
const bodyParts = [
  { exercise: '스쿼트', body_parts: ['하체-앞'] },
  { exercise: '벤치프레스', body_parts: ['가슴'] },
  { exercise: '레그 익스텐션', body_parts: ['하체-앞'] },
  { exercise: '크런치', body_parts: ['복근'] },
];

function mount() {
  fixClock();
  vi.stubGlobal('confirm', () => true);
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/machines') return machines;
    if (url.pathname === '/api/exercise-body-parts') return bodyParts;
    if (method === 'POST' || method === 'PUT') return json({ id: 1, version: 1 }, 201);
    return [];
  });
  const user = userEvent.setup();
  const view = render(<App />);
  return { user, view, requests: api.requests };
}
const timer = () => document.querySelector('.rest-timer')?.textContent ?? '';
const dialog = () => screen.getByRole('dialog');
async function openWith(ui: ReturnType<typeof mount>, exercise: string, machine = '') {
  await waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
  await waitFor(() =>
    expect(ui.requests.some((r) => r.path === '/api/exercise-body-parts')).toBe(true),
  );
  await ui.user.click(screen.getAllByRole('button', { name: '운동 기록하기' })[0]);
  const auto = within(dialog()).getByLabelText('세트 완료 시 자동 시작');
  if (!(auto as HTMLInputElement).checked) await ui.user.click(auto);
  fireEvent.change(within(dialog()).getAllByLabelText('운동명')[0], {
    target: { value: exercise },
  });
  if (machine)
    fireEvent.change(within(dialog()).getAllByLabelText('머신')[0], {
      target: { value: machine },
    });
}
async function completeFirst(ui: ReturnType<typeof mount>) {
  await ui.user.click(screen.getByRole('button', { name: '1세트 완료' }));
}

test.each([
  ['스쿼트', '', '2:30', 'lower body'],
  ['벤치프레스', '', '2:00', 'upper body'],
  ['레그 익스텐션', '5', '1:30', 'single-joint machine wins over lower body'],
  ['  스쿼트 ', '6', '2:30', 'a machine that is not single-joint uses the body part'],
])('%s starts a %s rest (%s)', async (exercise, machine, shown) => {
  const ui = mount();
  await openWith(ui, exercise, machine);
  await completeFirst(ui);
  expect(timer()).toMatch(new RegExp(`${shown} 남음`));
});

test('exercises without a kind keep the configured rest', async () => {
  const ui = mount();
  await openWith(ui, '크런치');
  fireEvent.change(screen.getByRole('spinbutton', { name: '휴식 시간(초)' }), {
    target: { value: '45' },
  });
  await completeFirst(ui);
  expect(timer()).toMatch(/0:45 남음/);
});

test('per-kind rests can be changed and are kept in this browser', async () => {
  const first = mount();
  await openWith(first, '스쿼트');
  expect(screen.getByRole('spinbutton', { name: '하체 휴식(초)' })).toHaveValue(150);
  expect(screen.getByRole('spinbutton', { name: '상체 휴식(초)' })).toHaveValue(120);
  expect(screen.getByRole('spinbutton', { name: '단관절 휴식(초)' })).toHaveValue(90);
  fireEvent.change(screen.getByRole('spinbutton', { name: '하체 휴식(초)' }), {
    target: { value: '180' },
  });
  // Invalid values are ignored instead of replacing the stored rest.
  fireEvent.change(screen.getByRole('spinbutton', { name: '상체 휴식(초)' }), {
    target: { value: '3' },
  });
  first.view.unmount();
  // Reload: the journal draft is restored and the per-kind rests come from storage.
  const second = mount();
  await waitFor(() =>
    expect(second.requests.some((r) => r.path === '/api/exercise-body-parts')).toBe(true),
  );
  await second.user.click(await screen.findByRole('button', { name: /복구/ }));
  expect(screen.getByRole('spinbutton', { name: '하체 휴식(초)' })).toHaveValue(180);
  expect(screen.getByRole('spinbutton', { name: '상체 휴식(초)' })).toHaveValue(120);
  await waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
  await completeFirst(second);
  expect(timer()).toMatch(/3:00 남음/);
});

test('the machine form saves the single-joint flag', async () => {
  const ui = mount();
  await waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
  await ui.user.click(screen.getByRole('link', { name: '머신 라이브러리' }));
  await waitFor(() => expect(document.body.textContent).toMatch(/해머 · 단관절/));
  await ui.user.click(screen.getAllByRole('button', { name: '수정' })[1]);
  const box = within(dialog()).getByLabelText(/단관절 운동 머신/);
  expect(box).not.toBeChecked();
  await ui.user.click(box);
  fireEvent.submit(dialog().querySelector('form')!);
  await waitFor(() => expect(ui.requests.some((r) => r.method === 'PUT')).toBe(true));
  const put = ui.requests.find((r) => r.method === 'PUT')!;
  expect(put.path).toBe('/api/machines/6');
  expect((put.body as { single_joint: boolean }).single_joint).toBe(true);
});
