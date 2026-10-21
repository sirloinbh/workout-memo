import { defaultWeightStep } from './contract';

// Automatic double progression (#28 rule change), used for the routine form
// preview. Mirrors backend/src/progress.ts without saved records: every session
// is assumed met. Targets advance once per session (workout day) of the
// exercise's split; sessions in weeks 4/8/12 are deloads. A backend test
// compares both implementations.
export type AutoExercise = {
  exercise: string;
  sets: number | string;
  weight: number | string;
  reps: number | string;
  rep_min?: number | string;
  rep_max?: number | string;
  // #86: the exercise's increment from the user's settings; missing means 5 kg.
  weight_step?: number;
};
type PreviewPlan = {
  start_date: string;
  rest_days: number[];
  split_count: number;
  splits: { exercises: AutoExercise[] }[];
};
export type PreviewRow = {
  week: number;
  session: number;
  sets: number;
  weight: number;
  reps: number;
  kind: 'start' | 'reps' | 'weight' | 'hold' | 'deload';
  increment: number;
};

const round = (value: number) => Math.round(value * 100) / 100;
const to25 = (value: number) => Math.round(value / 2.5) * 2.5;
export const deloadWeight = (weight: number) => Math.max(0, to25(weight * 0.9));

export type Session = { week: number; session: number };
// Sessions of each split in plan order; `session` is the n-th training day of its week.
export function splitSessions(plan: PreviewPlan) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.start_date) || plan.rest_days.length >= 7) return null;
  const sessions: Session[][] = Array.from({ length: plan.split_count }, () => []);
  const perWeek: Record<number, number> = {};
  let count = 0;
  for (let offset = 0; offset < 84; offset++) {
    const day = new Date(plan.start_date + 'T00:00:00Z');
    if (Number.isNaN(+day)) return null;
    day.setUTCDate(day.getUTCDate() + offset);
    if (plan.rest_days.includes(day.getUTCDay())) continue;
    const week = Math.floor(offset / 7) + 1;
    perWeek[week] = (perWeek[week] ?? 0) + 1;
    sessions[count++ % plan.split_count].push({ week, session: perWeek[week] });
  }
  return sessions;
}

export function projectExercise(ex: AutoExercise, sessions: Session[]): PreviewRow[] {
  const sets = Number(ex.sets);
  const min = Number(ex.rep_min);
  const max = Number(ex.rep_max);
  let level = { weight: Number(ex.weight), reps: Number(ex.reps) };
  let kind: PreviewRow['kind'] = 'start';
  let increment = 0;
  let previous: typeof level | null = null;
  const rows: PreviewRow[] = [];
  for (const { week, session } of sessions) {
    if (week % 4 === 0) {
      const ref = previous ?? level;
      rows.push({
        week,
        session,
        sets,
        weight: deloadWeight(ref.weight),
        reps: ref.reps,
        kind: 'deload',
        increment: 0,
      });
      continue;
    }
    rows.push({ week, session, sets, ...level, kind, increment });
    previous = level;
    if (level.reps + 1 <= max) {
      level = { ...level, reps: level.reps + 1 };
      kind = 'reps';
      increment = 0;
    } else if (level.weight === 0) {
      kind = 'hold';
      increment = 0;
    } else {
      increment = ex.weight_step ?? defaultWeightStep;
      level = { weight: Math.min(99999, round(level.weight + increment)), reps: min };
      kind = 'weight';
    }
  }
  return rows;
}

// One entry per split and exercise; null until the schedule fields are valid.
export function previewTargets(plan: PreviewPlan) {
  const sessions = splitSessions(plan);
  if (!sessions) return null;
  return plan.splits.map((split, i) =>
    split.exercises.map((ex) => ({
      exercise: ex.exercise,
      rows: projectExercise(ex, sessions[i] ?? []),
    })),
  );
}

// Rows grouped by week for display.
export function byWeek(rows: PreviewRow[]) {
  const weeks: { week: number; rows: PreviewRow[] }[] = [];
  for (const row of rows) {
    const last = weeks[weeks.length - 1];
    if (last && last.week === row.week) last.rows.push(row);
    else weeks.push({ week: row.week, rows: [row] });
  }
  return weeks;
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
