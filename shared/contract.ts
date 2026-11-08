// Shared input contract (#64). Source of truth: shared/contract.ts. The copies in
// backend/src/contract.ts and frontend/src/contract.ts are written by
// `npm run contract:sync`; `npm run check` fails when they differ. Edit only the source.
// The server validates with these schemas (400 with the same messages) and the
// screens validate with them before sending, so both report the same rules.
import { z } from 'zod/v4';

// A missing value gets the Korean message; any other wrong type keeps zod's own message.
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
  .string(whenMissing('날짜를 입력하세요'))
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식으로 입력하세요')
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, '올바른 날짜를 입력하세요');

// Korean particles follow the label's last syllable: 운동명을 / 반복 수를, 운동명은 / 반복 수는.
const batchim = (word: string) => (word.charCodeAt(word.length - 1) - 0xac00) % 28 > 0;
const obj = (word: string) => word + (batchim(word) ? '을' : '를');
const topic = (word: string) => word + (batchim(word) ? '은' : '는');

const text = (label: string, max: number) =>
  limitLength(z.string(whenMissing(`${obj(label)} 입력하세요`)).trim(), {
    min: 1,
    max,
    tooShort: `${obj(label)} 입력하세요`,
    tooLong: `${topic(label)} ${max}자 이하로 입력하세요`,
  });
const memo = (max: number) =>
  limitLength(z.string(), { max, tooLong: `메모는 ${max}자 이하로 입력하세요` });
// Weight always means the total moved load in kg, including a machine's base weight.
const kg = (label: string) =>
  z
    .number(
      numberError(`${obj(label)} 숫자로 입력하세요`, `${topic(label)} 0~99999 kg으로 입력하세요`),
    )
    .min(0, `${topic(label)} 0~99999 kg으로 입력하세요`)
    .max(99999, `${topic(label)} 0~99999 kg으로 입력하세요`);
const reps = (label: string) =>
  z
    .number(
      numberError(`${obj(label)} 숫자로 입력하세요`, `${topic(label)} 1~1000의 정수로 입력하세요`),
    )
    .int(`${topic(label)} 1~1000의 정수로 입력하세요`)
    .min(1, `${topic(label)} 1~1000의 정수로 입력하세요`)
    .max(1000, `${topic(label)} 1~1000의 정수로 입력하세요`);
const rpeMessage = 'RPE는 1~10 사이 0.5 단위로 입력하세요';

export const feedbackLevels = ['hard', 'medium', 'easy'] as const;
export type Feedback = (typeof feedbackLevels)[number];

export const workoutSchema = z.object({
  version: z.number().int().positive().optional(),
  date,
  title: text('일지 제목', 120),
  notes: memo(4000).default(''),
  // #83: how the whole workout felt. Missing stays NULL and is never a default level.
  feedback: z
    .enum(feedbackLevels, { error: '체감 피드백은 힘듦·중간·쉬움 중에서 선택하세요' })
    .nullable()
    .default(null),
  sets: z
    .array(
      z.object({
        exercise: text('운동명', 120),
        machine_id: z.number().int().positive().nullable().default(null),
        weight: kg('총중량'),
        reps: reps('반복 수'),
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
    .min(1, '세트를 1개 이상 입력하세요')
    .max(200, '세트는 200개 이하로 입력하세요'),
});
export type WorkoutInput = z.input<typeof workoutSchema>;

export const machineSchema = z.object({
  brand_id: z
    .number({ error: '브랜드를 선택하세요' })
    .int('브랜드를 선택하세요')
    .positive('브랜드를 선택하세요'),
  name: text('머신 이름', 120),
  // Unknown base weight stays null; a confirmed 0 kg is a different value.
  base_weight: kg('기본중량').nullable(),
  notes: memo(2000).default(''),
  // A link to a manufacturer reference row; it never sets or changes base_weight.
  // Omitted keeps the stored link on update (none on create); explicit null unlinks.
  official_weight_id: z.number().int().positive().max(2147483647).nullable().optional(),
  // #84: single-joint machines use the single-joint rest. Omitted keeps the stored value
  // on update (false on create), so older clients do not clear it.
  single_joint: z.boolean({ error: '단관절 여부를 확인하세요' }).optional(),
});

export const goalSchema = z
  .object({
    exercise: text('운동명', 120),
    target_weight: kg('목표 총중량'),
    target_reps: reps('목표 반복 수'),
    start_date: date,
    deadline: date,
  })
  .refine((v) => v.deadline >= v.start_date, {
    error: '종료일은 시작일과 같거나 이후여야 합니다',
    path: ['deadline'],
  });
export type GoalInput = z.input<typeof goalSchema>;

// Body metrics are stored as NUMERIC(5,2). Values with more than two decimals are
// rejected instead of silently rounded, so the stored value is exactly what was entered.
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const metric = (label: string, min: number, max: number, minInclusive: boolean) =>
  z
    .number(numberError(`${label}은 숫자로 입력하세요`, `${label}은 유한한 숫자여야 합니다`))
    .refine((v) => (minInclusive ? v >= min : v > min) && v <= max, `${label} 범위를 확인하세요`)
    .refine(twoDecimals, `${label}은 소수점 둘째 자리까지 입력하세요`)
    .nullable()
    .default(null);
export const bodyMeasurementSchema = z
  .object({
    date,
    body_weight_kg: metric('체중', 0, 999.99, false),
    body_fat_percent: metric('체지방률', 0, 100, true),
    skeletal_muscle_kg: metric('골격근량', 0, 999.99, false),
  })
  .refine(
    (v) =>
      v.body_weight_kg !== null || v.body_fat_percent !== null || v.skeletal_muscle_kg !== null,
    '체중, 체지방률, 골격근량 중 하나 이상을 입력하세요',
  );
export type BodyMeasurementInput = z.infer<typeof bodyMeasurementSchema>;

// #86: progressive overload adds this much total kg per exercise. A missing setting is
// the default; null in a request resets the exercise back to the default.
export const defaultWeightStep = 5;
export const weightStepSchema = z.object({
  exercise: text('운동명', 120),
  weight_step: z
    .number(
      numberError(
        '증량 단위를 숫자로 입력하세요',
        '증량 단위는 100 kg 이하로 입력하세요',
        '증량 단위는 0보다 커야 합니다',
      ),
    )
    .positive('증량 단위는 0보다 커야 합니다')
    .max(100, '증량 단위는 100 kg 이하로 입력하세요')
    .refine(twoDecimals, '증량 단위는 소수점 둘째 자리까지 입력하세요')
    .nullable(),
});
export type WeightStepInput = z.infer<typeof weightStepSchema>;

// #114: cardio sessions. Labels: 러닝·걷기·실외 사이클·실내 자전거·로잉·계단·일립티컬·수영·기타.
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
  const message = `${topic(label)} ${min}~${max}${unit} 정수로 입력하세요`;
  return z
    .number(numberError(`${obj(label)} 숫자로 입력하세요`, message))
    .int(message)
    .min(min, message)
    .max(max, message)
    .nullable()
    .default(null);
};
const durationMessage = '운동 시간은 1~86400초(24시간) 사이의 정수 초로 입력하세요';
const distanceMessage = '거리는 0 km보다 크고 1000 km 이하로 입력하세요';
// NUMERIC(8,3): 1 m precision. More decimals are rejected instead of silently rounded.
const threeDecimals = (v: number) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

// Field rules without the cross-field checks, so the backup format can add its own fields.
export const cardioSessionObject = z.object({
  date,
  // Local start time in Asia/Seoul. Missing is null (not recorded).
  start_time: z
    .string({ error: '시작 시각은 HH:MM 형식으로 입력하세요' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시작 시각은 00:00~23:59의 HH:MM 형식으로 입력하세요')
    .nullable()
    .default(null),
  kind: z.enum(cardioKinds, {
    error:
      '종류는 러닝·걷기·실외 사이클·실내 자전거·로잉·계단·일립티컬·수영·기타 중에서 선택하세요',
  }),
  // Whole seconds; pace and speed are computed from this and distance, never stored.
  duration_sec: z
    .number({
      error: (issue: { input?: unknown }) =>
        issue.input === undefined
          ? '운동 시간을 입력하세요'
          : numberError('운동 시간을 숫자로 입력하세요', durationMessage).error(issue),
    })
    .int(durationMessage)
    .min(1, durationMessage)
    .max(86400, durationMessage),
  distance_km: z
    .number(numberError('거리를 숫자로 입력하세요', distanceMessage))
    .positive(distanceMessage)
    .max(1000, distanceMessage)
    .refine(threeDecimals, '거리는 소수점 셋째 자리(1 m)까지 입력하세요')
    .nullable()
    .default(null),
  avg_heart_rate: optionalInt('평균 심박', 30, 250, ' bpm의'),
  max_heart_rate: optionalInt('최대 심박', 30, 250, ' bpm의'),
  calories_kcal: optionalInt('칼로리', 0, 20000, ' kcal의'),
  elevation_gain_m: optionalInt('상승 고도', 0, 10000, ' m의'),
  avg_cadence: optionalInt('케이던스', 1, 300, '의'),
  // #83 levels reused for perceived effort.
  effort: z
    .enum(feedbackLevels, { error: '체감 강도는 힘듦·중간·쉬움 중에서 선택하세요' })
    .nullable()
    .default(null),
  // Optional link to a strength workout of the app.
  workout_id: z
    .number({ error: '연결할 근력 일지를 다시 선택하세요' })
    .int('연결할 근력 일지를 다시 선택하세요')
    .positive('연결할 근력 일지를 다시 선택하세요')
    .max(2147483647, '연결할 근력 일지를 다시 선택하세요')
    .nullable()
    .default(null),
  source: z
    .enum(cardioSources, { error: '출처는 manual·garmin·nike·file 중 하나여야 합니다' })
    .default('manual'),
  external_id: limitLength(z.string({ error: '외부 ID는 문자열이어야 합니다' }).trim(), {
    min: 1,
    max: 200,
    tooShort: '외부 ID를 입력하거나 null로 보내세요',
    tooLong: '외부 ID는 200자 이하로 입력하세요',
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
      message: '최대 심박은 평균 심박보다 낮을 수 없습니다',
      path: ['max_heart_rate'],
    });
  if (v.source === 'manual' && v.external_id !== null)
    ctx.addIssue({
      code: 'custom',
      message: '직접 입력한 기록(manual)에는 외부 ID를 넣지 않습니다',
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
    error: '유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다',
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
const goalDistanceMessage = '목표 거리는 0 km보다 크고 10000 km 이하로 입력하세요';
const goalDurationMessage = '목표 시간은 1초~744시간(31일) 사이의 정수 초로 입력하세요';
const goalCountMessage = '목표 횟수는 1~1000회 정수로 입력하세요';
const goalMaxDays = 1826;
const goalTargets = {
  distance: ['target_distance_km'],
  duration: ['target_duration_sec'],
  count: ['target_count'],
  record_time: ['target_distance_km', 'target_duration_sec'],
  longest_distance: ['target_distance_km'],
} as const satisfies Record<CardioGoalType, readonly string[]>;
const goalTargetLabels = {
  target_distance_km: '목표 거리',
  target_duration_sec: '목표 시간',
  target_count: '목표 횟수',
} as const;
// Field rules without the cross-field checks, so the backup format can add its id (#253).
export const cardioGoalObject = z.object({
  goal_type: z.enum(cardioGoalTypes, {
    error: '목표 종류는 거리·시간·횟수·기록 시간·최장 거리 중에서 선택하세요',
  }),
  kind: z
    .enum(cardioKinds, {
      error:
        '운동 종류는 러닝·걷기·실외 사이클·실내 자전거·로잉·계단·일립티컬·수영·기타 중에서 선택하세요',
    })
    .nullable()
    .default(null),
  period: z
    .enum(cardioGoalPeriods, { error: '기간 단위는 주간·월간 중에서 선택하세요' })
    .nullable()
    .default(null),
  target_distance_km: z
    .number(numberError('목표 거리를 숫자로 입력하세요', goalDistanceMessage))
    .positive(goalDistanceMessage)
    .max(10000, goalDistanceMessage)
    .refine(threeDecimals, '목표 거리는 소수점 셋째 자리(1 m)까지 입력하세요')
    .nullable()
    .default(null),
  target_duration_sec: z
    .number(numberError('목표 시간을 숫자로 입력하세요', goalDurationMessage))
    .int(goalDurationMessage)
    .min(1, goalDurationMessage)
    .max(2678400, goalDurationMessage)
    .nullable()
    .default(null),
  target_count: z
    .number(numberError('목표 횟수를 숫자로 입력하세요', goalCountMessage))
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
      message: '종료일은 시작일과 같거나 이후여야 합니다',
      path: ['deadline'],
    });
  // Period goals list every week or month of the goal, so the span is capped at five years.
  else if (Date.parse(v.deadline) - Date.parse(v.start_date) > goalMaxDays * 86400000)
    ctx.addIssue({
      code: 'custom',
      message: '목표 기간은 5년(1826일) 이하로 정하세요',
      path: ['deadline'],
    });
  const record = v.goal_type === 'record_time' || v.goal_type === 'longest_distance';
  if (record && v.kind === null)
    ctx.addIssue({
      code: 'custom',
      message: '기록 목표는 운동 종류를 하나 선택하세요',
      path: ['kind'],
    });
  if (!record && v.period === null)
    ctx.addIssue({
      code: 'custom',
      message: '누적 목표는 주간·월간 중 기간 단위를 선택하세요',
      path: ['period'],
    });
  if (record && v.period !== null)
    ctx.addIssue({
      code: 'custom',
      message: '기록 목표에는 기간 단위를 넣지 않습니다',
      path: ['period'],
    });
  const wanted: readonly string[] = goalTargets[v.goal_type];
  for (const [field, label] of Object.entries(goalTargetLabels)) {
    const value = v[field as keyof typeof goalTargetLabels];
    if (wanted.includes(field) && value === null)
      ctx.addIssue({ code: 'custom', message: `${obj(label)} 입력하세요`, path: [field] });
    if (!wanted.includes(field) && value !== null)
      ctx.addIssue({
        code: 'custom',
        message: `이 목표 종류에는 ${obj(label)} 넣지 않습니다`,
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
