import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #86: the goal form suggests the latest goal or record plus the exercise's increment,
// and the increment can be changed for the exercise.
function mount() {
  fixClock();
  let step: number | null = null;
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/exercise-weight-steps' && method === 'PUT') {
      step = (body as { weight_step: number | null }).weight_step;
      return { exercise: '벤치프레스', weight_step: step ?? 5, custom: step !== null };
    }
    if (url.pathname === '/api/goal-suggestion') {
      const name = url.searchParams.get('exercise');
      const weightStep = step ?? 5;
      return name === '벤치프레스'
        ? {
            exercise: '벤치프레스',
            weight_step: weightStep,
            custom: step !== null,
            base: { source: 'record', weight: 100, reps: 8 },
            target_weight: 100 + weightStep,
          }
        : { exercise: name, weight_step: 5, custom: false, base: null, target_weight: null };
    }
    if (url.pathname === '/api/goals' && method === 'POST') return json({ id: 1 }, 201);
    return [];
  });
  return { user: userEvent.setup(), requests: api.requests };
}
const dialog = () => screen.getByRole('dialog');
const box = () => within(dialog()).getByRole('region', { name: '다음 목표 제안' });

test('the suggestion fills the target and the increment is saved per exercise', async () => {
  const ui = mount();
  render(<App />);
  await openPage('나의 목표', ui.user);
  await ui.user.click(screen.getByRole('button', { name: '목표 추가' }));
  await ui.user.type(within(dialog()).getByLabelText('운동명'), '벤치프레스');
  await waitFor(() => expect(box().textContent).toMatch(/제안 105 kg · 직전 기록 100 kg \+ 5 kg/));
  await ui.user.click(within(box()).getByRole('button', { name: '제안 적용' }));
  expect(within(dialog()).getByLabelText('목표 총중량 (kg)')).toHaveValue(105);

  const stepInput = within(box()).getByLabelText('이 운동의 증량 단위 (kg)');
  expect(stepInput).toHaveValue(5);
  await ui.user.clear(stepInput);
  await ui.user.type(stepInput, '2.5');
  await ui.user.click(within(box()).getByRole('button', { name: '증량 단위 저장' }));
  await waitFor(() =>
    expect(box().textContent).toMatch(/제안 102.5 kg · 직전 기록 100 kg \+ 2.5 kg/),
  );
  const put = ui.requests.find((r) => r.method === 'PUT')!;
  expect(put.body).toEqual({ exercise: '벤치프레스', weight_step: 2.5 });

  // An invalid increment is explained and not sent.
  await ui.user.clear(stepInput);
  await ui.user.type(stepInput, '0');
  await ui.user.click(within(box()).getByRole('button', { name: '증량 단위 저장' }));
  expect(box().textContent).toMatch(/증량 단위는 0보다 커야 합니다/);
  expect(ui.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);

  await ui.user.click(within(box()).getByRole('button', { name: '기본값(5 kg)으로' }));
  await waitFor(() => expect(box().textContent).toMatch(/제안 105 kg/));
  expect(ui.requests.filter((r) => r.method === 'PUT').at(-1)!.body).toEqual({
    exercise: '벤치프레스',
    weight_step: null,
  });
});

test('without a goal or record there is no suggestion', async () => {
  const ui = mount();
  render(<App />);
  await openPage('나의 목표', ui.user);
  await ui.user.click(screen.getByRole('button', { name: '목표 추가' }));
  await ui.user.type(within(dialog()).getByLabelText('운동명'), '새 운동');
  await waitFor(() =>
    expect(box().textContent).toMatch(/목표나 완료 기록이 없어 제안할 수 없습니다/),
  );
  expect(within(box()).queryByRole('button', { name: '제안 적용' })).toBeNull();
});
