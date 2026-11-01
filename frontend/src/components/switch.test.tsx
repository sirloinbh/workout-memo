import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Switch } from './switch';
import { Label } from './ui/label';

test('a switch is named by its label and toggles', () => {
  const onCheckedChange = vi.fn();
  render(
    <>
      <Switch id="auto" onCheckedChange={onCheckedChange} />
      <Label htmlFor="auto">세트 완료 시 자동 시작</Label>
    </>,
  );
  const control = screen.getByRole('switch', { name: '세트 완료 시 자동 시작' });
  expect(control).not.toBeChecked();
  fireEvent.click(control);
  expect(control).toBeChecked();
  expect(onCheckedChange).toHaveBeenCalledWith(true);
});

test('a disabled switch does not toggle', () => {
  render(<Switch aria-label="알림" disabled />);
  const control = screen.getByRole('switch', { name: '알림' });
  fireEvent.click(control);
  expect(control).not.toBeChecked();
});
