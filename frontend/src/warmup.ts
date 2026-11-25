// #480: warm-up sets suggested from the working weight. They are a suggestion only: nothing
// is saved, so they never reach volume, goals or records (user decision, 2026-11-25).
export const warmupSteps = [
  { percent: 40, reps: 8 },
  { percent: 60, reps: 5 },
  { percent: 80, reps: 3 },
] as const;

export type WarmupSet = { percent: number; reps: number; weight: number };

/**
 * 40% x 8, 60% x 5, 80% x 3 of the working weight, each rounded to the weight step.
 * A step that rounds to 0, to the working weight or above, or to the same weight as the
 * step before it is left out, so light weights get fewer sets instead of duplicates.
 */
export function suggestWarmups(working: number, step: number): WarmupSet[] {
  if (!Number.isFinite(working) || working <= 0 || !(step > 0)) return [];
  const out: WarmupSet[] = [];
  for (const { percent, reps } of warmupSteps) {
    const rounded = Math.round((working * percent) / 100 / step) * step;
    if (rounded <= 0 || rounded >= working || out.at(-1)?.weight === rounded) continue;
    out.push({ percent, reps, weight: rounded });
  }
  return out;
}
