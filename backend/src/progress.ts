import { routineSchedule, type RoutinePlan } from './domain.js';

// Routine progress (#28). A plan's targets keep their original order; a rest day
// only changes which training slot (date) a target lands on. The 12-week end
// date never moves, so targets pushed past the last slot are kept as excluded.
export type TargetExercise = {
  exercise: string;
  sets: number;
  weight: number;
  reps: number;
  base: { sets: number; weight: number; reps: number };
};
export type WeekChange = RoutinePlan['weeks'][number];
export type PlanTarget = {
  order: number;
  week: number;
  is_deload: boolean;
  split_index: number;
  split_name: string;
  change: WeekChange;
  exercises: TargetExercise[];
};
export type PlanDay = { date: string; week: number; rest: boolean; target: PlanTarget | null };

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const addDays = (value: string, days: number) => {
  const day = new Date(value + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

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

// Each week's manual change applies once to the routine's base values. Changes
// are never accumulated or invented; limits mirror the journal input schema.
export function weekExercises(plan: RoutinePlan, splitIndex: number, week: number) {
  const change = plan.weeks.find((w) => w.week === week)!;
  return plan.splits[splitIndex].exercises.map((base): TargetExercise => {
    let { sets, weight, reps } = base;
    if (change.kind === 'increase_weight') weight += change.amount;
    else if (change.kind === 'increase_reps') reps += change.amount;
    else if (change.deload_metric === 'weight') weight -= change.amount;
    else if (change.deload_metric === 'sets') sets -= change.amount;
    else reps -= change.amount;
    return {
      exercise: base.exercise,
      sets: clamp(sets, 1, 200),
      weight: clamp(round(weight), 0, 99999),
      reps: clamp(reps, 1, 1000),
      base: { sets: base.sets, weight: base.weight, reps: base.reps },
    };
  });
}

export function planTargets(plan: RoutinePlan): PlanTarget[] {
  return routineSchedule(plan).map((slot, index) => ({
    order: index + 1,
    week: slot.week,
    is_deload: slot.is_deload,
    split_index: slot.split_index,
    split_name: plan.splits[slot.split_index].name,
    change: plan.weeks.find((w) => w.week === slot.week)!,
    exercises: weekExercises(plan, slot.split_index, slot.week),
  }));
}

export function arrangeTargets(plan: RoutinePlan, rests: readonly string[]) {
  const rested = new Set(rests);
  const targets = planTargets(plan);
  let next = 0;
  const days = routineSchedule(plan).map((slot): PlanDay =>
    rested.has(slot.date)
      ? { date: slot.date, week: slot.week, rest: true, target: null }
      : { date: slot.date, week: slot.week, rest: false, target: targets[next++] ?? null },
  );
  return { days, excluded: targets.slice(next) };
}

// Returns the reason a rest cannot be chosen today, or null when it can.
export function restUnavailable(plan: RoutinePlan, rests: readonly string[], today: string) {
  if (rests.includes(today)) return '오늘은 이미 휴식일로 지정했습니다';
  const day = arrangeTargets(plan, rests).days.find((d) => d.date === today);
  if (today < plan.start_date || today > planEndDate(plan)) return '루틴 기간이 아닙니다';
  if (!day) return '오늘은 계획된 운동일이 아닙니다';
  if (!day.target) return '오늘 남은 계획 목표가 없습니다';
  return null;
}

export function restPreview(plan: RoutinePlan, rests: readonly string[], today: string) {
  if (restUnavailable(plan, rests, today)) return null;
  const before = arrangeTargets(plan, rests);
  const after = arrangeTargets(plan, [...rests, today]);
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

export function routineProgress(plan: RoutinePlan, rests: readonly string[], today: string) {
  const { days, excluded } = arrangeTargets(plan, rests);
  const end = planEndDate(plan);
  const inRange = today >= plan.start_date && today <= end;
  const currentWeek = inRange ? Math.floor(dayDiff(plan.start_date, today) / 7) + 1 : null;
  const unavailable = restUnavailable(plan, rests, today);
  return {
    today,
    start_date: plan.start_date,
    end_date: end,
    status: inRange ? 'active' : 'finished',
    current_week: currentWeek,
    today_plan: days.find((d) => d.date === today) ?? null,
    this_week: days.filter((d) => d.week === currentWeek),
    weeks: plan.weeks.map((change) => ({
      week: change.week,
      change,
      entries: [
        ...days
          .filter((d) => d.target?.week === change.week)
          .map((d) => ({ date: d.date as string | null, excluded: false, target: d.target! })),
        ...excluded
          .filter((t) => t.week === change.week)
          .map((target) => ({ date: null, excluded: true, target })),
      ],
    })),
    days,
    excluded,
    rests: [...rests].sort(),
    rested_today: rests.includes(today),
    can_rest: !unavailable,
    rest_unavailable: unavailable,
    rest_preview: unavailable ? null : restPreview(plan, rests, today),
  };
}
