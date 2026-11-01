import { MinusIcon, PlusIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';
import { stepValue } from './number-step';
import { Button } from './ui/button';
import { Input } from './ui/input';

// kg and reps with − and + for one-handed entry. The value stays a string like the app's other
// form fields, so typing "12." is not rewritten; the form and the server still validate it.
export function NumberInput({
  label,
  value,
  onValueChange,
  step = 1,
  min,
  max,
  disabled,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'step' | 'type'> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const parsed = value.trim() ? Number(value) : Number.NaN;
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${label} 줄이기`}
        disabled={disabled || (min !== undefined && parsed <= min)}
        onClick={() => onValueChange(stepValue(value, -step, min, max))}
      >
        <MinusIcon aria-hidden />
      </Button>
      <Input
        type="text"
        inputMode={Number.isInteger(step) ? 'numeric' : 'decimal'}
        aria-label={label}
        className="min-w-0 flex-1 text-center"
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        {...props}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${label} 늘리기`}
        disabled={disabled || (max !== undefined && parsed >= max)}
        onClick={() => onValueChange(stepValue(value, step, min, max))}
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  );
}
