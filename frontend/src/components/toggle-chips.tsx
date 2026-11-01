import { ToggleGroup } from 'radix-ui';

import { cn } from '../lib/utils';

// Any number of choices, including none: body parts of an exercise. The result follows the
// order of options, not of the clicks, so the same choice always gives the same array.
export function ToggleChips({
  label,
  options,
  value,
  onValueChange,
  className,
}: {
  label: string;
  options: readonly string[];
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="multiple"
      role="group"
      aria-label={label}
      value={[...value]}
      onValueChange={(next) => onValueChange(options.filter((option) => next.includes(option)))}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option}
          value={option}
          className="min-h-8 rounded-full border border-input px-3 text-body-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:min-h-11"
        >
          {option}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
