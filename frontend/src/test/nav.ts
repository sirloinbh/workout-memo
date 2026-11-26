import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

type User = ReturnType<typeof userEvent.setup>;

// Pages are links in the main menu (#62); the current one is aria-current="page".
export async function openPage(label: string, user: User = userEvent.setup()) {
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  await user.click(within(menu).getByRole('link', { name: label }));
  await waitFor(() =>
    expect(within(menu).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page'),
  );
}

// #508: Backup & Export and the Machine Library are reached from Settings, not the main menu.
export async function openFromSettings(label: string, user: User = userEvent.setup()) {
  await openPage('Settings', user);
  await user.click(screen.getByRole('link', { name: label }));
  await waitFor(() =>
    expect(window.location.pathname).toBe(label === 'Backup & Export' ? '/backup' : '/machines'),
  );
}

// #508: the rest settings live on the Settings page; set auto-start there and come back to the day log.
export async function enableAutoStart(
  user: User = userEvent.setup(),
  whileThere?: () => void | Promise<void>,
) {
  await openPage('Settings', user);
  const auto = screen.getByRole('switch', { name: 'Auto-start when a set is done' });
  if (auto.getAttribute('aria-checked') !== 'true') await user.click(auto);
  await whileThere?.();
  await openPage('Day log', user);
}
