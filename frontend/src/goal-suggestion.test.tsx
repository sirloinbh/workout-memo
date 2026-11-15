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
      return { exercise: 'Benchpress', weight_step: step ?? 5, custom: step !== null };
    }
    if (url.pathname === '/api/goal-suggestion') {
      const name = url.searchParams.get('exercise');
      const weightStep = step ?? 5;
      return name === 'Benchpress'
        ? {
            exercise: 'Benchpress',
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
const box = () => within(dialog()).getByRole('region', { name: 'Suggest next goal' });

test('the suggestion fills the target and the increment is saved per exercise', async () => {
  const ui = mount();
  render(<App />);
  await openPage('My Goals', ui.user);
  await ui.user.click(screen.getByRole('button', { name: 'Add goal' }));
  await ui.user.type(within(dialog()).getByLabelText('Exercise name'), 'Benchpress');
  await waitFor(() =>
    expect(box().textContent).toMatch(/Suggestion 105 kg · Previous record 100 kg \+ 5 kg/),
  );
  await ui.user.click(within(box()).getByRole('button', { name: 'Apply suggestion' }));
  expect(within(dialog()).getByLabelText('Goal total weight (kg)')).toHaveValue(105);

  const stepInput = within(box()).getByLabelText('Increase step for this exercise (kg)');
  expect(stepInput).toHaveValue(5);
  await ui.user.clear(stepInput);
  await ui.user.type(stepInput, '2.5');
  await ui.user.click(within(box()).getByRole('button', { name: 'Save increase step' }));
  await waitFor(() =>
    expect(box().textContent).toMatch(/Suggestion 102.5 kg · Previous record 100 kg \+ 2.5 kg/),
  );
  const put = ui.requests.find((r) => r.method === 'PUT')!;
  expect(put.body).toEqual({ exercise: 'Benchpress', weight_step: 2.5 });

  // An invalid increment is explained and not sent.
  await ui.user.clear(stepInput);
  await ui.user.type(stepInput, '0');
  await ui.user.click(within(box()).getByRole('button', { name: 'Save increase step' }));
  expect(box().textContent).toMatch(/The increase step must be greater than 0/);
  expect(ui.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);

  await ui.user.click(within(box()).getByRole('button', { name: 'To the default (5 kg)' }));
  await waitFor(() => expect(box().textContent).toMatch(/Suggestion 105 kg/));
  expect(ui.requests.filter((r) => r.method === 'PUT').at(-1)!.body).toEqual({
    exercise: 'Benchpress',
    weight_step: null,
  });
});

test('without a goal or record there is no suggestion', async () => {
  const ui = mount();
  render(<App />);
  await openPage('My Goals', ui.user);
  await ui.user.click(screen.getByRole('button', { name: 'Add goal' }));
  await ui.user.type(within(dialog()).getByLabelText('Exercise name'), 'New exercise');
  await waitFor(() => expect(box().textContent).toMatch(/has no goals or completed records/));
  expect(within(box()).queryByRole('button', { name: 'Apply suggestion' })).toBeNull();
});
