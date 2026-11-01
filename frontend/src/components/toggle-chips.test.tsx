import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';

import { ToggleChips } from './toggle-chips';

function Parts() {
  const [value, setValue] = useState<string[]>(['가슴']);
  return (
    <>
      <ToggleChips
        label="부위"
        options={['가슴', '등', '어깨']}
        value={value}
        onValueChange={setValue}
      />
      <output>{value.join(',')}</output>
    </>
  );
}

test('each chip reports whether it is pressed', () => {
  render(<Parts />);
  expect(screen.getByRole('group', { name: '부위' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '가슴' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '등' })).toHaveAttribute('aria-pressed', 'false');
});

test('several chips can be on, and all can be turned off', () => {
  render(<Parts />);
  fireEvent.click(screen.getByRole('button', { name: '등' }));
  expect(screen.getByRole('status')).toHaveTextContent('가슴,등');
  fireEvent.click(screen.getByRole('button', { name: '가슴' }));
  fireEvent.click(screen.getByRole('button', { name: '등' }));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
