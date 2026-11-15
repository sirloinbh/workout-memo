import { z } from 'zod/v4';

import { date, limitLength } from './contract.js';
// Input schemas shared with the frontend live in contract.ts (synced from shared/contract.ts).
export {
  type BodyMeasurementInput,
  bodyMeasurementSchema,
  type CardioGoal,
  cardioGoalObject,
  cardioGoalPeriods,
  cardioGoalSchema,
  cardioGoalTypes,
  type CardioKind,
  cardioKinds,
  cardioSessionObject,
  cardioSessionSchema,
  cardioSessionSchemaFor,
  cardioSources,
  checkCardioGoal,
  checkCardioSession,
  date,
  defaultWeightStep,
  type Feedback,
  feedbackLevels,
  goalSchema,
  limitLength,
  machineSchema,
  weightStepSchema,
  workoutSchema,
} from './contract.js';
export const officialWeightQuery = z
  .object({ brand: limitLength(z.string().trim(), { min: 1, max: 120 }).optional() })
  .strict();
// Weight always means the total moved load, including a machine's base weight.
// Not-completed (planned) sets are not actual performance.
export const volume = (sets: { weight: number; reps: number; completed?: boolean }[]) =>
  sets.reduce((sum, s) => (s.completed === false ? sum : sum + s.weight * s.reps), 0);

// Routine body parts (#27), also used by the exercise mapping (#32). #88 split 팔 into
// 이두·삼두 for new choices; 팔 stays valid so saved routines and mappings keep working.
export const bodyParts = [
  '가슴',
  '등',
  '어깨',
  '이두',
  '삼두',
  '하체-앞',
  '하체-뒤',
  '복근',
] as const;
export const legacyBodyParts = ['팔'] as const;
// Display and validation order, with the legacy part next to its successors.
export const allBodyParts = [
  '가슴',
  '등',
  '어깨',
  '팔',
  '이두',
  '삼두',
  '하체-앞',
  '하체-뒤',
  '복근',
] as const;
// Same-exercise identity shared by goal judgment and exercise analysis: case and
// outer spaces are ignored. Evaluated by PostgreSQL so both use one collation.
export const exerciseKeySql = (column: string) => `lower(trim(${column}))`;

export const routineSchema = z
  .object({
    name: limitLength(z.string().trim(), { min: 1, max: 120 }),
    // #28: 'auto' computes weekly targets (double progression). A missing value
    // is a saved #27 routine with manual weekly changes.
    progression: z.enum(['manual', 'auto']).optional(),
    start_date: date,
    split_count: z.number().int().min(1).max(5),
    weekly_workouts: z.number().int().min(1).max(7),
    rest_days: z.array(z.number().int().min(0).max(6)).max(6),
    // #88: 'cycle' repeats N training days then M rest days from the start date.
    // A missing mode is a saved weekday routine (rest_days are weekdays).
    schedule_mode: z.enum(['weekday', 'cycle']).optional(),
    cycle: z
      .object({
        train_days: z.number().int().min(1).max(7),
        rest_days: z.number().int().min(0).max(7),
      })
      .optional(),
    splits: z
      .array(
        z.object({
          name: limitLength(z.string().trim(), { min: 1, max: 120 }),
          body_parts: z
            .array(z.enum(allBodyParts))
            .min(1, 'Select at least 1 body part for each split')
            .max(100),
          exercises: z
            .array(
              z.object({
                exercise: limitLength(z.string().trim(), { min: 1, max: 120 }),
                // #82: optional machine copied into a new journal's sets. Older plans omit it.
                machine_id: z.number().int().positive().max(2147483647).nullable().optional(),
                sets: z.number().int().min(1).max(200),
                weight: z.number().min(0).max(99999),
                reps: z.number().int().min(1).max(1000),
                rep_min: z.number().int().min(1).max(1000).optional(),
                rep_max: z.number().int().min(1).max(1000).optional(),
              }),
            )
            .min(1)
            .max(100),
        }),
      )
      .min(1)
      .max(5),
    weeks: z
      .array(
        z.object({
          week: z.number().int().min(1).max(12),
          kind: z.enum(['increase_weight', 'increase_reps', 'deload']),
          amount: z.number().positive().max(99999),
          deload_metric: z.enum(['weight', 'sets', 'reps']).nullable(),
        }),
      )
      .length(12)
      .optional(),
  })
  .superRefine((plan, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (plan.splits.length !== plan.split_count) invalid('Check the number of splits');
    if (plan.schedule_mode === 'cycle') {
      if (!plan.cycle) invalid('Enter the number of workout days and rest days');
      if (plan.rest_days.length) invalid('Cycle mode does not take rest weekdays');
    } else if (plan.cycle) invalid('Weekday mode does not take a workout/rest cycle');
    else if (
      new Set(plan.rest_days).size !== plan.rest_days.length ||
      plan.rest_days.length + plan.weekly_workouts !== 7
    )
      invalid('Check the rest weekdays and workouts per week');
    if (plan.progression === 'auto') {
      if (plan.weeks) invalid('Auto-goal routines do not take weekly changes');
      for (const split of plan.splits)
        for (const e of split.exercises)
          if (e.rep_min === undefined || e.rep_max === undefined || e.rep_min > e.rep_max)
            invalid('Check the rep range (lower ≤ upper)');
      return;
    }
    if (!plan.weeks) {
      invalid('Enter goals for weeks 1 to 12');
      return;
    }
    if (new Set(plan.weeks.map((w) => w.week)).size !== 12)
      invalid('Enter each of weeks 1 to 12 once');
    for (const w of plan.weeks) {
      if ((w.week % 4 === 0) !== (w.kind === 'deload'))
        invalid('Weeks 4, 8, and 12 are deload weeks');
      if ((w.kind === 'deload') !== (w.deload_metric !== null))
        invalid('Check the deload decrease target');
      if (
        (w.kind === 'increase_reps' || (w.kind === 'deload' && w.deload_metric !== 'weight')) &&
        (!Number.isInteger(w.amount) || w.amount > (w.deload_metric === 'sets' ? 200 : 1000))
      )
        invalid('Reps and set changes must be whole numbers within the allowed range');
    }
  });
export type RoutinePlan = z.infer<typeof routineSchema>;
// Weekday routines rest on the chosen weekdays; cycle routines (#88) rest on the last
// M days of every N + M day cycle counted from the start date.
function isRestDay(plan: RoutinePlan, offset: number, weekday: number) {
  if (plan.schedule_mode === 'cycle' && plan.cycle)
    return offset % (plan.cycle.train_days + plan.cycle.rest_days) >= plan.cycle.train_days;
  return plan.rest_days.includes(weekday);
}
export function routineSchedule(plan: RoutinePlan) {
  const schedule: { date: string; week: number; split_index: number; is_deload: boolean }[] = [];
  for (let offset = 0; offset < 84; offset++) {
    const day = new Date(plan.start_date + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + offset);
    if (isRestDay(plan, offset, day.getUTCDay())) continue;
    const week = Math.floor(offset / 7) + 1;
    schedule.push({
      date: day.toISOString().slice(0, 10),
      week,
      split_index: schedule.length % plan.split_count,
      is_deload: week % 4 === 0,
    });
  }
  return schedule;
}

export const dateRange = z
  .object({ from: date, to: date })
  .refine((value) => value.from <= value.to, 'The end date must be after the start date');
