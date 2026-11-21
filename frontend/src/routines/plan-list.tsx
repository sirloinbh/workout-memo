import { Button } from '../components/ui/button';
import { Spinner } from '../components/ui/spinner';
import { type Plan } from './model';

export function PlanList({
  plans,
  disabled,
  opening,
  onOpen,
}: {
  plans: Plan[];
  disabled: boolean;
  opening: number | null;
  onOpen: (plan: Plan, button: HTMLButtonElement) => void;
}) {
  return (
    <ul data-slot="plan-list" className="mt-3 divide-y rounded-lg border">
      {plans.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="min-w-0 text-body-sm [overflow-wrap:anywhere]">{p.name}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-busy={opening === p.id || undefined}
            onClick={(e) => onOpen(p, e.currentTarget)}
          >
            {opening === p.id && <Spinner size="sm" aria-hidden />}
            View plan
          </Button>
        </li>
      ))}
    </ul>
  );
}
