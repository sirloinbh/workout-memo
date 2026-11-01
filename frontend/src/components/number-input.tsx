import { MinusIcon, PlusIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';
import { stepValue } from './number-step';
import { Button } from './ui/button';
import { Input } from './ui/input';

// kg and reps with − and + for one-handed entry. The value stays a string like the app's other
// form fields, so typing "12." is not rewritten; the form and the server still validate it.
// A button at its limit uses aria-disabled, not disabled, so keyboard focus stays on it.
export function NumberInput({
  label,
  value,
  onValueChange,
  step = 1,
  min,
  max,
  disabled,
  readOnly,
  inputMode,
  className,
  ...props
}: Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'min' | 'max' | 'step' | 'type' | 'aria-label'
> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const parsed = value.trim() ? Number(value) : Number.NaN;
  const atMin = min !== undefined && parsed <= min;
  const atMax = max !== undefined && parsed >= max;
  const limitClass = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${label} 줄이기`}
        aria-disabled={atMin || undefined}
        className={limitClass}
        disabled={disabled || readOnly}
        onClick={() => {
          if (!atMin) onValueChange(stepValue(value, -step, min, max));
        }}
      >
        <MinusIcon aria-hidden />
      </Button>
      <Input
        {...props}
        type="text"
        inputMode={inputMode ?? (Number.isInteger(step) ? 'numeric' : 'decimal')}
        aria-label={label}
        className="min-w-0 flex-1 text-center"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${label} 늘리기`}
        aria-disabled={atMax || undefined}
        className={limitClass}
        disabled={disabled || readOnly}
        onClick={() => {
          if (!atMax) onValueChange(stepValue(value, step, min, max));
        }}
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  );
}
