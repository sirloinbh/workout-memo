import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { StallSuggestions } from './routine-stalls';

const stall = {
  exercise: 'Bench',
  misses: 3,
  weight: 100,
  reps: 8,
  weight_step: 5,
  deload_weight: 90,
  smaller_step: 2.5,
};

test('a stalled exercise shows the deload and the smaller step as a suggestion', () => {
  render(<StallSuggestions stalls={[stall]} />);
  const card = screen.getByRole('region', { name: 'Stall suggestions' });
  expect(card.textContent).toMatch(/Bench missed its target 3 sessions in a row \(100 kg × 8\)/);
  expect(card.textContent).toMatch(/deload to 90 kg/);
  expect(card.textContent).toMatch(/smaller step of 2\.5 kg \(now 5 kg\)/);
  expect(card.textContent).toMatch(/Nothing changes unless/);
  expect(screen.queryByRole('button')).toBeNull();
});

test('nothing is shown without a stall', () => {
  const { container } = render(<StallSuggestions stalls={[]} />);
  expect(container.innerHTML).toBe('');
});
