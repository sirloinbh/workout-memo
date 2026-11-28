import { cardioWeeklyTargets } from '../../../shared/contract';
import { plural } from '../labels';
import { cn } from '../lib/utils';
import { byWeek, kindLabel, previewTargets } from '../progression';
import { cardioLabel, cardioUnit } from '../routine-cardio';
import { cardioPayload, type Plan, type Split, type Steps, withSteps } from './model';
import { hint, list } from './styles';

// #117: each split's cardio items with their 12 weekly targets (all modes; intervals are fixed).
export function CardioPreview({ splits }: { splits: Split[] }) {
  const items = splits.flatMap((s) => (s.cardio ?? []).map((c) => ({ split: s.name, item: c })));
  if (!items.length) return null;
  return (
    <section data-slot="routine-cardio-preview" className="my-5 rounded-xl border p-4">
      <h4 className="mb-2 text-body-sm font-semibold">Cardio · 12 weeks</h4>
      <ul className={list}>
        {items.map(({ split, item }, i) => {
          const weeks =
            item.interval || item.minutes === '' || item.distance_km === ''
              ? null
              : cardioWeeklyTargets(cardioPayload(item));
          return (
            <li key={i} className="[overflow-wrap:anywhere]">
              <span className="font-medium">
                {split} · {cardioLabel(item)}
              </span>
              {weeks && (
                <span className="block text-meta text-muted-foreground">
                  {weeks
                    .map(
                      (w) =>
                        `Week ${w.week}${w.deload ? ' deload' : ''} ${w.target} ${cardioUnit(item)}`,
                    )
                    .join(', ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// #102: native <details> stay (components/ui has no accordion); the deload weeks are marked
// with data-deload and a stronger text colour instead of the old .deload class.
// In the form it sits under the step's h3 (#105), in the plan view under the plan's h3.
export function Preview({ plan, steps }: { plan: Plan; steps: Steps }) {
  const preview = previewTargets(withSteps(plan, steps));
  if (!preview)
    return (
      <p className={cn(hint, 'my-5')}>
        Enter a start date and a schedule (cycle or rest weekdays) to see the 12-week projected
        goals.
      </p>
    );
  return (
    <section data-slot="routine-preview" className="my-5 rounded-xl border p-4">
      <h4 className="mb-2 text-body-sm font-semibold">
        12-week projected goals · may change with your records
      </h4>
      {preview.map((split, i) =>
        split
          .filter((ex) => ex.exercise.trim())
          .map((ex, j) => (
            <details key={`${i}-${j}`} open className="border-t first-of-type:border-t-0">
              <summary className="cursor-pointer py-2 text-body-sm font-medium [overflow-wrap:anywhere] pointer-coarse:py-3">
                {plan.splits[i].name} · {ex.exercise}
              </summary>
              <ol className="mb-3 space-y-1.5 pl-1 text-meta text-muted-foreground">
                {byWeek(ex.rows).map((w) => (
                  <li
                    key={w.week}
                    data-deload={w.week % 4 === 0 || undefined}
                    className="[overflow-wrap:anywhere] data-deload:font-medium data-deload:text-foreground"
                  >
                    {`Week ${w.week}${w.week % 4 === 0 ? ' deload' : ''}: `}
                    {w.rows
                      .map(
                        (r) =>
                          `Session ${r.session} ${String(r.weight)} kg × ${plural(r.reps, 'rep')} (${kindLabel(r)})`,
                      )
                      .join(', ')}
                  </li>
                ))}
              </ol>
            </details>
          )),
      )}
    </section>
  );
}
