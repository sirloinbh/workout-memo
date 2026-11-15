import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { List, ListItem } from './list';

test('rows are exposed as a named list with their items', () => {
  render(
    <List aria-label="Workout records">
      <ListItem>Lower body</ListItem>
      <ListItem className="custom">Upper body</ListItem>
    </List>,
  );
  expect(screen.getByRole('list', { name: 'Workout records' })).toBeInTheDocument();
  const items = screen.getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual(['Lower body', 'Upper body']);
  expect(items[1]).toHaveClass('custom');
});
