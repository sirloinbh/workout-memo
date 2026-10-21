import { z } from 'zod';
import { date } from './contract.js';
// Input schemas shared with the frontend live in contract.ts (synced from shared/contract.ts).
export {
  date,
  feedbackLevels,
  type Feedback,
  workoutSchema,
  machineSchema,
  goalSchema,
  bodyMeasurementSchema,
  type BodyMeasurementInput,
} from './contract.js';
export const officialWeightQuery = z
  .object({ brand: z.string().trim().min(1).max(120).optional() })
  .strict();
// Weight always means the total moved load, including a machine's base weight.
// Not-completed (planned) sets are not actual performance.
export const volume = (sets: { weight: number; reps: number; completed?: boolean }[]) =>
  sets.reduce((sum, s) => (s.completed === false ? sum : sum + s.weight * s.reps), 0);

// The seven routine body parts (#27), also used by the exercise mapping (#32).
export const bodyParts = ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'] as const;
// Same-exercise identity shared by goal judgment and exercise analysis: case and
// outer spaces are ignored. Evaluated by PostgreSQL so both use one collation.
export const exerciseKeySql = (column: string) => `lower(trim(${column}))`;

export const routineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // #28: 'auto' computes weekly targets (double progression). A missing value
    // is a saved #27 routine with manual weekly changes.
    progression: z.enum(['manual', 'auto']).optional(),
    start_date: date,
    split_count: z.number().int().min(1).max(5),
    weekly_workouts: z.number().int().min(1).max(7),
    rest_days: z.array(z.number().int().min(0).max(6)).max(6),
    splits: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          body_parts: z
            .array(z.enum(bodyParts))
            .min(1, '분할마다 운동 부위를 1개 이상 선택하세요')
            .max(100),
          exercises: z
            .array(
              z.object({
                exercise: z.string().trim().min(1).max(120),
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
    if (plan.splits.length !== plan.split_count) invalid('분할 개수를 확인하세요');
    if (
      new Set(plan.rest_days).size !== plan.rest_days.length ||
      plan.rest_days.length + plan.weekly_workouts !== 7
    )
      invalid('휴식 요일과 주당 운동 횟수를 확인하세요');
    if (plan.progression === 'auto') {
      if (plan.weeks) invalid('자동 목표 루틴에는 주차별 변화량을 입력하지 않습니다');
      for (const split of plan.splits)
        for (const e of split.exercises)
          if (e.rep_min === undefined || e.rep_max === undefined || e.rep_min > e.rep_max)
            invalid('반복 범위(하한 ≤ 상한)를 확인하세요');
      return;
    }
    if (!plan.weeks) {
      invalid('1~12주차 목표를 입력하세요');
      return;
    }
    if (new Set(plan.weeks.map((w) => w.week)).size !== 12)
      invalid('1~12주차를 한 번씩 입력하세요');
    for (const w of plan.weeks) {
      if ((w.week % 4 === 0) !== (w.kind === 'deload')) invalid('4·8·12주차는 디로딩입니다');
      if ((w.kind === 'deload') !== (w.deload_metric !== null))
        invalid('디로딩 감소 대상을 확인하세요');
      if (
        (w.kind === 'increase_reps' || (w.kind === 'deload' && w.deload_metric !== 'weight')) &&
        (!Number.isInteger(w.amount) || w.amount > (w.deload_metric === 'sets' ? 200 : 1000))
      )
        invalid('반복 수와 세트 변화량은 허용 범위의 정수여야 합니다');
    }
  });
export type RoutinePlan = z.infer<typeof routineSchema>;
export function routineSchedule(plan: RoutinePlan) {
  const schedule: { date: string; week: number; split_index: number; is_deload: boolean }[] = [];
  for (let offset = 0; offset < 84; offset++) {
    const day = new Date(plan.start_date + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + offset);
    if (plan.rest_days.includes(day.getUTCDay())) continue;
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
  .refine((value) => value.from <= value.to, '조회 종료일은 시작일 이후여야 합니다');
