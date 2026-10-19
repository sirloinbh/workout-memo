import { z } from 'zod';
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, '올바른 날짜를 입력하세요');
export const workoutSchema = z.object({
  date,
  title: z.string().trim().min(1).max(120),
  notes: z.string().max(4000).default(''),
  sets: z
    .array(
      z.object({
        exercise: z.string().trim().min(1).max(120),
        machine_id: z.number().int().positive().nullable().default(null),
        weight: z.number().min(0).max(99999),
        reps: z.number().int().min(1).max(1000),
        notes: z.string().max(4000).default(''),
      }),
    )
    .min(1)
    .max(200),
});
export const machineSchema = z.object({
  brand_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  base_weight: z.number().min(0).max(99999).nullable(),
  notes: z.string().max(2000).default(''),
});
export const goalSchema = z
  .object({
    exercise: z.string().trim().min(1).max(120),
    target_weight: z.number().min(0).max(99999),
    target_reps: z.number().int().min(1).max(1000),
    start_date: date,
    deadline: date,
  })
  .refine((v) => v.deadline >= v.start_date, '목표 종료일을 확인하세요');
// Weight always means the total moved load, including a machine's base weight.
export const volume = (sets: { weight: number; reps: number }[]) =>
  sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

export const routineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    start_date: date,
    split_count: z.number().int().min(1).max(5),
    weekly_workouts: z.number().int().min(1).max(7),
    rest_days: z.array(z.number().int().min(0).max(6)).max(6),
    splits: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          body_parts: z
            .array(z.enum(['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근']))
            .min(1)
            .max(100),
          exercises: z
            .array(
              z.object({
                exercise: z.string().trim().min(1).max(120),
                sets: z.number().int().min(1).max(200),
                weight: z.number().min(0).max(99999),
                reps: z.number().int().min(1).max(1000),
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
      .length(12),
  })
  .superRefine((plan, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (plan.splits.length !== plan.split_count) invalid('분할 개수를 확인하세요');
    if (
      new Set(plan.rest_days).size !== plan.rest_days.length ||
      plan.rest_days.length + plan.weekly_workouts !== 7
    )
      invalid('휴식 요일과 주당 운동 횟수를 확인하세요');
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
