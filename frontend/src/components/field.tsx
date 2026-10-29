import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/utils';
import { fieldErrorId } from './field-props';

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
