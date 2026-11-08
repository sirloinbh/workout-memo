import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { NumberInput, NumberValueInput } from './number-input';
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

test('only the button at the limit stops, and it keeps keyboard focus', () => {
  render(<Weight initial="2.5" min={0} max={5} />);
  fireEvent.click(down());
  expect(field()).toHaveValue('0');
  expect(down()).toHaveAttribute('aria-disabled', 'true');
  expect(down()).toBeEnabled();
  expect(up()).not.toHaveAttribute('aria-disabled');
  fireEvent.click(down());
  expect(field()).toHaveValue('0');

  fireEvent.click(up());
  fireEvent.click(up());
  expect(field()).toHaveValue('5');
  expect(up()).toHaveAttribute('aria-disabled', 'true');
  expect(down()).not.toHaveAttribute('aria-disabled');
});

test('a read-only or disabled field cannot be changed with the buttons', () => {
  const onValueChange = vi.fn();
  const { rerender } = render(
    <NumberInput label="중량" value="10" onValueChange={onValueChange} readOnly />,
  );
  expect(field()).toHaveAttribute('readonly');
  fireEvent.click(up());
  rerender(<NumberInput label="중량" value="10" onValueChange={onValueChange} disabled />);
  expect(field()).toBeDisabled();
  fireEvent.click(down());
  expect(onValueChange).not.toHaveBeenCalled();
});

test('an empty field can still be stepped from the minimum', () => {
  render(<Weight initial="" min={0} />);
  expect(down()).not.toHaveAttribute('aria-disabled');
  fireEvent.click(up());
  expect(field()).toHaveValue('2.5');
});

test('a whole-number step opens the numeric keypad, a fractional one the decimal keypad', () => {
  const { unmount } = render(<Weight step={1} />);
  expect(field()).toHaveAttribute('inputmode', 'numeric');
  unmount();
  render(<Weight step={0.25} />);
  expect(field()).toHaveAttribute('inputmode', 'decimal');
});

test('the keypad can be chosen, for kg in whole steps that may hold decimals', () => {
  render(
    <NumberInput label="중량" value="10" onValueChange={() => {}} step={5} inputMode="decimal" />,
  );
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

// #105: a set's weight is a number in the editor state.
function NumericWeight({ initial = 100 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberValueInput label="중량" value={value} onValueChange={setValue} step={2.5} min={0} />
      <output>{String(value)}</output>
      <button type="button" onClick={() => setValue(60)}>
        초안 복구
      </button>
    </>
  );
}
const stored = () => screen.getByRole('status').textContent;

test('a number field keeps typed text while it reads as the stored number', () => {
  render(<NumericWeight />);
  fireEvent.change(field(), { target: { value: '12.' } });
  expect(field()).toHaveValue('12.');
  expect(stored()).toBe('12');
  fireEvent.change(field(), { target: { value: '' } });
  expect(field()).toHaveValue('');
  expect(stored()).toBe('0');
});

test('a number field shows a value set from outside and steps from it', () => {
  render(<NumericWeight />);
  fireEvent.click(up());
  expect(field()).toHaveValue('102.5');
  expect(stored()).toBe('102.5');
  fireEvent.click(screen.getByRole('button', { name: '초안 복구' }));
  expect(field()).toHaveValue('60');
  fireEvent.click(down());
  expect(stored()).toBe('57.5');
});

test('the field name is on the input only, so a label lookup finds one element', () => {
  render(<Weight />);
  expect(screen.getAllByLabelText('중량')).toEqual([field()]);
});

test('a decimal comma reads as a point and unreadable text is not taken', () => {
  render(<NumericWeight />);
  fireEvent.change(field(), { target: { value: '12,5' } });
  expect(field()).toHaveValue('12.5');
  expect(stored()).toBe('12.5');
  for (const typed of ['12.5a', '-', '1..', 'Infinity', '0x10', '1e3', ' 5']) {
    fireEvent.change(field(), { target: { value: typed } });
    expect(field()).toHaveValue('12.5');
    expect(stored()).toBe('12.5');
  }
});

test('a value can start with the decimal point', () => {
  render(<NumericWeight />);
  fireEvent.change(field(), { target: { value: '.' } });
  expect(field()).toHaveValue('.');
  expect(stored()).toBe('0');
  fireEvent.change(field(), { target: { value: '.5' } });
  expect(field()).toHaveValue('.5');
  expect(stored()).toBe('0.5');
});
