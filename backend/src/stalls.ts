import { defaultWeightStep, exerciseKey } from './contract.js';

/** #478 (user decision, 2026-11-25): this many misses in a row suggest a deload or a smaller step. */
export const stallMisses = 3;

export type Stall = {
  exercise: string;
  /** Consecutive missed sessions, counted back from the latest judged one (a hit resets it). */
  misses: number;
  /** The target weight the latest missed session asked for. */
  weight: number;
  reps: number;
  weight_step: number;
  /** 10% below the missed weight, rounded to the weight step and always below the missed weight. */
  deload_weight: number;
  /** Half the current step, as the alternative to a deload. */
  smaller_step: number;
};

type JudgedTarget = {
  order: number;
  is_deload: boolean;
  exercises: {
    exercise: string;
    weight: number;
    reps: number;
    result?: 'achieved' | 'missed' | null;
  }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 10% off, rounded to the nearest multiple of the step; a result that did not go down drops one step. */
export function deloadSuggestion(weight: number, step: number) {
  const rounded = Math.round((weight * 0.9) / step) * step;
  return Math.max(0, round2(rounded < weight ? rounded : weight - step));
}

/**
 * Detects exercises of an auto routine that missed their target several sessions in a row. Only judged sessions count:
 * a deload session and a session whose window is still open (no result) neither add to the run nor break it.
 * `entries` are the routine's dated targets; `steps` maps an exercise key to its weight step.
 */
export function findStalls(
  entries: readonly { date: string | null; excluded: boolean; target: JudgedTarget }[],
  steps: Readonly<Record<string, number>>,
): Stall[] {
  const targets = entries
    .filter((e) => e.date && !e.excluded && !e.target.is_deload)
    .map((e) => e.target)
    .sort((a, b) => a.order - b.order);
  const runs = new Map<string, { name: string; misses: number; weight: number; reps: number }>();
  for (const target of targets)
    for (const ex of target.exercises) {
      if (ex.result !== 'achieved' && ex.result !== 'missed') continue;
      const key = exerciseKey(ex.exercise);
      const run = runs.get(key) ?? {
        name: ex.exercise,
        misses: 0,
        weight: ex.weight,
        reps: ex.reps,
      };
      if (ex.result === 'achieved') run.misses = 0;
      else
        Object.assign(run, {
          name: ex.exercise,
          misses: run.misses + 1,
          weight: ex.weight,
          reps: ex.reps,
        });
      runs.set(key, run);
    }
  return [...runs.entries()]
    .filter(([, run]) => run.misses >= stallMisses)
    .map(([key, run]) => {
      const step = steps[key] ?? defaultWeightStep;
      return {
        exercise: run.name,
        misses: run.misses,
        weight: run.weight,
        reps: run.reps,
        weight_step: step,
        deload_weight: deloadSuggestion(run.weight, step),
        smaller_step: round2(step / 2),
      };
    });
}
