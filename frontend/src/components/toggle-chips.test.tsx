import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';

import { ToggleChips } from './toggle-chips';

function Parts() {
  const [value, setValue] = useState<string[]>(['Chest']);
  return (
    <>
      <ToggleChips
        label="Body part"
        options={['Chest', 'Back', 'Shoulders']}
        value={value}
        onValueChange={setValue}
      />
      <output>{value.join(',')}</output>
    </>
  );
}

test('each chip reports whether it is pressed', () => {
  render(<Parts />);
  expect(screen.getByRole('group', { name: 'Body part' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Chest' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-pressed', 'false');
});

test('the result follows the option order, not the click order', () => {
  render(<Parts />);
  fireEvent.click(screen.getByRole('button', { name: 'Chest' }));
  fireEvent.click(screen.getByRole('button', { name: 'Shoulders' }));
  fireEvent.click(screen.getByRole('button', { name: 'Chest' }));
  expect(screen.getByRole('status')).toHaveTextContent('Chest,Shoulders');
});

test('arrow keys move focus between chips', async () => {
  render(<Parts />);
  const first = screen.getByRole('button', { name: 'Chest' });
  first.focus();
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus());
});

test('several chips can be on, and all can be turned off', () => {
  render(<Parts />);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('status')).toHaveTextContent('Chest,Back');
  fireEvent.click(screen.getByRole('button', { name: 'Chest' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
