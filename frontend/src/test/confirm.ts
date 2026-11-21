import { screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

// #381: deletes ask in a dialog (ConfirmDialog) instead of the browser's confirm().
type User = ReturnType<typeof userEvent.setup>;
const dialogButton = (name: string) =>
  within(screen.getByRole('dialog')).getByRole('button', { name });
export const confirmDelete = (user: User) => user.click(dialogButton('Delete'));
export const cancelDelete = (user: User) => user.click(dialogButton('Cancel'));
