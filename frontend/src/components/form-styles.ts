import { cn } from '../lib/utils';

// Shared looks for the forms moved off style.css in #103 (goal, machine, body record, InBody
// import, backup). Kept as class strings so each form still renders its own elements.

// A field label stacked over its control. `.legacy .modal label` still sets the margin and
// column direction for the other modals; here the utilities name them.
export const fieldLabel =
  'mb-4 flex-col items-stretch gap-2 text-meta font-normal text-muted-foreground';

// The common Input drops to 14px from 768px; touch screens keep 16px so iOS does not zoom (#104).
export const touchText = 'md:pointer-coarse:text-base';

// The browser's own select and textarea dressed like the common Input. The common Select (Radix)
// picks values differently, so every test that chooses an option would change (#101).
const fieldBox = cn(
  'w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 md:text-body-sm dark:bg-input/30',
  touchText,
);
export const selectField = cn(fieldBox, 'h-9 py-0 pointer-coarse:min-h-11');
export const textareaField = cn(fieldBox, 'min-h-20 resize-y py-2');

// A short explanation in a grey box under or above a field.
export const formHint = 'rounded-md bg-muted p-3 text-meta text-muted-foreground';
