import type { ReactNode } from 'react';

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
