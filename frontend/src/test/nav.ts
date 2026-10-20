import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

type User = ReturnType<typeof userEvent.setup>;

// Pages are links in the main menu (#62); the current one is aria-current="page".
export async function openPage(label: string, user: User = userEvent.setup()) {
  const menu = screen.getByRole('navigation', { name: '주요 메뉴' });
  await user.click(within(menu).getByRole('link', { name: label }));
  await waitFor(() =>
    expect(within(menu).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page'),
  );
}
