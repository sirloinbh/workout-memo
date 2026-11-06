import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { DateStepper, RangeSummary } from './date-stepper';

test('the previous and next buttons move by one step in each direction', async () => {
  const onMove = vi.fn();
  render(
    <DateStepper label="기준 날짜" value="2026-10-15" onValueChange={() => {}} onMove={onMove} />,
  );
  await userEvent.click(screen.getByRole('button', { name: '이전 기간' }));
  await userEvent.click(screen.getByRole('button', { name: '다음 기간' }));
  expect(onMove.mock.calls).toEqual([[-1], [1]]);
  // Buttons inside a form must not submit it.
  expect(screen.getByRole('button', { name: '이전 기간' })).toHaveAttribute('type', 'button');
  expect(screen.getByLabelText('기준 날짜')).toHaveAttribute('data-slot', 'input');
});

test('a picked date is passed on, a cleared input keeps the current date', () => {
  const onValueChange = vi.fn();
  render(<DateStepper label="분석 기준 날짜" value="2026-10-15" onValueChange={onValueChange} />);
  const input = screen.getByLabelText('분석 기준 날짜');
  fireEvent.change(input, { target: { value: '2026-10-01' } });
  fireEvent.change(input, { target: { value: '' } });
  expect(onValueChange.mock.calls).toEqual([['2026-10-01']]);
  // Without onMove there are no step buttons.
  expect(screen.queryByRole('button')).toBeNull();
});

test('the range summary reads the first and last day before its note', () => {
  render(
    <RangeSummary from="2026-10-12" to="2026-10-18">
      선택한 기간의 기록
    </RangeSummary>,
  );
  expect(screen.getByText(/2026-10-12 — 2026-10-18/).textContent).toBe(
    '2026-10-12 — 2026-10-18 선택한 기간의 기록',
  );
});
