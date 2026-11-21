import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { mockApi } from '../test/api';
import { CardioForm } from './cardio-form';

// #386: an issue on a field the form has no input for (an imported record's external_id) is
// shown at the form level instead of leaving "Apply to preview" looking dead.
test('an imported row with a bad external_id shows a form-level error and is not applied', async () => {
  mockApi(() => []);
  const user = userEvent.setup();
  const apply = vi.fn();
  render(
    <CardioForm
      session={{
        kind: 'running',
        date: '2026-11-02',
        duration_sec: 1200,
        distance_km: 4,
        avg_heart_rate: null,
        max_heart_rate: null,
        calories_kcal: null,
        elevation_gain_m: null,
        avg_cadence: null,
        effort: null,
        start_time: null,
        workout_id: null,
        memo: '',
        source: 'file',
        external_id: 'x'.repeat(201),
      }}
      date="2026-11-02"
      today="2026-11-08"
      workouts={[]}
      close={() => undefined}
      apply={apply}
    />,
  );
  const dialog = await screen.findByRole('dialog', { name: 'Edit imported record' });
  await user.click(within(dialog).getByRole('button', { name: 'Apply to preview' }));
  expect(await within(dialog).findByText(/This record cannot be used: external_id/)).toBeVisible();
  expect(apply).not.toHaveBeenCalled();
});
