import { ToggleGroup } from 'radix-ui';

import { cn } from '../lib/utils';

const chip =
  'min-h-8 rounded-full border border-input px-3 text-body-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11';

type Shared = {
  label: string;
  options: readonly string[];
  /** The text shown for an option; the option itself stays the stored value. */
  renderOption?: (option: string) => string;
  className?: string;
};
type Multiple = {
  type?: 'multiple';
  value: readonly string[];
  onValueChange: (value: string[]) => void;
};
// #379: one choice at most, announced as a radio group. Pressing the chosen chip again clears it
// (null), so "not recorded" stays reachable.
type Single = {
  type: 'single';
  value: string | null;
  onValueChange: (value: string | null) => void;
};

// Multiple: any number of choices, including none (body parts of an exercise). The result
// follows the order of options, not of the clicks, so the same choice always gives the same array.
// Single: at most one choice, with the value itself (not its label) as the result.
export function ToggleChips({
  label,
  options,
  className,
  renderOption = (option) => option,
  ...mode
}: Shared & (Multiple | Single)) {
  const items = options.map((option) => (
    <ToggleGroup.Item key={option} value={option} className={chip}>
      {renderOption(option)}
    </ToggleGroup.Item>
  ));
  const classes = cn('flex flex-wrap gap-2', className);
  if (mode.type === 'single')
    return (
      <ToggleGroup.Root
        type="single"
        role="radiogroup"
        aria-label={label}
        value={mode.value ?? ''}
        onValueChange={(next) => mode.onValueChange(options.includes(next) ? next : null)}
        className={classes}
      >
        {items}
      </ToggleGroup.Root>
    );
  return (
    <ToggleGroup.Root
      type="multiple"
      role="group"
      aria-label={label}
      value={[...mode.value]}
      onValueChange={(next) =>
        mode.onValueChange(options.filter((option) => next.includes(option)))
      }
      className={classes}
    >
      {items}
    </ToggleGroup.Root>
  );
}
