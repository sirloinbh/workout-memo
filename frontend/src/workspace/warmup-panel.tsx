import { formatKg } from '../plates';
import { suggestWarmups } from '../warmup';

/** #480: warm-up sets for the weight entered. Suggestion only; nothing here is saved. */
export function WarmupPanel({ working, step, id }: { working: number; step: number; id: string }) {
  const sets = suggestWarmups(working, step);
  return (
    <div data-slot="warmup-panel" id={id} className="grid gap-1 text-meta md:col-span-2">
      {sets.length === 0 ? (
        <p className="m-0">
          {Number.isFinite(working) && working > 0
            ? 'No warm-up sets for such a light weight.'
            : 'Enter a weight to see warm-up sets.'}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {sets.map((s) => (
            <li key={s.percent}>
              {formatKg(s.weight)} × {s.reps} reps ({s.percent}%)
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-muted-foreground">
        A suggestion only, rounded to {formatKg(step)}. It is not saved and does not count toward
        volume, goals or records.
      </p>
    </div>
  );
}
