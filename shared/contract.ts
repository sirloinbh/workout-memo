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
// Decimal columns are NUMERIC(n,2). Values with more than two decimals are rejected instead of
// silently rounded, so the stored value is exactly what was entered.
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
// Integer ids and versions are Postgres integer columns, so larger values would be a 500.
const maxId = 2147483647;
// Weight always means the total moved load in kg, including a machine's base weight.
const kg = (label: string) =>
  z
    .number(numberError(`Enter ${label} as a number`, `Enter ${label} from 0 to 99999 kg`))
    .min(0, `Enter ${label} from 0 to 99999 kg`)
    .max(99999, `Enter ${label} from 0 to 99999 kg`)
    .refine(twoDecimals, `Enter ${label} with at most 2 decimal places`);
const reps = (label: string) =>
  z
    .number(
      numberError(`Enter ${label} as a number`, `Enter ${label} as a whole number from 1 to 1000`),
    )
    .int(`Enter ${label} as a whole number from 1 to 1000`)
    .min(1, `Enter ${label} as a whole number from 1 to 1000`)
    .max(1000, `Enter ${label} as a whole number from 1 to 1000`);
export const maxSupersetGroup = 20;
const supersetMessage = `The superset group must be a whole number from 1 to ${maxSupersetGroup}`;
/** #481: a superset pairs at least two different exercises; one exercise alone is not a superset. */
function checkSupersets(
  sets: { exercise: string; superset?: number | null }[],
  ctx: z.RefinementCtx,
) {
  const names = new Map<number, Set<string>>();
  for (const s of sets)
    if (s.superset != null)
      names.set(
        s.superset,
        (names.get(s.superset) ?? new Set()).add(s.exercise.trim().toLowerCase()),
      );
  sets.forEach((s, i) => {
    if (s.superset != null && (names.get(s.superset)?.size ?? 0) < 2)
      ctx.addIssue({
        code: 'custom',
        path: [i, 'superset'],
        message: `Superset ${s.superset} needs at least two different exercises`,
      });
  });
}
const rpeMessage = 'RPE must be entered in 0.5 steps from 1 to 10';

export const feedbackLevels = ['hard', 'medium', 'easy'] as const;
export type Feedback = (typeof feedbackLevels)[number];

export const workoutSchema = z.object({
  version: z.number().int().positive().max(maxId).optional(),
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
        machine_id: z.number().int().positive().max(maxId).nullable().default(null),
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
        // #481: sets that share a number are one superset (1 to 20, NULL = none).
        superset: z
          .number(numberError(supersetMessage, supersetMessage))
          .int(supersetMessage)
          .min(1, supersetMessage)
          .max(maxSupersetGroup, supersetMessage)
          .nullable()
          .default(null),
      }),
    )
    .min(1, 'Enter at least 1 set')
    .max(200, 'Enter at most 200 sets')
    .superRefine(checkSupersets),
});
export type WorkoutInput = z.input<typeof workoutSchema>;

export const machineSchema = z.object({
  brand_id: z
    .number({ error: 'Choose a brand' })
    .int('Choose a brand')
    .positive('Choose a brand')
    .max(maxId, 'Choose a brand'),
  name: text('a machine name', 120),
  // Unknown base weight stays null; a confirmed 0 kg is a different value.
  base_weight: kg('a base weight').nullable(),
  notes: memo(2000).default(''),
  // A link to a manufacturer reference row; it never sets or changes base_weight.
  // Omitted keeps the stored link on update (none on create); explicit null unlinks.
  official_weight_id: z.number().int().positive().max(maxId).nullable().optional(),
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

// Body metrics are stored as NUMERIC(5,2) and use twoDecimals (defined above).
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

// #377: automatic double progression, written once for the server and the routine form preview.
const roundKg = (value: number) => Math.round(value * 100) / 100;
const to25 = (value: number) => Math.round(value / 2.5) * 2.5;
export const deloadWeight = (weight: number) => Math.max(0, to25(weight * 0.9));
export type ProgressionLevel = { weight: number; reps: number };
export type ProgressionKind = 'start' | 'reps' | 'weight' | 'hold' | 'deload';
// #86: weight_step is the exercise's increment, attached by the caller from the user's
// per-exercise settings (never stored in the plan). Missing means the 5 kg default.
export function progressionStep(
  level: ProgressionLevel,
  ex: { rep_min?: number; rep_max?: number; weight_step?: number },
) {
  const max = ex.rep_max ?? 12;
  if (level.reps + 1 <= max)
    return { level: { ...level, reps: level.reps + 1 }, kind: 'reps' as const };
  // Bodyweight (0 kg) exercises only add reps; at the maximum they hold.
  if (level.weight === 0) return { level, kind: 'hold' as const };
  return {
    level: {
      weight: Math.min(
        99999,
        Math.max(0, roundKg(level.weight + (ex.weight_step ?? defaultWeightStep))),
      ),
      reps: ex.rep_min ?? 8,
    },
    kind: 'weight' as const,
  };
}

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

// How a manual routine week changes the base targets, and what a deload week lowers.
export const changeKinds = ['increase_weight', 'increase_reps', 'deload'] as const;
export type ChangeKind = (typeof changeKinds)[number];
export const deloadMetrics = ['weight', 'sets', 'reps'] as const;
export type DeloadMetric = (typeof deloadMetrics)[number];
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
    .max(maxId, 'Choose the strength journal to link again')
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

// #117: cardio items on a routine split (2026-11-16 user decisions), done after the split's
// strength work on its days. Steady items target a time or a distance that grows each week;
// interval items keep their structure. Stored in the routine plan JSON.
export const routineCardioIntensities = ['zone2', 'tempo', 'interval', 'recovery'] as const;
export type RoutineCardioIntensity = (typeof routineCardioIntensities)[number];
const cardioMinutesMessage = 'Enter a target time as a whole number from 1 to 600 minutes';
const cardioKmMessage = 'Enter a target distance from 0.1 to 500 km with at most 1 decimal place';
// Exact, so 5.00000001 is not stored as a week 1 target; out-of-range values get the
// range message once.
const oneDecimal = (v: number) => v < 0.1 || v > 500 || Math.round(v * 10) / 10 === v;
const intervalInt = (label: string, min: number, max: number) => {
  const message = `Enter ${label} as a whole number from ${min} to ${max}`;
  return z
    .number(numberError(`Enter ${label} as a number`, message))
    .int(message)
    .min(min, message)
    .max(max, message);
};
export const routineCardioSchema = z
  .object({
    kind: z.enum(cardioKinds, {
      error:
        'Choose a type: running, walking, outdoor cycling, indoor cycling, rowing, stairs, elliptical, swimming, or other',
    }),
    intensity: z.enum(routineCardioIntensities, {
      error: 'Choose an intensity: zone 2, tempo, interval, or recovery',
    }),
    // Week 1 targets for steady items: exactly one of time and distance.
    minutes: z
      .number(numberError('Enter the target time as a number', cardioMinutesMessage))
      .int(cardioMinutesMessage)
      .min(1, cardioMinutesMessage)
      .max(600, cardioMinutesMessage)
      .optional(),
    distance_km: z
      .number(numberError('Enter the target distance as a number', cardioKmMessage))
      .min(0.1, cardioKmMessage)
      .max(500, cardioKmMessage)
      .refine(oneDecimal, cardioKmMessage)
      .optional(),
    interval: z
      .object({
        repeats: intervalInt('the repeat count', 1, 50),
        work_sec: intervalInt('the work time in seconds', 5, 3600),
        recovery_sec: intervalInt('the recovery time in seconds', 0, 3600),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (v.intensity === 'interval') {
      if (!v.interval) issue('Enter the repeats, work time and recovery time', 'interval');
      if (v.minutes !== undefined || v.distance_km !== undefined)
        issue('An interval item takes its repeats, not a time or distance', 'minutes');
    } else {
      if (v.interval) issue('Only an interval item takes repeats', 'interval');
      if ((v.minutes === undefined) === (v.distance_km === undefined))
        issue('Enter either a target time or a target distance', 'minutes');
    }
  });
export type RoutineCardio = z.output<typeof routineCardioSchema>;
// The 12 weekly targets of a steady item: +10% a week compounded from week 1 and shown
// rounded to 1 minute or 0.1 km, so a short target still grows (4 → 4, 5, 5 … min) and a
// shown step can differ a little from 10%. Weeks 4, 8 and 12 are deloads at 80% of the week
// before, and the next week continues from the week before the deload. Interval items
// return null: their structure is fixed.
export function cardioWeeklyTargets(item: Pick<RoutineCardio, 'minutes' | 'distance_km'>) {
  const base = item.minutes ?? item.distance_km;
  if (base === undefined) return null;
  const step = item.minutes !== undefined ? 1 : 0.1;
  const max = item.minutes !== undefined ? 600 : 500;
  // In whole steps, trimmed first so float noise (60.4999999) does not flip a half.
  const show = (v: number) =>
    Math.min(max, Math.round(Number((v / step).toFixed(6))) * step).toFixed(step < 1 ? 1 : 0);
  const weeks: { week: number; target: number; deload: boolean }[] = [];
  let progress = base;
  for (let week = 1; week <= 12; week++) {
    const deload = week % 4 === 0;
    // Capped as it grows, so a deload is still 80% of the capped week before.
    if (!deload && week > 1) progress = Math.min(max, progress * 1.1);
    weeks.push({ week, target: Number(show(deload ? progress * 0.8 : progress)), deload });
  }
  return weeks;
}

// Issues keyed by their dotted path (e.g. "sets.0.weight") for per-field messages.
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

// #260: Web Push for the rest timer. The subscription is what the browser's PushManager returns
// (`subscription.toJSON()`); the server stores it for the signed-in user and sends the rest-end push.
// #372: the server POSTs to this address, so only the push services browsers register with are
// accepted (FCM for Chrome, Mozilla autopush, Apple web push, Windows WNS), never an arbitrary host.
const pushHosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const pushHostSuffixes = ['.notify.windows.com'];
const knownPushService = (v: string) => {
  try {
    const url = new URL(v);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return (
      pushHosts.includes(url.hostname) ||
      pushHostSuffixes.some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
};
const pushEndpoint = limitLength(z.string(whenMissing('Enter the push endpoint')).trim(), {
  min: 1,
  max: 2048,
  tooShort: 'Enter the push endpoint',
}).refine(knownPushService, 'The push endpoint must be an https address of a known push service');
// #501: browsers include `expirationTime` (epoch milliseconds, usually null) in toJSON(). It is
// accepted and not stored; any other unknown key is still refused.
export const pushSubscriptionSchema = z.strictObject({
  endpoint: pushEndpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: text('the p256dh key', 200),
    auth: text('the auth secret', 100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export const pushUnsubscribeSchema = z.strictObject({ endpoint: pushEndpoint });
// The rest ends at this instant (epoch milliseconds). The server also refuses a time that is
// already past or more than the longest rest (one hour, #84) ahead.
export const restPushSchema = z.strictObject({
  ends_at: z
    .number(whenMissing('Enter when the rest ends'))
    .int('Enter when the rest ends as epoch milliseconds'),
});
export type RestPushInput = z.infer<typeof restPushSchema>;
// #485: turns the Sunday-night weekly summary push on or off for the signed-in user.
export const weeklySummarySettingSchema = z.strictObject({
  enabled: z.boolean(whenMissing('Choose whether to turn the weekly summary on')),
});
export type WeeklySummarySettingInput = z.infer<typeof weeklySummarySettingSchema>;

// ---------------------------------------------------------------------------------------------
// #452: the routine schema, the routine progress engine, the exercise analysis and the cardio goal
// judge. They are pure (no database), and the frontend screen tests and e2e fixtures run them to
// simulate the server, so they live here and not in backend/src (moved from domain.ts, progress.ts,
// analysis.ts and cardio-goals.ts).
// ---------------------------------------------------------------------------------------------
const round = (value: number) => Math.round(value * 100) / 100;
const addDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (date: string) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// ----- Routine plan (was domain.ts) -----
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
          // #117: cardio after the split's strength work. Older plans omit it.
          cardio: z
            .array(routineCardioSchema)
            .max(10, 'Add at most 10 cardio items to a split')
            .optional(),
        }),
      )
      .min(1)
      .max(5),
    weeks: z
      .array(
        z.object({
          week: z.number().int().min(1).max(12),
          kind: z.enum(changeKinds),
          amount: z.number().positive().max(99999),
          deload_metric: z.enum(deloadMetrics).nullable(),
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

// ----- Routine progress (was progress.ts) -----

// Routine progress (#28). A plan's targets keep their original order; a rest day
// only changes which training slot (date) a target lands on. The 12-week end
// date never moves, so targets pushed past the last slot are kept as excluded.
export type TargetExercise = {
  exercise: string;
  machine_id: number | null;
  sets: number;
  weight: number;
  reps: number;
  base: { sets: number; weight: number; reps: number };
  // Auto routines only: whether the value is a projection, the outcome of its
  // week from saved journals, and how it changed from the previous target.
  projected?: boolean;
  result?: 'achieved' | 'missed' | null;
  kind?: 'start' | 'reps' | 'weight' | 'hold' | 'deload';
};
type WeekChange = NonNullable<RoutinePlan['weeks']>[number];
export type PlanTarget = {
  order: number;
  week: number;
  session: number;
  is_deload: boolean;
  split_index: number;
  split_name: string;
  change: WeekChange | null;
  exercises: TargetExercise[];
  // #117: the split's cardio items with this week's target; only on splits that have any.
  // routineProgress adds each item's result from saved cardio records.
  cardio?: TargetCardio[];
};
type TargetCardio = RoutineCardio & { result?: 'achieved' | 'missed' | null };
// A saved cardio record as the cardio judgement needs it.
export type CardioRecord = {
  id: number;
  date: string;
  kind: string;
  duration_sec: number;
  distance_km: number | null;
};
export type PlanDay = { date: string; week: number; rest: boolean; target: PlanTarget | null };
// One saved workout's sets for one exercise. `completed` exists once sets carry
// a completion flag; only an explicit false excludes a set.
export type WorkoutRecord = {
  date: string;
  exercise: string;
  sets: { weight: number; reps: number; completed?: boolean | null }[];
  // #83: the workout's overall feedback; missing or null means not recorded.
  feedback?: Feedback | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
export const exerciseKey = (name: string) => name.trim().toLowerCase();

export function seoulToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const planEndDate = (plan: RoutinePlan) => addDays(plan.start_date, 83);
// #86: a copy of the plan whose exercises carry the user's increment for computing.
export function withWeightSteps(plan: RoutinePlan, steps: Readonly<Record<string, number>>) {
  return {
    ...plan,
    splits: plan.splits.map((s) => ({
      ...s,
      exercises: s.exercises.map((e) => ({
        ...e,
        weight_step: steps[exerciseKey(e.exercise)] ?? defaultWeightStep,
      })),
    })),
  };
}
export const isAuto = (plan: RoutinePlan) => plan.progression === 'auto';

// Manual (#27) routines: each week's change applies once to the base values.
// Changes are never accumulated; limits mirror the journal input schema.
export function weekExercises(plan: RoutinePlan, splitIndex: number, week: number) {
  const change = plan.weeks!.find((w) => w.week === week)!;
  return plan.splits[splitIndex].exercises.map((base): TargetExercise => {
    let { sets, weight, reps } = base;
    if (change.kind === 'increase_weight') weight += change.amount;
    else if (change.kind === 'increase_reps') reps += change.amount;
    else if (change.deload_metric === 'weight') weight -= change.amount;
    else if (change.deload_metric === 'sets') sets -= change.amount;
    else reps -= change.amount;
    return {
      exercise: base.exercise,
      machine_id: base.machine_id ?? null,
      sets: clamp(sets, 1, 200),
      weight: clamp(round(weight), 0, 99999),
      reps: clamp(reps, 1, 1000),
      base: { sets: base.sets, weight: base.weight, reps: base.reps },
    };
  });
}

// #117: a split's cardio items for a routine week. A steady item's time or distance becomes the
// week's target (10% a week, deloads in weeks 4, 8 and 12); an interval item keeps its structure.
export function weekCardio(plan: RoutinePlan, splitIndex: number, week: number) {
  const items = plan.splits[splitIndex].cardio;
  if (!items?.length) return undefined;
  return items.map((item): RoutineCardio => {
    const targets = cardioWeeklyTargets(item);
    if (item.interval || !targets) return { ...item };
    const target = targets[week - 1].target;
    return item.minutes !== undefined
      ? { ...item, minutes: target }
      : { ...item, distance_km: target };
  });
}

// Auto routines: double progression (#28 rule change). The rule itself (progressionStep,
// deloadWeight) lives in the shared contract, so the routine form preview uses the same code (#377).

type Skeleton = Omit<PlanTarget, 'exercises'>;
type Placed = { target: Skeleton; date: string | null };

// Progression advances once per session (workout day) of the exercise's split,
// in plan order. A session's window runs from its date until the next session of
// the same split (exclusive; the last one until the plan end). A saved workout in
// the window with at least the planned number of sets at or above the target
// advances the next session; a closed window without one holds it; an open window
// is projected as met. Sessions of weeks 4/8/12 (by their planned week) are
// deloads at 90% of the previous non-deload target with the same reps; they are
// not judged and do not advance, so the next session resumes from before them.
function autoExercises(
  plan: RoutinePlan,
  placed: Placed[],
  records: readonly WorkoutRecord[],
  today: string,
) {
  const out = new Map<number, TargetExercise[]>();
  const end = addDays(planEndDate(plan), 1);
  plan.splits.forEach((split, splitIndex) => {
    const occ = placed
      .filter((p) => p.target.split_index === splitIndex)
      .sort((a, b) => a.target.order - b.target.order);
    for (const o of occ) out.set(o.target.order, []);
    split.exercises.forEach((ex) => {
      const key = exerciseKey(ex.exercise);
      let level: ProgressionLevel = { weight: ex.weight, reps: ex.reps };
      let kind: NonNullable<TargetExercise['kind']> = 'start';
      let previous: ProgressionLevel | null = null;
      occ.forEach((o, index) => {
        let target: ProgressionLevel;
        let result: TargetExercise['result'] = null;
        let shown: NonNullable<TargetExercise['kind']> = kind;
        if (o.target.is_deload) {
          const ref = previous ?? level;
          target = { weight: deloadWeight(ref.weight), reps: ref.reps };
          shown = 'deload';
        } else {
          const goal = level;
          target = goal;
          previous = goal;
          const start = o.date;
          const stop =
            occ
              .slice(index + 1)
              .map((n) => n.date)
              .find((d): d is string => !!d) ?? end;
          const inWindow = records.filter(
            (r) => !!start && exerciseKey(r.exercise) === key && r.date >= start && r.date < stop,
          );
          const met = inWindow.some(
            (r) =>
              r.sets.filter(
                (s) => s.completed !== false && s.weight >= goal.weight && s.reps >= goal.reps,
              ).length >= ex.sets,
          );
          if (met) result = 'achieved';
          else if (start && stop <= today) result = 'missed';
          // #83: a workout of this exercise in the window marked 'hard' holds the next
          // session at the same target even when the target was achieved.
          const hard = inWindow.some((r) => r.feedback === 'hard');
          if (result === 'missed' || (met && hard)) kind = 'hold';
          else {
            const step = progressionStep(level, ex);
            level = step.level;
            kind = step.kind;
          }
        }
        out.get(o.target.order)!.push({
          exercise: ex.exercise,
          machine_id: ex.machine_id ?? null,
          sets: ex.sets,
          weight: target.weight,
          reps: target.reps,
          base: { sets: ex.sets, weight: ex.weight, reps: ex.reps },
          projected: !o.date || o.date > today,
          result,
          kind: shown,
        });
      });
    });
  });
  return out;
}

function skeletons(plan: RoutinePlan): Skeleton[] {
  const perWeek = new Map<number, number>();
  return routineSchedule(plan).map((slot, index) => {
    // n-th training day of its planned week, e.g. "Week 3 session 2".
    const session = (perWeek.get(slot.week) ?? 0) + 1;
    perWeek.set(slot.week, session);
    return {
      order: index + 1,
      week: slot.week,
      session,
      is_deload: slot.is_deload,
      split_index: slot.split_index,
      split_name: plan.splits[slot.split_index].name,
      change: plan.weeks?.find((w) => w.week === slot.week) ?? null,
    };
  });
}

// Counts arrangeTargets calls so a test can check a request arranges the plan only as often as it must (#369).
export const arrangeStats = { calls: 0 };

// Targets keep plan order; rests only move which slot each target lands on.
// `records` and `today` matter only for auto routines.
export function arrangeTargets(
  plan: RoutinePlan,
  rests: readonly string[],
  records: readonly WorkoutRecord[] = [],
  today = '',
) {
  arrangeStats.calls++;
  const rested = new Set(rests);
  const targets = skeletons(plan);
  const slots = routineSchedule(plan);
  let next = 0;
  const placed: Placed[] = [];
  const byDate = new Map<string, number>();
  for (const slot of slots)
    if (!rested.has(slot.date) && next < targets.length) {
      byDate.set(slot.date, targets[next].order);
      placed.push({ target: targets[next++], date: slot.date });
    }
  const excludedSkeletons = targets.slice(next);
  for (const target of excludedSkeletons) placed.push({ target, date: null });
  const auto = isAuto(plan) ? autoExercises(plan, placed, records, today) : null;
  const full = new Map<number, PlanTarget>(
    placed.map((p) => {
      const cardio = weekCardio(plan, p.target.split_index, p.target.week);
      return [
        p.target.order,
        {
          ...p.target,
          exercises: auto
            ? auto.get(p.target.order)!
            : weekExercises(plan, p.target.split_index, p.target.week),
          ...(cardio && { cardio }),
        },
      ];
    }),
  );
  const days = slots.map((slot): PlanDay =>
    rested.has(slot.date)
      ? { date: slot.date, week: slot.week, rest: true, target: null }
      : {
          date: slot.date,
          week: slot.week,
          rest: false,
          target: byDate.has(slot.date) ? full.get(byDate.get(slot.date)!)! : null,
        },
  );
  return { days, excluded: excludedSkeletons.map((t) => full.get(t.order)!) };
}

// Returns the reason a rest cannot be chosen today, or null when it can. `arranged` is the plan
// already arranged with the same rests (records only change the exercises, never which days have a
// target), so a caller that has it does not arrange again (#369).
export function restUnavailable(
  plan: RoutinePlan,
  rests: readonly string[],
  today: string,
  arranged?: ReturnType<typeof arrangeTargets>,
) {
  if (rests.includes(today)) return 'Today is already set as a rest day';
  const day = (arranged ?? arrangeTargets(plan, rests)).days.find((d) => d.date === today);
  if (today < plan.start_date || today > planEndDate(plan)) return 'Not within the routine period';
  if (!day) return 'Today is not a planned workout day';
  if (!day.target) return 'No planned goals left for today';
  return null;
}

export function restPreview(
  plan: RoutinePlan,
  rests: readonly string[],
  today: string,
  records: readonly WorkoutRecord[] = [],
  arranged?: ReturnType<typeof arrangeTargets>,
) {
  const before = arranged ?? arrangeTargets(plan, rests, records, today);
  if (restUnavailable(plan, rests, today, before)) return null;
  const after = arrangeTargets(plan, [...rests, today], records, today);
  const dateOf = new Map(after.days.filter((d) => d.target).map((d) => [d.target!.order, d.date]));
  const moves = before.days
    .filter((d) => d.target && d.date >= today)
    .map((d) => ({
      order: d.target!.order,
      week: d.target!.week,
      is_deload: d.target!.is_deload,
      split_name: d.target!.split_name,
      from: d.date,
      to: dateOf.get(d.target!.order) ?? null,
    }));
  const known = new Set(before.excluded.map((t) => t.order));
  return { date: today, moves, excluded: after.excluded.filter((t) => !known.has(t.order)) };
}

// #117 part 3 (2026-11-16 decision): a planned cardio item is done when a saved record of the
// same type falls in its session's window (the session date until the next session of the same
// split, exclusive; the last one until the plan end) and meets the week's time or distance; an
// interval item takes any record of its type. One record counts for one item only, matched in
// session and item order with the earliest record first. A closed window without one is missed.
// The summary counts the items of sessions on or before today; null when no split has cardio.
function judgeCardio(
  plan: RoutinePlan,
  days: readonly PlanDay[],
  records: readonly CardioRecord[],
  today: string,
) {
  if (!plan.splits.some((s) => s.cardio?.length)) return { days: [...days], summary: null };
  const end = addDays(planEndDate(plan), 1);
  const dated = days.filter((d) => d.target);
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const used = new Set<number>();
  const judged = new Map<number, PlanTarget>();
  let planned = 0;
  let done = 0;
  dated.forEach((day, index) => {
    const target = day.target!;
    if (!target.cardio) return;
    const stop =
      dated.slice(index + 1).find((d) => d.target!.split_index === target.split_index)?.date ?? end;
    // The most demanding items pick first (distance, then time, larger targets first, intervals
    // last), so an easy item never takes the only record a harder one could use.
    const rank = (c: TargetCardio) =>
      c.interval ? [2, 0] : c.distance_km !== undefined ? [0, -c.distance_km] : [1, -c.minutes!];
    const order = target.cardio
      .map((item, i) => ({ item, i, rank: rank(item) }))
      .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.i - b.i);
    const cardio: TargetCardio[] = [...target.cardio];
    for (const { item, i } of order) {
      const match = sorted.find(
        (r) =>
          !used.has(r.id) &&
          r.kind === item.kind &&
          r.date >= day.date &&
          r.date < stop &&
          (item.interval ||
            (item.minutes !== undefined
              ? r.duration_sec >= item.minutes * 60
              : r.distance_km !== null && r.distance_km >= item.distance_km!)),
      );
      if (match) used.add(match.id);
      if (day.date <= today) {
        planned++;
        if (match) done++;
      }
      cardio[i] = { ...item, result: match ? 'achieved' : stop <= today ? 'missed' : null };
    }
    judged.set(target.order, { ...target, cardio });
  });
  return {
    days: days.map((d) =>
      d.target && judged.has(d.target.order) ? { ...d, target: judged.get(d.target.order)! } : d,
    ),
    summary: { done, planned },
  };
}

export function routineProgress(
  plan: RoutinePlan,
  rests: readonly string[],
  today: string,
  records: readonly WorkoutRecord[] = [],
  cardioRecords: readonly CardioRecord[] = [],
) {
  const arranged = arrangeTargets(plan, rests, records, today);
  // Targets pushed past the plan end are never judged.
  const excluded = arranged.excluded.map((t) =>
    t.cardio ? { ...t, cardio: t.cardio.map((c) => ({ ...c, result: null })) } : t,
  );
  const { days, summary: cardioSummary } = judgeCardio(plan, arranged.days, cardioRecords, today);
  const end = planEndDate(plan);
  const inRange = today >= plan.start_date && today <= end;
  const currentWeek = inRange ? Math.floor(dayDiff(plan.start_date, today) / 7) + 1 : null;
  const unavailable = restUnavailable(plan, rests, today, arranged);
  return {
    today,
    start_date: plan.start_date,
    end_date: end,
    status: inRange ? 'active' : 'finished',
    progression: isAuto(plan) ? 'auto' : 'manual',
    current_week: currentWeek,
    // #117: planned cardio items done so far; null when the routine has no cardio.
    cardio_summary: cardioSummary,
    today_plan: days.find((d) => d.date === today) ?? null,
    this_week: days.filter((d) => d.week === currentWeek),
    weeks: Array.from({ length: 12 }, (_, i) => i + 1).map((week) => ({
      week,
      is_deload: week % 4 === 0,
      change: plan.weeks?.find((w) => w.week === week) ?? null,
      entries: [
        ...days
          .filter((d) => d.target?.week === week)
          .map((d) => ({ date: d.date, excluded: false, target: d.target! })),
        ...excluded
          .filter((t) => t.week === week)
          .map((target) => ({ date: null, excluded: true, target })),
      ],
    })),
    days,
    excluded,
    rests: [...rests].sort(),
    rested_today: rests.includes(today),
    can_rest: !unavailable,
    rest_unavailable: unavailable,
    rest_preview: unavailable ? null : restPreview(plan, rests, today, records, arranged),
  };
}

// ----- Exercise analysis (was analysis.ts) -----

// Exercise analysis (#32). Everything is computed on read from saved sets, so
// edits and deletes are reflected on the next request without stored PRs.
const unclassified = '미분류';
// Epley estimate, applied only within this inclusive rep range.
const estimateMaxReps = 10;
export const bodyPartMappingSchema = z
  .object({
    exercise: limitLength(z.string().trim(), { min: 1, max: 120 }),
    body_parts: z.array(z.enum(allBodyParts)).max(allBodyParts.length),
  })
  .refine(
    (v) => new Set(v.body_parts).size === v.body_parts.length,
    'Select body parts without duplicates',
  );

export type AnalysisSet = {
  id: number;
  date: string;
  exercise: string;
  // Normalized identity computed by PostgreSQL with the goal judgment expression.
  exercise_key: string;
  weight: number | string;
  reps: number;
  // A machine is selected but its base weight is not confirmed (NULL).
  unknown_base: boolean;
};
export type PersonalRecord = {
  value: number;
  weight: number;
  reps: number;
  date: string;
  ties: number;
};
type TrendPoint = {
  date: string;
  max_weight: number | null;
  max_reps: number;
  max_set_volume: number | null;
  estimated_1rm: number | null;
};

/** Epley: weight × (1 + reps / 30), 1 rep = the lifted weight itself. kg, total load. */
export function estimatedOneRepMax(weight: number, reps: number, unknownBase: boolean) {
  // Bodyweight (0 kg), unconfirmed machine base weight and high-rep sets are excluded.
  if (!(weight > 0) || unknownBase || reps < 1 || reps > estimateMaxReps) return null;
  return round(reps === 1 ? weight : weight * (1 + reps / 30));
}

// The earliest set reaching the best value is the PR date; equal values are ties.
function best<T extends { date: string; weight: number; reps: number }>(
  sets: T[],
  metric: (s: T) => number | null,
): PersonalRecord | null {
  let result: PersonalRecord | null = null;
  for (const s of sets) {
    const value = metric(s);
    if (value === null) continue;
    if (!result || value > result.value)
      result = { value, weight: s.weight, reps: s.reps, date: s.date, ties: 1 };
    else if (value === result.value) result.ties++;
  }
  return result;
}

/**
 * rows: saved sets dated on or before the Seoul service date, in chronological order.
 * PRs use every given row; trends and weekly body-part totals only use from..to.
 */
export function analyze(
  rows: AnalysisSet[],
  mappings: { exercise: string; body_part: string }[],
  from: string,
  to: string,
) {
  const parts = new Map<string, string[]>();
  for (const m of mappings) {
    const list = parts.get(m.exercise);
    if (list) list.push(m.body_part);
    else parts.set(m.exercise, [m.body_part]);
  }
  for (const list of parts.values())
    list.sort((a, b) => allBodyParts.indexOf(a as never) - allBodyParts.indexOf(b as never));
  // #88: 팔 is listed only while some exercise is still mapped to it.
  const used = new Set(mappings.map((m) => m.body_part));
  const shownParts = allBodyParts.filter(
    (p) => !(legacyBodyParts as readonly string[]).includes(p) || used.has(p),
  );
  const sets = rows
    .map((r) => ({ ...r, date: r.date.slice(0, 10), weight: Number(r.weight) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const groups = new Map<string, typeof sets>();
  for (const s of sets) {
    const group = groups.get(s.exercise_key);
    if (group) group.push(s);
    else groups.set(s.exercise_key, [s]);
  }
  const weighted = (s: { weight: number }) => s.weight > 0;
  const exercises = [...groups.entries()].map(([key, list]) => {
    const latest = list[list.length - 1];
    const trend = new Map<string, TrendPoint>();
    for (const s of list) {
      if (s.date < from || s.date > to) continue;
      const point = trend.get(s.date) ?? {
        date: s.date,
        max_weight: null,
        max_reps: 0,
        max_set_volume: null,
        estimated_1rm: null,
      };
      const max = (a: number | null, b: number | null) =>
        b === null ? a : a === null ? b : Math.max(a, b);
      if (weighted(s)) {
        point.max_weight = max(point.max_weight, s.weight);
        point.max_set_volume = max(point.max_set_volume, round(s.weight * s.reps));
      }
      point.max_reps = Math.max(point.max_reps, s.reps);
      point.estimated_1rm = max(
        point.estimated_1rm,
        estimatedOneRepMax(s.weight, s.reps, s.unknown_base),
      );
      trend.set(s.date, point);
    }
    return {
      key,
      // The latest spelling is shown; identity ignores case and outer spaces.
      exercise: latest.exercise,
      body_parts: parts.get(key) ?? [],
      set_count: list.length,
      last_date: latest.date,
      unknown_base_sets: list.filter((s) => s.unknown_base).length,
      bodyweight_sets: list.filter((s) => !weighted(s)).length,
      prs: {
        max_weight: best(list, (s) => (weighted(s) ? s.weight : null)),
        max_reps: best(list, (s) => s.reps),
        max_set_volume: best(list, (s) => (weighted(s) ? round(s.weight * s.reps) : null)),
        actual_1rm: best(
          list.filter((s) => !s.unknown_base),
          (s) => (weighted(s) && s.reps === 1 ? s.weight : null),
        ),
        estimated_1rm: best(
          list.filter((s) => !s.unknown_base),
          (s) => estimatedOneRepMax(s.weight, s.reps, s.unknown_base),
        ),
      },
      trend: [...trend.values()],
    };
  });
  exercises.sort(
    (a, b) => b.last_date.localeCompare(a.last_date) || a.exercise.localeCompare(b.exercise),
  );
  const weeks: {
    week_start: string;
    week_end: string;
    sets: number;
    volume: number;
    parts: { body_part: string; sets: number; volume: number }[];
  }[] = [];
  for (let start = mondayOf(from); start <= to; start = addDays(start, 7))
    weeks.push({
      week_start: start,
      week_end: addDays(start, 6),
      sets: 0,
      volume: 0,
      parts: [...shownParts, unclassified].map((body_part) => ({ body_part, sets: 0, volume: 0 })),
    });
  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    const week = weeks.find((w) => w.week_start === mondayOf(s.date))!;
    const volume = s.weight * s.reps;
    week.sets++;
    week.volume = round(week.volume + volume);
    // A set mapped to several parts counts fully toward each part.
    for (const name of parts.get(s.exercise_key) ?? [unclassified]) {
      const part = week.parts.find((p) => p.body_part === name)!;
      part.sets++;
      part.volume = round(part.volume + volume);
    }
  }
  return { from, to, exercises, weeks };
}

// ----- Cardio goals (was cardio-goals.ts) -----

// #116: cardio goal judgment (2026-11-08 user decisions D2~D5). Pure so it is tested without a
// database; the route feeds it the stored goals and the sessions dated up to today (Seoul).

export type CardioGoalSession = {
  date: string;
  kind: CardioKind;
  duration_sec: number;
  distance_km: number | null;
};
type GoalPeriodResult = {
  /** Calendar period (Mon~Sun or the month), not clipped to the goal dates. */
  start: string;
  end: string;
  /** km, seconds or sessions counted inside the goal dates and up to today. */
  value: number;
  achieved: boolean;
};
export type CardioGoalProgress =
  | {
      kind: 'period';
      /** The period that holds today, or null before the start and after the deadline. */
      current: GoalPeriodResult | null;
      periods: GoalPeriodResult[];
      periods_achieved: number;
    }
  | {
      kind: 'record';
      /** Fastest qualifying time (record_time) or longest distance; null without a session. */
      best: number | null;
    };

const monthEnd = (start: string) => {
  const d = new Date(start + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
// Distances are NUMERIC(8,3); keep sums at 1 m so 0.1 + 0.2 compares as 0.3.
const km = (value: number) => Math.round(value * 1000) / 1000;

/** Calendar periods that overlap [from, to]: weeks start on Monday, months on the 1st. */
export function goalPeriods(period: 'week' | 'month', from: string, to: string) {
  const periods: { start: string; end: string }[] = [];
  let start = period === 'week' ? mondayOf(from) : from.slice(0, 8) + '01';
  while (start <= to) {
    const end = period === 'week' ? addDays(start, 6) : monthEnd(start);
    periods.push({ start, end });
    start = addDays(end, 1);
  }
  return periods;
}

function total(goal: CardioGoal, sessions: CardioGoalSession[]) {
  if (goal.goal_type === 'count') return sessions.length;
  if (goal.goal_type === 'duration') return sessions.reduce((sum, s) => sum + s.duration_sec, 0);
  // Sessions without a distance only drop out of distance goals.
  return km(sessions.reduce((sum, s) => sum + (s.distance_km ?? 0), 0));
}
const target = (goal: CardioGoal) =>
  goal.goal_type === 'count'
    ? goal.target_count!
    : goal.goal_type === 'duration'
      ? goal.target_duration_sec!
      : goal.target_distance_km!;

/**
 * Judges one goal. `achieved` is the current period for period totals (D2) and "ever within
 * the goal dates" for records. Sessions after today or outside the goal dates never count, and
 * a period cut by the start or deadline keeps the full target (D3).
 */
export function judgeCardioGoal(
  goal: CardioGoal,
  sessions: CardioGoalSession[],
  today: string,
): { achieved: boolean; progress: CardioGoalProgress } {
  const last = goal.deadline < today ? goal.deadline : today;
  const mine = sessions.filter(
    (s) =>
      s.date >= goal.start_date && s.date <= last && (goal.kind === null || s.kind === goal.kind),
  );
  if (goal.goal_type === 'record_time' || goal.goal_type === 'longest_distance') {
    let best: number | null = null;
    if (goal.goal_type === 'record_time') {
      // D5: one session covering the distance in the time, no pace estimate.
      for (const s of mine)
        if (s.distance_km !== null && s.distance_km >= goal.target_distance_km!)
          best = best === null ? s.duration_sec : Math.min(best, s.duration_sec);
      return {
        achieved: best !== null && best <= goal.target_duration_sec!,
        progress: { kind: 'record', best },
      };
    }
    for (const s of mine)
      if (s.distance_km !== null)
        best = best === null ? s.distance_km : Math.max(best, s.distance_km);
    return {
      achieved: best !== null && best >= goal.target_distance_km!,
      progress: { kind: 'record', best },
    };
  }
  const goalTarget = target(goal);
  const periods = goalPeriods(goal.period!, goal.start_date, goal.deadline).map(
    ({ start, end }) => {
      const value = total(
        goal,
        mine.filter((s) => s.date >= start && s.date <= end),
      );
      return { start, end, value, achieved: value >= goalTarget };
    },
  );
  const current =
    today >= goal.start_date && today <= goal.deadline
      ? (periods.find((p) => p.start <= today && today <= p.end) ?? null)
      : null;
  return {
    achieved: current?.achieved ?? false,
    progress: {
      kind: 'period',
      current,
      periods,
      periods_achieved: periods.filter((p) => p.achieved).length,
    },
  };
}

// #251: the next goal after an achieved one (2026-11-08 user decisions N1, N2, N4). It is
// computed from the goal's own targets, never stored, and keeps the type, kind and period.
const days = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
// Rounds to `step`; upwards it reaches at least the next step boundary above `from`, downwards
// it goes at least one whole step below `from`.
function stepPast(value: number, step: number, from: number, direction: 1 | -1) {
  let next = Math.round(value / step) * step;
  if (direction === 1) {
    // Not past `from`: take the next step boundary above it (61 s → 120 s, not 121 s).
    if (next - from < step / 2) next = (Math.floor(from / step + 1e-9) + 1) * step;
  } else if (from - next < step - 1e-9) {
    // Records get at least one whole step faster (N1: at least 5 s): 102 s → 95 s, not 100 s.
    next = Math.floor((from - step) / step + 1e-9) * step;
  }
  // Keep decimal steps exact (0.1 km, 0.05 km) for the 3-decimal distance rule.
  return Math.round(next * 1000) / 1000;
}

/** The suggested next goal, or null when it would leave the allowed range. */
export function suggestCardioGoal(goal: CardioGoal, today: string): CardioGoal | null {
  const next: CardioGoal = {
    ...goal,
    start_date: today,
    deadline: addDays(today, days(goal.start_date, goal.deadline)),
  };
  // Swimming moves by 50 m like it is shown in metres; every other kind by 0.1 km.
  const kmStep = goal.kind === 'swimming' ? 0.05 : 0.1;
  switch (goal.goal_type) {
    case 'distance':
    case 'longest_distance': {
      const target = goal.target_distance_km!;
      next.target_distance_km = stepPast(target * 1.1, kmStep, target, 1);
      return next.target_distance_km <= 10000 ? next : null;
    }
    case 'duration': {
      const target = goal.target_duration_sec!;
      next.target_duration_sec = stepPast(target * 1.1, 60, target, 1);
      return next.target_duration_sec <= 2678400 ? next : null;
    }
    case 'count':
      next.target_count = goal.target_count! + 1;
      return next.target_count <= 1000 ? next : null;
    case 'record_time': {
      // 3% faster, in 5-second steps and at least 5 seconds; the distance stays.
      const target = goal.target_duration_sec!;
      next.target_duration_sec = stepPast(target * 0.97, 5, target, -1);
      return next.target_duration_sec >= 1 ? next : null;
    }
  }
}

// ----- Routine inputs for tests (was backend/test/routine-fixture.ts) -----
// Proposed public contract for #27. Amounts are manually supplied changes,
// never generated percentages; weight always means total kg.
const fixtureBodyParts = ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'];
export function routineInput(splitCount = 2) {
  return {
    name: 'Manual 12-week routine',
    start_date: '2024-02-29',
    split_count: splitCount,
    weekly_workouts: 3,
    rest_days: [0, 2, 4, 6], // Sunday=0; train Monday, Wednesday, Friday.
    splits: Array.from({ length: splitCount }, (_, index) => ({
      name: `Split ${index + 1}`,
      body_parts: index === 0 ? [...fixtureBodyParts, '가슴'] : ['등', '가슴'],
      exercises: [
        { exercise: 'Squat', sets: 3, weight: 100.25, reps: 10 },
        { exercise: 'Bodyweight Lunge', sets: 2, weight: 0, reps: 12 },
      ],
    })),
    weeks: Array.from({ length: 12 }, (_, index) => {
      const week = index + 1;
      return {
        week,
        kind: week % 4 === 0 ? 'deload' : week % 2 ? 'increase_weight' : 'increase_reps',
        amount: week % 4 === 0 ? 12.5 : week === 5 ? 7.25 : week % 2 ? 2.5 : 1,
        deload_metric: week % 4 === 0 ? 'weight' : null,
      };
    }),
  };
}
export type RoutineInput = ReturnType<typeof routineInput>;
export type SavedRoutine = RoutineInput & {
  id: number;
  schedule: { date: string; week: number; split_index: number; is_deload: boolean }[];
};

// #28 rule change: automatic double progression. The user enters current
// performance (total kg, reps) and a rep range; weekly targets are computed.
// Starts Monday 2024-03-04, trains Mon/Wed/Fri, one split (3 sessions a week).
export function autoRoutineInput() {
  return {
    name: 'Auto 12-week routine',
    progression: 'auto' as const,
    start_date: '2024-03-04',
    split_count: 1,
    weekly_workouts: 3,
    rest_days: [0, 2, 4, 6],
    splits: [
      {
        name: 'Full body',
        body_parts: ['가슴', '등', '팔'],
        exercises: [
          { exercise: 'Benchpress', sets: 3, weight: 100, reps: 10, rep_min: 8, rep_max: 12 },
          { exercise: 'Bodyweight Pull-up', sets: 3, weight: 0, reps: 10, rep_min: 8, rep_max: 12 },
          { exercise: 'Dumbbell Curl', sets: 3, weight: 40, reps: 12, rep_min: 8, rep_max: 12 },
        ],
      },
    ],
  };
}
export type AutoRoutineInput = ReturnType<typeof autoRoutineInput>;
