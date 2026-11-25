// #477: sets of the log that was just saved that beat the earlier best estimated 1RM of their exercise.
export type NewRecord = {
  position: number;
  exercise: string;
  weight: number;
  reps: number;
  estimated_1rm: number;
  previous_best: number;
};

export function NewRecords({ records }: { records: NewRecord[] }) {
  if (!records.length) return null;
  return (
    <section
      aria-label="New records"
      className="mb-5 rounded-lg border border-border bg-card p-4 text-sm"
    >
      <ul className="grid gap-1.5">
        {records.map((r) => (
          <li key={r.position} className="flex flex-wrap items-center gap-x-2">
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              New record
            </span>
            <span className="font-medium">{r.exercise}</span>
            <span>
              {r.weight} kg × {r.reps}
            </span>
            <span className="text-muted-foreground">
              est. 1RM {r.estimated_1rm} kg (was {r.previous_best} kg)
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
