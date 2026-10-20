import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #64: forms validate with the shared contract before anything is sent.
function mount() {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (method === 'POST') return json({ id: 1, version: 1 }, 201);
    if (url.pathname === '/api/routine-progress') return { today: '2026-10-15', routine: null };
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return {
    user,
    posts: (path: string) =>
      api.requests.filter((r) => r.method === 'POST' && r.url.pathname === path),
  };
}
const loaded = () => waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
// The message is linked to the field: aria-invalid plus aria-describedby.
function expectInvalid(field: HTMLElement, message: string) {
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAccessibleDescription(message);
}

test('the goal form shows Korean per-field messages and sends nothing until valid', async () => {
  const ui = mount();
  await loaded();
  await openPage('나의 목표', ui.user);
  await ui.user.click(screen.getByRole('button', { name: '목표 추가' }));
  const dialog = screen.getByRole('dialog', { name: '점진적 과부하 목표' });
  const save = within(dialog).getByRole('button', { name: '목표 저장하기' });
  await ui.user.click(save);
  expectInvalid(await within(dialog).findByLabelText('운동명'), '운동명을 입력하세요');
  expectInvalid(
    within(dialog).getByLabelText('목표 총중량 (kg)'),
    '목표 총중량을 숫자로 입력하세요',
  );
  expect(ui.posts('/api/goals')).toHaveLength(0);

  await ui.user.type(within(dialog).getByLabelText('운동명'), '벤치프레스');
  await ui.user.type(within(dialog).getByLabelText('목표 총중량 (kg)'), '80');
  fireEvent.change(within(dialog).getByLabelText('시작일'), { target: { value: '2026-10-20' } });
  fireEvent.change(within(dialog).getByLabelText('종료일'), { target: { value: '2026-10-19' } });
  await ui.user.click(save);
  expectInvalid(
    await within(dialog).findByLabelText('종료일'),
    '종료일은 시작일과 같거나 이후여야 합니다',
  );
  expect(within(dialog).getByLabelText('운동명')).not.toHaveAttribute('aria-invalid');
  expect(ui.posts('/api/goals')).toHaveLength(0);

  fireEvent.change(within(dialog).getByLabelText('종료일'), { target: { value: '2026-12-31' } });
  await ui.user.click(save);
  await waitFor(() => expect(ui.posts('/api/goals')).toHaveLength(1));
  expect(ui.posts('/api/goals')[0].body).toEqual({
    exercise: '벤치프레스',
    target_weight: 80,
    target_reps: 10,
    start_date: '2026-10-20',
    deadline: '2026-12-31',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('the journal form marks the invalid set fields and keeps the input unsent', async () => {
  const ui = mount();
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: '운동 기록하기' })[0]);
  const dialog = screen.getByRole('dialog', { name: '새로운 운동 기록' });
  await ui.user.type(within(dialog).getByLabelText('일지 제목'), '하체');
  const names = within(dialog).getAllByLabelText('운동명');
  const weights = within(dialog).getAllByLabelText('총중량 kg');
  fireEvent.change(names[0], { target: { value: '스쿼트' } });
  fireEvent.change(weights[0], { target: { value: '100000' } });
  fireEvent.change(names[2], { target: { value: '런지' } });
  // Bypasses native constraints so the contract itself is what rejects the input.
  fireEvent.submit(dialog.querySelector('form')!);
  expectInvalid(
    await within(dialog)
      .findAllByLabelText('총중량 kg')
      .then((w) => w[0]),
    '총중량은 0~99999 kg으로 입력하세요',
  );
  expectInvalid(within(dialog).getAllByLabelText('운동명')[1], '운동명을 입력하세요');
  expect(within(dialog).getAllByLabelText('운동명')[0]).not.toHaveAttribute('aria-invalid');
  expect(within(dialog).getByRole('status')).toHaveTextContent('입력을 확인하세요');
  expect(ui.posts('/api/workouts')).toHaveLength(0);

  fireEvent.change(within(dialog).getAllByLabelText('총중량 kg')[0], { target: { value: '100' } });
  fireEvent.change(within(dialog).getAllByLabelText('운동명')[1], { target: { value: '스쿼트' } });
  fireEvent.submit(dialog.querySelector('form')!);
  await waitFor(() => expect(ui.posts('/api/workouts')).toHaveLength(1));
  expect((ui.posts('/api/workouts')[0].body as { sets: unknown[] }).sets).toHaveLength(3);
});

test('the machine form requires a brand before registering', async () => {
  const ui = mount();
  await loaded();
  await openPage('머신 라이브러리', ui.user);
  await ui.user.click(screen.getByRole('button', { name: '머신 등록' }));
  const dialog = screen.getByRole('dialog', { name: '머신 등록' });
  fireEvent.submit(dialog.querySelector('form')!);
  expectInvalid(await within(dialog).findByLabelText('브랜드'), '브랜드를 선택하세요');
  expectInvalid(within(dialog).getByLabelText('머신 이름'), '머신 이름을 입력하세요');
  expect(ui.posts('/api/machines')).toHaveLength(0);
});
