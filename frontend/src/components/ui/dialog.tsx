import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

// Modal dialog: Escape and a backdrop click close it, page scroll is locked while open,
// and focus starts on the close button.
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">
          <h2>{title}</h2>
          <Button autoFocus variant="icon" aria-label="닫기" onClick={close}>
            <X size={21} />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
