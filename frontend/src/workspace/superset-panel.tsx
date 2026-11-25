import { groupChoices, groupExercises, type SupersetSet } from '../superset';

/** #481: put this set's exercise in a superset group with other exercises of the same log. */
export function SupersetPanel({
  id,
  index,
  sets,
  onChange,
}: {
  id: string;
  index: number;
  sets: readonly SupersetSet[];
  onChange: (superset: number | null) => void;
}) {
  const current = sets[index].superset ?? null;
  const exercises = current === null ? [] : groupExercises(sets, current);
  return (
    <div data-slot="superset-panel" id={id} className="grid gap-2 text-meta md:col-span-2">
      <label htmlFor={`${id}-group`} className="grid gap-1">
        Superset group
        <select
          id={`${id}-group`}
          className="h-9 px-2 py-0 text-body-sm pointer-coarse:text-base"
          value={current ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Not in a superset</option>
          {groupChoices(sets).map((g) => (
            <option key={g} value={g}>
              Superset {g}
            </option>
          ))}
        </select>
      </label>
      {current !== null && (
        <p className="m-0">
          {exercises.length < 2
            ? 'Give another exercise the same group; a superset needs at least two different exercises.'
            : `In this superset: ${exercises.join(' → ')}. The rest timer starts after the last exercise of each round.`}
        </p>
      )}
      <p className="m-0 text-muted-foreground">
        Sets with the same group are one superset. The group applies to this workout only.
      </p>
    </div>
  );
}
