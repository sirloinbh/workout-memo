import type * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { filterOptions } from './combobox-filter';
import { Input } from './ui/input';

// #124: a text field with a filtered list of suggestions (WAI-ARIA APG "list autocomplete with
// manual selection"). Typing a value that is not in the list is always allowed. The app keeps
// its own Combobox until the shared one lands (project-standards#437).
//   ↓/↑ open the list and move through it, Enter picks the highlighted option, Esc closes.
// Options are 44px tall on touch screens; a tap keeps focus in the field.

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'list' | 'role'> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  /** Accessible name of the suggestion list, e.g. "운동명 후보". */
  listLabel: string;
};

export function Combobox({
  value,
  onValueChange,
  options,
  listLabel,
  id,
  className,
  onChange,
  onKeyDown,
  onBlur,
  onFocus,
  ref,
  ...props
}: Props) {
  const generated = useId();
  const listId = `${id ?? generated}-listbox`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = open ? filterOptions(options, value) : [];
  const expanded = shown.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;
  const input = useRef<HTMLInputElement>(null);

  // Esc closes the open list only. The dialog around the field listens for Esc on the document
  // in the capture phase, so the key is caught earlier, on the window, while the list is open.
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.activeElement !== input.current) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    };
    window.addEventListener('keydown', close, { capture: true });
    return () => window.removeEventListener('keydown', close, { capture: true });
  }, [expanded]);

  const pick = (option: string) => {
    onValueChange(option);
    setOpen(false);
    setActive(-1);
  };
  const move = (step: number) => {
    const list = filterOptions(options, value);
    if (!list.length) return;
    setOpen(true);
    setActive((current) =>
      !open || current < 0
        ? step > 0
          ? 0
          : list.length - 1
        : (current + step + list.length) % list.length,
    );
  };

  return (
    <div data-slot="combobox" className="relative">
      <Input
        {...props}
        ref={(node: HTMLInputElement | null) => {
          input.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        id={id}
        className={className}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        value={value}
        onChange={(event) => {
          onChange?.(event);
          onValueChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={onFocus}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'Enter' && expanded && active >= 0) {
            // Picking an option must not submit the form.
            event.preventDefault();
            pick(shown[active]);
          }
        }}
        onBlur={(event) => {
          onBlur?.(event);
          setOpen(false);
          setActive(-1);
        }}
      />
      {/* The list stays in the DOM so aria-controls always points at an element. */}
      <ul
        id={listId}
        role="listbox"
        aria-label={listLabel}
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {shown.map((option, i) => (
          // Keys stay on the field (aria-activedescendant), as in the APG combobox pattern.
          // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
          <li
            key={option}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            className={cn(
              'flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm pointer-coarse:min-h-11',
              i === active && 'bg-accent text-accent-foreground',
            )}
            // A press must not blur the field before the option is picked.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(option)}
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
}
