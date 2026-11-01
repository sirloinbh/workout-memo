import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { SegmentedControl } from './segmented-control';

const options = [
  { value: 'week', label: '1주' },
  { value: 'month', label: '1달' },
  { value: 'year', label: '1년' },
] as const;

function Period({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<(typeof options)[number]['value']>('week');
  return (
    <SegmentedControl
      label="기간"
      options={options}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

test('the group is named and only the current option is checked', () => {
  render(<Period />);
  expect(screen.getByRole('radiogroup', { name: '기간' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '1주' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '1달' })).not.toBeChecked();
});

test('choosing another option moves the selection', () => {
  const onChange = vi.fn();
  render(<Period onChange={onChange} />);
  fireEvent.click(screen.getByRole('radio', { name: '1달' }));
  expect(onChange).toHaveBeenCalledWith('month');
  expect(screen.getByRole('radio', { name: '1달' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '1주' })).not.toBeChecked();
});

test('clicking the current option keeps it selected', () => {
  const onChange = vi.fn();
  render(<Period onChange={onChange} />);
  fireEvent.click(screen.getByRole('radio', { name: '1주' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: '1주' })).toBeChecked();
});

test('clicking the current option reports a reselect', () => {
  const onReselect = vi.fn();
  render(
    <SegmentedControl
      label="기간"
      options={options}
      value="week"
      onValueChange={() => {}}
      onReselect={onReselect}
    />,
  );
  fireEvent.click(screen.getByRole('radio', { name: '1주' }));
  expect(onReselect).toHaveBeenCalledOnce();
});

test('focus enters on the selected option and arrow keys move it', async () => {
  render(<Period />);
  screen.getByRole('radiogroup', { name: '기간' }).focus();
  const current = screen.getByRole('radio', { name: '1주' });
  await waitFor(() => expect(current).toHaveFocus());
  fireEvent.keyDown(current, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('radio', { name: '1달' })).toHaveFocus());
});
