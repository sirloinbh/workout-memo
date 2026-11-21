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

// #379: renderOption shows a label and keeps the option as the stored value.
test('renderOption shows its text while the option stays the value', () => {
  render(
    <>
      <ToggleChips
        label="Part"
        options={['chest', 'back']}
        renderOption={(option) => option.toUpperCase()}
        value={['chest']}
        onValueChange={() => undefined}
      />
    </>,
  );
  expect(screen.getByRole('button', { name: 'CHEST' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'chest' })).toBeNull();
});

function Effort() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <ToggleChips
        type="single"
        label="Effort"
        options={['hard', 'medium', 'easy']}
        renderOption={(option) => option[0].toUpperCase() + option.slice(1)}
        value={value}
        onValueChange={setValue}
      />
      <output>{value ?? 'none'}</output>
    </>
  );
}

test('single-select is announced as one choice and reports the value, not the label', () => {
  render(<Effort />);
  expect(screen.getByRole('radiogroup', { name: 'Effort' })).toBeInTheDocument();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
  expect(screen.getByRole('status')).toHaveTextContent('hard');
  expect(screen.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');
});

test('single-select: a new press replaces the choice and pressing it again clears it', () => {
  render(<Effort />);
  fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Easy' }));
  expect(screen.getByRole('status')).toHaveTextContent('easy');
  expect(screen.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(screen.getByRole('radio', { name: 'Easy' }));
  expect(screen.getByRole('status')).toHaveTextContent('none');
});
