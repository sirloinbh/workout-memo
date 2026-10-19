// Automatic double progression (#28 rule change), used for the routine form
// preview. Mirrors backend/src/progress.ts without saved records: every week is
// assumed met. A backend test compares both implementations.
export type AutoExercise = {
  exercise: string;
  sets: number | string;
  weight: number | string;
  reps: number | string;
  rep_min?: number | string;
  rep_max?: number | string;
};
type PreviewPlan = {
  start_date: string;
  rest_days: number[];
  split_count: number;
  splits: { exercises: AutoExercise[] }[];
};
export type PreviewRow = {
  week: number;
  sets: number;
  weight: number;
  reps: number;
  kind: 'start' | 'reps' | 'weight' | 'hold' | 'deload';
  increment: number;
};

const round = (value: number) => Math.round(value * 100) / 100;
const to25 = (value: number) => Math.round(value / 2.5) * 2.5;
export const incrementFor = (weight: number) => Math.max(2.5, to25(weight * 0.05));
export const deloadWeight = (weight: number) => Math.max(0, to25(weight * 0.9));

// Weeks (1..12) in which each split has at least one scheduled session.
export function splitWeeks(plan: PreviewPlan) {
  const weeks: Set<number>[] = Array.from({ length: plan.split_count }, () => new Set());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.start_date) || plan.rest_days.length >= 7) return null;
  let count = 0;
  for (let offset = 0; offset < 84; offset++) {
    const day = new Date(plan.start_date + 'T00:00:00Z');
    if (Number.isNaN(+day)) return null;
    day.setUTCDate(day.getUTCDate() + offset);
    if (plan.rest_days.includes(day.getUTCDay())) continue;
    weeks[count++ % plan.split_count].add(Math.floor(offset / 7) + 1);
  }
  return weeks.map((w) => Array.from(w).sort((a, b) => a - b));
}

export function projectExercise(ex: AutoExercise, weeks: number[]): PreviewRow[] {
  const sets = Number(ex.sets);
  const min = Number(ex.rep_min);
  const max = Number(ex.rep_max);
  let level = { weight: Number(ex.weight), reps: Number(ex.reps) };
  let kind: PreviewRow['kind'] = 'start';
  let increment = 0;
  let previous: typeof level | null = null;
  const rows: PreviewRow[] = [];
  for (const week of weeks) {
    if (week % 4 === 0) {
      const ref = previous ?? level;
      rows.push({
        week,
        sets,
        weight: deloadWeight(ref.weight),
        reps: ref.reps,
        kind: 'deload',
        increment: 0,
      });
      continue;
    }
    rows.push({ week, sets, ...level, kind, increment });
    previous = level;
    if (level.reps + 1 <= max) {
      level = { ...level, reps: level.reps + 1 };
      kind = 'reps';
      increment = 0;
    } else if (level.weight === 0) {
      kind = 'hold';
      increment = 0;
    } else {
      increment = incrementFor(level.weight);
      level = { weight: Math.min(99999, round(level.weight + increment)), reps: min };
      kind = 'weight';
    }
  }
  return rows;
}

// One entry per split and exercise; null until the schedule fields are valid.
export function previewTargets(plan: PreviewPlan) {
  const weeks = splitWeeks(plan);
  if (!weeks) return null;
  return plan.splits.map((split, i) =>
    split.exercises.map((ex) => ({
      exercise: ex.exercise,
      rows: projectExercise(ex, weeks[i] ?? []),
    })),
  );
}

export const kindLabel = (row: PreviewRow) =>
  row.kind === 'start'
    ? '시작'
    : row.kind === 'reps'
      ? '반복 +1'
      : row.kind === 'weight'
        ? `증량 +${row.increment} kg`
        : row.kind === 'hold'
          ? '유지'
          : '디로딩';
