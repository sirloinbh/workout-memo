import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { NewRecords } from './new-records';

test('shows a new record badge for each record set after a save', () => {
  render(
    <NewRecords
      records={[
        {
          position: 0,
          exercise: 'Bench',
          weight: 105,
          reps: 5,
          estimated_1rm: 122.5,
          previous_best: 116.67,
        },
      ]}
    />,
  );
  expect(screen.getByText('New record')).toBeTruthy();
  expect(screen.getByText('Bench')).toBeTruthy();
  expect(screen.getByText(/est\. 1RM 122\.5 kg \(was 116\.67 kg\)/)).toBeTruthy();
});

test('renders nothing when no set beat a record', () => {
  const { container } = render(<NewRecords records={[]} />);
  expect(container.innerHTML).toBe('');
});
