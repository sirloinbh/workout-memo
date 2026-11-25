import { kg } from './progress-data';

// #478: an exercise that missed its routine target several sessions in a row. A suggestion only: nothing
// in the routine changes unless I edit it myself.
export type Stall = {
  exercise: string;
  misses: number;
  weight: number;
  reps: number;
  weight_step: number;
  deload_weight: number;
  smaller_step: number;
};

export function StallSuggestions({ stalls }: { stalls: Stall[] }) {
  if (!stalls.length) return null;
  return (
    <section
      aria-label="Stall suggestions"
      className="mt-3 rounded-md border border-border bg-card p-3.5 text-sm"
    >
      <h3 className="font-semibold">Stalled exercises</h3>
      <ul className="mt-1.5 space-y-2">
        {stalls.map((s) => (
          <li key={s.exercise}>
            <strong className="font-semibold">{s.exercise}</strong> missed its target {s.misses}{' '}
            sessions in a row ({kg(s.weight)} kg × {s.reps}).
            <span className="block text-muted-foreground">
              Suggestion: deload to {kg(s.deload_weight)} kg, or keep the weight and use a smaller
              step of {kg(s.smaller_step)} kg (now {kg(s.weight_step)} kg). Nothing changes unless
              you edit the routine or the step yourself.
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
