import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { List, ListItem } from './list';

test('rows are exposed as a named list with their items', () => {
  render(
    <List aria-label="운동 기록">
      <ListItem>하체</ListItem>
      <ListItem className="custom">상체</ListItem>
    </List>,
  );
  expect(screen.getByRole('list', { name: '운동 기록' })).toBeInTheDocument();
  const items = screen.getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual(['하체', '상체']);
  expect(items[1]).toHaveClass('custom');
});
