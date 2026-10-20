import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

// Variants map to the existing button classes in style.css, so the look is unchanged.
export const buttonVariants = cva('', {
  variants: {
    variant: {
      primary: 'primary',
      subtle: 'subtle-button',
      text: 'text-button',
      icon: 'icon-button',
    },
    full: { true: 'full' },
  },
  defaultVariants: { variant: 'primary' },
});

export function Button({
  className,
  variant,
  full,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return (
    <button className={cn(buttonVariants({ variant, full }), className) || undefined} {...props} />
  );
}
