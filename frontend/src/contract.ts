// Shared input contract (#64). Source of truth: shared/contract.ts. The copies in
// backend/src/contract.ts and frontend/src/contract.ts are written by
// `npm run contract:sync`; `npm run check` fails when they differ. Edit only the source.
// The server validates with these schemas (400 with the same messages) and the
// screens validate with them before sending, so both report the same rules.
import { z } from 'zod/v4';

// A missing value gets the app's own message; any other wrong type keeps zod's own message.
const whenMissing = (message: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? message : undefined),
});
// zod 4 rejects ±Infinity (JSON `1e999`) as a wrong type before any range check runs, so a
// number schema answers it here with the message the range check would have given.
const numberError = (notNumber: string, tooBig: string, tooSmall = tooBig) => ({
  error: (issue: { input?: unknown }) => {
    if (issue.input === undefined) return undefined;
    if (issue.input === Infinity) return tooBig;
    return issue.input === -Infinity ? tooSmall : notNumber;
  },
});

// zod 4 runs .min()/.max() on any input with a .length, even after the type check failed, so
// `title: []` would also report the length rule. A refinement runs only on a real string; the
// meta keeps the limits for docs/openapi.json. The default messages are zod 3's wording.
type Limits = { min?: number; max: number; tooShort?: string; tooLong?: string };
export const limitLength = (schema: z.ZodString, { min, max, tooShort, tooLong }: Limits) => {
  const atMost = schema.refine(
    (v) => v.length <= max,
    tooLong ?? `String must contain at most ${max} character(s)`,
  );
  if (min === undefined) return atMost.meta({ maxLength: max });
  return atMost
    .refine((v) => v.length >= min, tooShort ?? `String must contain at least ${min} character(s)`)
    .meta({ minLength: min, maxLength: max });
};

export const date = z
  .string(whenMissing('Enter a date'))
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, 'Enter a valid date');

// Labels are noun phrases with their article ("an exercise name"), so "Enter ${label}" reads well.
const text = (label: string, max: number) =>
  limitLength(z.string(whenMissing(`Enter ${label}`)).trim(), {
    min: 1,
    max,
    tooShort: `Enter ${label}`,
    tooLong: `Enter ${label} of ${max} characters or fewer`,
  });
const memo = (max: number) =>
  limitLength(z.string(), { max, tooLong: `Enter a memo of ${max} characters or fewer` });
// Weight always means the total moved load in kg, including a machine's base weight.
const kg = (label: string) =>
  z
    .number(numberError(`Enter ${label} as a number`, `Enter ${label} from 0 to 99999 kg`))
    .min(0, `Enter ${label} from 0 to 99999 kg`)
    .max(99999, `Enter ${label} from 0 to 99999 kg`);
const reps = (label: string) =>
  z
    .number(
      numberError(`Enter ${label} as a number`, `Enter ${label} as a whole number from 1 to 1000`),
    )
    .int(`Enter ${label} as a whole number from 1 to 1000`)
    .min(1, `Enter ${label} as a whole number from 1 to 1000`)
    .max(1000, `Enter ${label} as a whole number from 1 to 1000`);
const rpeMessage = 'RPE must be entered in 0.5 steps from 1 to 10';

export const feedbackLevels = ['hard', 'medium', 'easy'] as const;
export type Feedback = (typeof feedbackLevels)[number];

export const workoutSchema = z.object({
  version: z.number().int().positive().optional(),
  date,
  title: text('a journal title', 120),
  notes: memo(4000).default(''),
  // #83: how the whole workout felt. Missing stays NULL and is never a default level.
  feedback: z
    .enum(feedbackLevels, { error: 'Choose effort feedback: hard, medium, or easy' })
    .nullable()
    .default(null),
  sets: z
    .array(
      z.object({
        exercise: text('an exercise name', 120),
        machine_id: z.number().int().positive().nullable().default(null),
        weight: kg('a total weight'),
        reps: reps('reps'),
        notes: memo(4000).default(''),
        // Older clients only sent performed sets, so a missing state means completed.
        completed: z.boolean().default(true),
        // Optional effort rating; a missing value stays NULL and never becomes 0.
        rpe: z
          .number(numberError(rpeMessage, rpeMessage))
          .min(1, rpeMessage)
          .max(10, rpeMessage)
          .refine((v) => Number.isInteger(v * 2), rpeMessage)
          .nullable()
          .default(null),
      }),
    )
    .min(1, 'Enter at least 1 set')
    .max(200, 'Enter at most 200 sets'),
});
export type WorkoutInput = z.input<typeof workoutSchema>;

export const machineSchema = z.object({
  brand_id: z.number({ error: 'Choose a brand' }).int('Choose a brand').positive('Choose a brand'),
  name: text('a machine name', 120),
  // Unknown base weight stays null; a confirmed 0 kg is a different value.
  base_weight: kg('a base weight').nullable(),
  notes: memo(2000).default(''),
  // A link to a manufacturer reference row; it never sets or changes base_weight.
  // Omitted keeps the stored link on update (none on create); explicit null unlinks.
  official_weight_id: z.number().int().positive().max(2147483647).nullable().optional(),
  // #84: single-joint machines use the single-joint rest. Omitted keeps the stored value
  // on update (false on create), so older clients do not clear it.
  single_joint: z.boolean({ error: 'Check whether it is single-joint' }).optional(),
});

export const goalSchema = z
  .object({
    exercise: text('an exercise name', 120),
    target_weight: kg('the goal total weight'),
    target_reps: reps('the goal reps'),
    start_date: date,
    deadline: date,
  })
  .refine((v) => v.deadline >= v.start_date, {
    error: 'The end date must be the same as or after the start date',
    path: ['deadline'],
  });
export type GoalInput = z.input<typeof goalSchema>;

// Body metrics are stored as NUMERIC(5,2). Values with more than two decimals are
// rejected instead of silently rounded, so the stored value is exactly what was entered.
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const metric = (label: string, min: number, max: number, minInclusive: boolean) =>
  z
    .number(
      numberError(`Enter ${label.toLowerCase()} as a number`, `${label} must be a finite number`),
    )
    .refine(
      (v) => (minInclusive ? v >= min : v > min) && v <= max,
      `Check the ${label.toLowerCase()} range`,
    )
    .refine(twoDecimals, `Enter ${label.toLowerCase()} with at most 2 decimal places`)
    .nullable()
    .default(null);
export const bodyMeasurementSchema = z
  .object({
    date,
    body_weight_kg: metric('Weight', 0, 999.99, false),
    body_fat_percent: metric('Body fat', 0, 100, true),
    skeletal_muscle_kg: metric('Skeletal muscle mass', 0, 999.99, false),
  })
  .refine(
    (v) =>
      v.body_weight_kg !== null || v.body_fat_percent !== null || v.skeletal_muscle_kg !== null,
    'Enter at least one of weight, body fat, or skeletal muscle mass',
  );
export type BodyMeasurementInput = z.infer<typeof bodyMeasurementSchema>;

// #86: progressive overload adds this much total kg per exercise. A missing setting is
// the default; null in a request resets the exercise back to the default.
export const defaultWeightStep = 5;
export const weightStepSchema = z.object({
  exercise: text('an exercise name', 120),
  weight_step: z
    .number(
      numberError(
        'Enter the increase step as a number',
        'Enter an increase step of 100 kg or less',
        'The increase step must be greater than 0',
      ),
    )
    .positive('The increase step must be greater than 0')
    .max(100, 'Enter an increase step of 100 kg or less')
    .refine(twoDecimals, 'Enter an increase step with at most 2 decimal places')
    .nullable(),
});
export type WeightStepInput = z.infer<typeof weightStepSchema>;

// #114: cardio sessions. Labels: Running, Walking, Outdoor cycling, Indoor cycling, Rowing, Stairs, Elliptical, Swimming, Other.
export const cardioKinds = [
  'running',
  'walking',
  'outdoor_cycling',
  'indoor_cycling',
  'rowing',
  'stairs',
  'elliptical',
  'swimming',
  'other',
] as const;
export type CardioKind = (typeof cardioKinds)[number];
// Where a session came from. Only imported sessions carry an external id.
export const cardioSources = ['manual', 'garmin', 'nike', 'file'] as const;
export type CardioSource = (typeof cardioSources)[number];

// An optional whole number in [min, max]; missing stays null and never becomes 0.
const optionalInt = (label: string, min: number, max: number, unit: string) => {
  const message = `Enter ${label} as a whole number from ${min} to ${max}${unit}`;
  return z
    .number(numberError(`Enter ${label} as a number`, message))
    .int(message)
    .min(min, message)
    .max(max, message)
    .nullable()
    .default(null);
};
const durationMessage =
  'Enter a workout time as a whole number of seconds from 1 to 86400 (24 hours)';
const distanceMessage = 'Enter a distance greater than 0 km and at most 1000 km';
// NUMERIC(8,3): 1 m precision. More decimals are rejected instead of silently rounded.
const threeDecimals = (v: number) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

// Field rules without the cross-field checks, so the backup format can add its own fields.
export const cardioSessionObject = z.object({
  date,
  // Local start time in Asia/Seoul. Missing is null (not recorded).
  start_time: z
    .string({ error: 'Enter the start time as HH:MM' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter the start time as HH:MM from 00:00 to 23:59')
    .nullable()
    .default(null),
  kind: z.enum(cardioKinds, {
    error:
      'Choose a type: running, walking, outdoor cycling, indoor cycling, rowing, stairs, elliptical, swimming, or other',
  }),
  // Whole seconds; pace and speed are computed from this and distance, never stored.
  duration_sec: z
    .number({
      error: (issue: { input?: unknown }) =>
        issue.input === undefined
          ? 'Enter a workout time'
          : numberError('Enter the workout time as a number', durationMessage).error(issue),
    })
    .int(durationMessage)
    .min(1, durationMessage)
    .max(86400, durationMessage),
  distance_km: z
    .number(numberError('Enter the distance as a number', distanceMessage))
    .positive(distanceMessage)
    .max(1000, distanceMessage)
    .refine(threeDecimals, 'Enter a distance with at most 3 decimal places (1 m)')
    .nullable()
    .default(null),
  avg_heart_rate: optionalInt('an average heart rate', 30, 250, ' bpm'),
  max_heart_rate: optionalInt('a max heart rate', 30, 250, ' bpm'),
  calories_kcal: optionalInt('calories', 0, 20000, ' kcal'),
  elevation_gain_m: optionalInt('elevation gain', 0, 10000, ' m'),
  avg_cadence: optionalInt('cadence', 1, 300, ''),
  // #83 levels reused for perceived effort.
  effort: z
    .enum(feedbackLevels, { error: 'Choose perceived effort: hard, medium, or easy' })
    .nullable()
    .default(null),
  // Optional link to a strength workout of the app.
  workout_id: z
    .number({ error: 'Choose the strength journal to link again' })
    .int('Choose the strength journal to link again')
    .positive('Choose the strength journal to link again')
    .max(2147483647, 'Choose the strength journal to link again')
    .nullable()
    .default(null),
  source: z
    .enum(cardioSources, { error: 'The source must be one of manual, garmin, nike, or file' })
    .default('manual'),
  external_id: limitLength(z.string({ error: 'The external ID must be a string' }).trim(), {
    min: 1,
    max: 200,
    tooShort: 'Enter an external ID or send null',
    tooLong: 'Enter an external ID of 200 characters or fewer',
  })
    .nullable()
    .default(null),
  memo: memo(2000).default(''),
});
type CardioFields = Pick<
  z.output<typeof cardioSessionObject>,
  'avg_heart_rate' | 'max_heart_rate' | 'source' | 'external_id'
>;
// Cross-field rules shared by the API and the backup format.
export function checkCardioSession(
  v: CardioFields,
  ctx: { addIssue: (issue: { code: 'custom'; message: string; path: string[] }) => void },
) {
  if (v.avg_heart_rate !== null && v.max_heart_rate !== null && v.max_heart_rate < v.avg_heart_rate)
    ctx.addIssue({
      code: 'custom',
      message: 'Max heart rate cannot be lower than average heart rate',
      path: ['max_heart_rate'],
    });
  if (v.source === 'manual' && v.external_id !== null)
    ctx.addIssue({
      code: 'custom',
      message: 'Do not set an external ID for a manually entered record (manual)',
      path: ['external_id'],
    });
}
export const cardioSessionSchema = cardioSessionObject.superRefine(checkCardioSession);
export type CardioSessionInput = z.input<typeof cardioSessionSchema>;
// Unlike strength workouts (planned sessions may be in the future), a cardio session is a
// performed activity: its date may not be after today in Asia/Seoul. `today` is injected so
// the server (createApp's today) and tests use the same rule.
export const cardioSessionSchemaFor = (today: string) =>
  cardioSessionSchema.refine((v) => v.date <= today, {
    error: 'The cardio record date cannot be after today',
    path: ['date'],
  });
// #116: cardio goals (2026-11-08 user decisions). Period totals repeat every week (Mon~Sun,
// Seoul) or calendar month between start_date and deadline; records are judged on single
// sessions of one kind. Each goal type carries exactly its own targets; the rest stay null.
export const cardioGoalTypes = [
  'distance',
  'duration',
  'count',
  'record_time',
  'longest_distance',
] as const;
export type CardioGoalType = (typeof cardioGoalTypes)[number];
export const cardioGoalPeriods = ['week', 'month'] as const;
export type CardioGoalPeriod = (typeof cardioGoalPeriods)[number];
const goalDistanceMessage = 'Enter a goal distance greater than 0 km and at most 10000 km';
const goalDurationMessage =
  'Enter the goal time as a whole number of seconds from 1 second to 744 hours (31 days)';
const goalCountMessage = 'Enter a goal session count as a whole number from 1 to 1000';
const goalMaxDays = 1826;
const goalTargets = {
  distance: ['target_distance_km'],
  duration: ['target_duration_sec'],
  count: ['target_count'],
  record_time: ['target_distance_km', 'target_duration_sec'],
  longest_distance: ['target_distance_km'],
} as const satisfies Record<CardioGoalType, readonly string[]>;
const goalTargetLabels = {
  target_distance_km: 'the goal distance',
  target_duration_sec: 'the goal time',
  target_count: 'the goal session count',
} as const;
// Field rules without the cross-field checks, so the backup format can add its id (#253).
export const cardioGoalObject = z.object({
  goal_type: z.enum(cardioGoalTypes, {
    error: 'Choose a goal type: distance, time, count, record time, or longest distance',
  }),
  kind: z
    .enum(cardioKinds, {
      error:
        'Choose a workout type: running, walking, outdoor cycling, indoor cycling, rowing, stairs, elliptical, swimming, or other',
    })
    .nullable()
    .default(null),
  period: z
    .enum(cardioGoalPeriods, { error: 'Choose weekly or monthly for the period unit' })
    .nullable()
    .default(null),
  target_distance_km: z
    .number(numberError('Enter the goal distance as a number', goalDistanceMessage))
    .positive(goalDistanceMessage)
    .max(10000, goalDistanceMessage)
    .refine(threeDecimals, 'Enter a goal distance with at most 3 decimal places (1 m)')
    .nullable()
    .default(null),
  target_duration_sec: z
    .number(numberError('Enter the goal time as a number', goalDurationMessage))
    .int(goalDurationMessage)
    .min(1, goalDurationMessage)
    .max(2678400, goalDurationMessage)
    .nullable()
    .default(null),
  target_count: z
    .number(numberError('Enter the goal session count as a number', goalCountMessage))
    .int(goalCountMessage)
    .min(1, goalCountMessage)
    .max(1000, goalCountMessage)
    .nullable()
    .default(null),
  start_date: date,
  deadline: date,
});
// Cross-field rules shared by the API and the backup format.
export function checkCardioGoal(
  v: z.output<typeof cardioGoalObject>,
  ctx: { addIssue: (issue: { code: 'custom'; message: string; path: string[] }) => void },
) {
  if (v.deadline < v.start_date)
    ctx.addIssue({
      code: 'custom',
      message: 'The end date must be the same as or after the start date',
      path: ['deadline'],
    });
  // Period goals list every week or month of the goal, so the span is capped at five years.
  else if (Date.parse(v.deadline) - Date.parse(v.start_date) > goalMaxDays * 86400000)
    ctx.addIssue({
      code: 'custom',
      message: 'Keep the goal period to 5 years (1826 days) or less',
      path: ['deadline'],
    });
  const record = v.goal_type === 'record_time' || v.goal_type === 'longest_distance';
  if (record && v.kind === null)
    ctx.addIssue({
      code: 'custom',
      message: 'Choose one exercise type for a record goal',
      path: ['kind'],
    });
  if (!record && v.period === null)
    ctx.addIssue({
      code: 'custom',
      message: 'Choose weekly or monthly for a cumulative goal period unit',
      path: ['period'],
    });
  if (record && v.period !== null)
    ctx.addIssue({
      code: 'custom',
      message: 'Record goals do not take a period unit',
      path: ['period'],
    });
  const wanted: readonly string[] = goalTargets[v.goal_type];
  for (const [field, label] of Object.entries(goalTargetLabels)) {
    const value = v[field as keyof typeof goalTargetLabels];
    if (wanted.includes(field) && value === null)
      ctx.addIssue({ code: 'custom', message: `Enter ${label}`, path: [field] });
    if (!wanted.includes(field) && value !== null)
      ctx.addIssue({
        code: 'custom',
        message: `Do not set ${label} for this goal type`,
        path: [field],
      });
  }
}
export const cardioGoalSchema = cardioGoalObject.superRefine(checkCardioGoal);
export type CardioGoalInput = z.input<typeof cardioGoalSchema>;
export type CardioGoal = z.output<typeof cardioGoalSchema>;

// Issues keyed by their dotted path (e.g. "sets.0.weight") for per-field messages.
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}
