import { type ReactNode, useRef, useState } from 'react';

import { ConfirmDialog } from './ui/confirm-dialog';

// #381: the page's delete confirmation. `ask(item, button)` opens the dialog for one item;
// Delete runs `onConfirm`, which the dialog waits for with its buttons disabled, so a double
// click sends one request. Render `dialog` once in the page. Focus returns to the button that
// asked, while it is still on the page.
export function useConfirmDelete<T>({
  title,
  description = 'This cannot be undone.',
  onConfirm,
}: {
  title: (item: T) => string;
  description?: ReactNode;
  onConfirm: (item: T) => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  // Kept after closing, so the text does not change while the dialog fades out.
  const [item, setItem] = useState<T | null>(null);
  const from = useRef<HTMLElement | null>(null);
  const ask = (next: T, button?: HTMLElement) => {
    from.current = button ?? null;
    setItem(next);
    setOpen(true);
  };
  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title={item === null ? '' : title(item)}
      description={description}
      returnFocusRef={from}
      onConfirm={() => (item === null ? undefined : onConfirm(item))}
    />
  );
  return { ask, dialog };
}
