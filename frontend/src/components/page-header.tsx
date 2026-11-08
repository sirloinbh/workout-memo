import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

// #222: the heading at the top of a page — a small eyebrow line, the page's h1 with its muted
// closing dot, a short description, and the page's main actions. On phones the actions move
// under the text; from md they sit on the right. Pass `Button`s from components/ui as actions.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        'mb-6 flex flex-col items-start gap-4 md:mb-9 md:flex-row md:items-center md:justify-between md:gap-5',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[9px] leading-normal font-semibold tracking-[2px] text-muted-foreground max-md:text-[8px]">
          {eyebrow}
        </p>
        <h1 className="my-3 text-2xl leading-tight font-semibold tracking-[-1.2px] xl:text-[28px]">
          {title}
          <span className="text-muted-foreground">.</span>
        </h1>
        <p className="text-meta leading-[1.7] text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
