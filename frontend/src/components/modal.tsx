import { type ReactNode, useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { keyboardInset } from './keyboard-inset';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

// #105: below `sm` (640px) a modal leaves the centred card. "sheet" sits on the bottom edge
// for short forms; "full" fills the screen for long ones (the workout editor). Both end at
// --keyboard-inset, the part of the screen an on-screen keyboard covers, so the last field
// and a ModalFooter stay above the keyboard. scroll-padding keeps a focused field clear of
// the footer when the browser scrolls it into view.
const layouts = {
  sheet:
    'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-[var(--keyboard-inset,0px)] max-sm:max-h-[calc(100dvh-var(--keyboard-inset,0px)-2rem)] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:rounded-b-none',
  full: 'max-sm:inset-x-0 max-sm:top-0 max-sm:bottom-[var(--keyboard-inset,0px)] max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:rounded-none max-sm:border-0',
} as const;

function useKeyboardInset(content: HTMLElement | null) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!content || !viewport) return;
    const sync = () => {
      const inset = keyboardInset(window.innerHeight, viewport);
      content.style.setProperty('--keyboard-inset', `${inset}px`);
      // The modal just got shorter: bring the field being typed into back into view.
      const active = document.activeElement;
      if (inset > 0 && active instanceof HTMLElement && content.contains(active))
        active.scrollIntoView?.({ block: 'nearest' });
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [content]);
}

// Always-open modal on the common Dialog: the parent mounts it to open and unmounts it in
// close(). Escape, the close button and a click outside call close(). The content keeps
// the app's form styles (.legacy .modal in style.css).
export function Modal({
  title,
  close,
  layout = 'sheet',
  children,
}: {
  title: string;
  close: () => void;
  layout?: keyof typeof layouts;
  children: ReactNode;
}) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  useKeyboardInset(content);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        ref={setContent}
        data-layout={layout}
        className={cn('legacy modal scroll-pb-24', layouts[layout])}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// The modal's main action, kept on the bottom edge of the modal while its form scrolls.
// It spans the modal's 24px side padding so fields scroll behind it, not beside it.
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="modal-footer"
      className="sticky bottom-0 z-10 -mx-6 border-t bg-background px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {children}
    </div>
  );
}
