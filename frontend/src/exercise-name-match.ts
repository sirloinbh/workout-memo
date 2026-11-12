import { loose } from './components/combobox-filter';

// #124: exercise name candidates from GET /api/exercise-names (recent, then frequent).
export type ExerciseName = { name: string; uses: number; last_used: string | null };

// Server candidates first, then names only this screen knows yet (today's routine, machines).
export function candidateNames(server: readonly ExerciseName[], local: readonly string[]) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...server.map((n) => n.name), ...local]) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  return names;
}

// An existing name that differs from the typed one only in spaces or letter case, e.g.
// "Bench Press" for "Benchpress". An exact match is not a suggestion.
export function similarName(value: string, names: readonly string[]) {
  const typed = value.trim();
  if (!typed || names.includes(typed)) return null;
  return names.find((name) => loose(name) === loose(typed)) ?? null;
}
