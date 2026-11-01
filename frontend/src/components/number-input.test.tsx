import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';

import { NumberInput } from './number-input';
import { stepValue } from './number-step';

function Weight({
  initial = '100',
  step = 2.5,
  min = 0,
  max,
}: {
  initial?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      label="중량"
      value={value}
      onValueChange={setValue}
      step={step}
      min={min}
      max={max}
    />
  );
}

const field = () => screen.getByRole('textbox', { name: '중량' });
const down = () => screen.getByRole('button', { name: '중량 줄이기' });
const up = () => screen.getByRole('button', { name: '중량 늘리기' });

test('the buttons change the value by the step', () => {
  render(<Weight />);
  fireEvent.click(up());
  expect(field()).toHaveValue('102.5');
  fireEvent.click(down());
  fireEvent.click(down());
  expect(field()).toHaveValue('97.5');
});

test('typing keeps the text as written', () => {
  render(<Weight />);
  fireEvent.change(field(), { target: { value: '12.' } });
  expect(field()).toHaveValue('12.');
});

test('the button at a limit is disabled', () => {
  render(<Weight initial="0" max={0} />);
  expect(down()).toBeDisabled();
  expect(up()).toBeDisabled();
});

test('a whole-number step opens the numeric keypad, a fractional one the decimal keypad', () => {
  const { unmount } = render(<Weight step={1} />);
  expect(field()).toHaveAttribute('inputmode', 'numeric');
  unmount();
  render(<Weight step={0.25} />);
  expect(field()).toHaveAttribute('inputmode', 'decimal');
});

test('stepValue rounds to the step, clamps, and treats an empty field as the minimum', () => {
  expect(stepValue('0.1', 0.2)).toBe('0.3');
  expect(stepValue('12.25', 1)).toBe('13.25');
  expect(stepValue('10', -2.5, 9)).toBe('9');
  expect(stepValue('10', 5, undefined, 12)).toBe('12');
  expect(stepValue('', 2.5, 0)).toBe('2.5');
  expect(stepValue('abc', 1)).toBe('1');
});
