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
// Issues keyed by their dotted path (e.g. "sets.0.weight") for per-field messages.
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}
