import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { StatCard } from './stat-card';

test('it shows the label, the value with its unit, and the note', () => {
  render(
    <StatCard
      label="누적 볼륨"
      value="1,500"
      unit="kg"
      icon={<svg aria-hidden="true" />}
      foot="총중량 × 반복 수"
    />,
  );

  expect(screen.getByText('누적 볼륨')).toBeInTheDocument();
  expect(screen.getByText('kg').parentElement).toHaveTextContent('1,500kg');
  expect(screen.getByText('총중량 × 반복 수')).toBeInTheDocument();
});
