import type { ComponentProps } from 'react';

import { cn } from '../lib/utils';

// A record list inside a Card: rows divided by a line, with actions at the row's end.
export function List({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-col divide-y divide-border', className)} {...props} />;
}

export function ListItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('flex min-h-11 items-center gap-3 py-3', className)} {...props} />;
}
