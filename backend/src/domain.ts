import { z } from 'zod/v4';

import { date, limitLength } from './contract.js';
// Input schemas shared with the frontend live in contract.ts (synced from shared/contract.ts).
export {
  allBodyParts,
  bodyMeasurementSchema,
  bodyParts,
  type CardioGoal,
  cardioGoalObject,
  cardioGoalSchema,
  type CardioKind,
  cardioKinds,
  cardioSessionObject,
  cardioSessionSchema,
  cardioSessionSchemaFor,
  checkCardioGoal,
  checkCardioSession,
  date,
  defaultWeightStep,
  type Feedback,
  feedbackLevels,
  goalSchema,
  legacyBodyParts,
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

// Same-exercise identity shared by goal judgment and exercise analysis: case and
// outer spaces are ignored. Evaluated by PostgreSQL so both use one collation.
export const exerciseKeySql = (column: string) => `lower(trim(${column}))`;

// #452: the routine schema and schedule live in shared/contract.ts.
export { type RoutinePlan, routineSchedule, routineSchema } from './contract.js';

export const dateRange = z
  .object({ from: date, to: date })
  .refine((value) => value.from <= value.to, 'The end date must be after the start date');
