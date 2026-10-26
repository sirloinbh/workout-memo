import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

// Always-open modal on the common Dialog: the parent mounts it to open and unmounts it in
// close(). Escape, the close button and a click outside call close(). The content keeps
// the app's form styles (.legacy .modal in style.css).
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="legacy modal" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
