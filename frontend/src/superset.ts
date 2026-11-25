// #481: a superset is two or more exercises of one workout log that are done in turns.
// The rest timer waits until the last exercise of a round is done.
export type SupersetSet = { exercise: string; superset?: number | null };

const nameOf = (s: SupersetSet) => s.exercise.trim().toLowerCase();

/** The exercises of a group in the order they first appear in the log. */
export function groupExercises(sets: readonly SupersetSet[], group: number): string[] {
  return [...new Set(sets.filter((s) => s.superset === group).map(nameOf))];
}

/**
 * Whether completing `sets[index]` should start the rest timer. A set outside a superset
 * always does. In a superset only the last exercise of the group does, so the rest comes
 * once per round. A group that does not have two exercises yet behaves like no group.
 */
export function startsRest(sets: readonly SupersetSet[], index: number): boolean {
  const set = sets[index];
  if (!set || set.superset == null) return true;
  const exercises = groupExercises(sets, set.superset);
  if (exercises.length < 2) return true;
  return exercises[exercises.length - 1] === nameOf(set);
}

/** The group numbers the picker offers: every group in use plus the next free one. */
export function groupChoices(sets: readonly SupersetSet[], max = 20): number[] {
  const used = sets.flatMap((s) => (s.superset == null ? [] : [s.superset]));
  const top = Math.min(max, Math.max(0, ...used) + 1);
  return Array.from({ length: top }, (_, i) => i + 1);
}
