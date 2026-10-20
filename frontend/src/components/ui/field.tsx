import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Ids for field messages: "sets.0.weight" becomes "issue-sets-0-weight".
export const fieldErrorId = (name: string) => 'issue-' + name.replace(/\./g, '-');

// Props that link a control to its message (#64): aria-invalid and aria-describedby.
export function invalidProps(name: string, message?: string) {
  return message ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(name) } : {};
}

// The message sits outside the <label> so the control's accessible name stays the label.
export function FieldError({ name, children }: { name: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <span className="field-error" id={fieldErrorId(name)}>
      {children}
    </span>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(className) || undefined} {...props} />;
}
