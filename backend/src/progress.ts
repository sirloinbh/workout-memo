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
  // Auto routines only: whether the value is a projection, the outcome of its
  // week from saved journals, and how it changed from the previous target.
  projected?: boolean;
  result?: 'achieved' | 'missed' | null;
  kind?: 'start' | 'reps' | 'weight' | 'hold' | 'deload';
};
export type WeekChange = NonNullable<RoutinePlan['weeks']>[number];
export type PlanTarget = {
  order: number;
  week: number;
  is_deload: boolean;
  split_index: number;
  split_name: string;
  change: WeekChange | null;
  exercises: TargetExercise[];
};
export type PlanDay = { date: string; week: number; rest: boolean; target: PlanTarget | null };
// One saved workout's sets for one exercise. `completed` exists once sets carry
// a completion flag; only an explicit false excludes a set.
export type WorkoutRecord = {
  date: string;
  exercise: string;
  sets: { weight: number; reps: number; completed?: boolean | null }[];
};

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const addDays = (value: string, days: number) => {
  const day = new Date(value + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
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
      sets: clamp(sets, 1, 200),
      weight: clamp(round(weight), 0, 99999),
      reps: clamp(reps, 1, 1000),
      base: { sets: base.sets, weight: base.weight, reps: base.reps },
    };
  });
}

// Auto routines: double progression (#28 rule change). Keep in sync with
// frontend/src/progression.ts; a parity test compares the two.
const to25 = (value: number) => Math.round(value / 2.5) * 2.5;
export const incrementFor = (weight: number) => Math.max(2.5, to25(weight * 0.05));
export const deloadWeight = (weight: number) => Math.max(0, to25(weight * 0.9));
type Level = { weight: number; reps: number };
type AutoExercise = RoutinePlan['splits'][number]['exercises'][number];
export function progressionStep(level: Level, ex: AutoExercise) {
  const max = ex.rep_max ?? 12;
  if (level.reps + 1 <= max)
    return { level: { ...level, reps: level.reps + 1 }, kind: 'reps' as const };
  // Bodyweight (0 kg) exercises only add reps; at the maximum they hold.
  if (level.weight === 0) return { level, kind: 'hold' as const };
  return {
    level: {
      weight: clamp(round(level.weight + incrementFor(level.weight)), 0, 99999),
      reps: ex.rep_min ?? 8,
    },
    kind: 'weight' as const,
  };
}

type Skeleton = Omit<PlanTarget, 'exercises'>;
type Placed = { target: Skeleton; date: string | null };

// For every exercise, walk the weeks in which its split is scheduled. A week's
// window runs from its first session to the next later-week session of the same
// split. A saved workout in the window with at least the planned number of sets
// at or above the target advances the target; a closed window without one holds
// it; an open window is projected as met. Deload weeks pause progression at 90%
// of the previous target weight with the same reps.
function autoExercises(
  plan: RoutinePlan,
  placed: Placed[],
  records: readonly WorkoutRecord[],
  today: string,
) {
  const out = new Map<number, TargetExercise[]>();
  const end = addDays(planEndDate(plan), 1);
  plan.splits.forEach((split, splitIndex) => {
    const occ = placed.filter((p) => p.target.split_index === splitIndex);
    const weeks = [...new Set(occ.map((o) => o.target.week))].sort((a, b) => a - b);
    for (const o of occ) out.set(o.target.order, []);
    split.exercises.forEach((ex) => {
      const key = exerciseKey(ex.exercise);
      let level: Level = { weight: ex.weight, reps: ex.reps };
      let kind: NonNullable<TargetExercise['kind']> = 'start';
      let previous: Level | null = null;
      for (const week of weeks) {
        const inWeek = occ.filter((o) => o.target.week === week);
        let target: Level;
        let result: TargetExercise['result'] = null;
        let shown: NonNullable<TargetExercise['kind']> = kind;
        if (week % 4 === 0) {
          const ref = previous ?? level;
          target = { weight: deloadWeight(ref.weight), reps: ref.reps };
          shown = 'deload';
        } else {
          const goal = level;
          target = goal;
          previous = goal;
          const dates = inWeek
            .map((o) => o.date)
            .filter((d): d is string => !!d)
            .sort();
          const start = dates[0];
          const stop =
            occ
              .filter((o) => o.target.week > week && o.date)
              .map((o) => o.date!)
              .sort()[0] ?? end;
          const met =
            !!start &&
            records.some(
              (r) =>
                exerciseKey(r.exercise) === key &&
                r.date >= start &&
                r.date < stop &&
                r.sets.filter(
                  (s) => s.completed !== false && s.weight >= goal.weight && s.reps >= goal.reps,
                ).length >= ex.sets,
            );
          if (met) result = 'achieved';
          else if (start && stop <= today) result = 'missed';
          if (result === 'missed') kind = 'hold';
          else {
            const step = progressionStep(level, ex);
            level = step.level;
            kind = step.kind;
          }
        }
        for (const o of inWeek)
          out.get(o.target.order)!.push({
            exercise: ex.exercise,
            sets: ex.sets,
            weight: target.weight,
            reps: target.reps,
            base: { sets: ex.sets, weight: ex.weight, reps: ex.reps },
            projected: !o.date || o.date > today,
            result,
            kind: shown,
          });
      }
    });
  });
  return out;
}

function skeletons(plan: RoutinePlan): Skeleton[] {
  return routineSchedule(plan).map((slot, index) => ({
    order: index + 1,
    week: slot.week,
    is_deload: slot.is_deload,
    split_index: slot.split_index,
    split_name: plan.splits[slot.split_index].name,
    change: plan.weeks?.find((w) => w.week === slot.week) ?? null,
  }));
}

// Targets keep plan order; rests only move which slot each target lands on.
// `records` and `today` matter only for auto routines.
export function arrangeTargets(
  plan: RoutinePlan,
  rests: readonly string[],
  records: readonly WorkoutRecord[] = [],
  today = '',
) {
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
    placed.map((p) => [
      p.target.order,
      {
        ...p.target,
        exercises: auto
          ? auto.get(p.target.order)!
          : weekExercises(plan, p.target.split_index, p.target.week),
      },
    ]),
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

export const planTargets = (plan: RoutinePlan) => {
  const { days, excluded } = arrangeTargets(plan, []);
  return [...days.flatMap((d) => (d.target ? [d.target] : [])), ...excluded];
};

// Returns the reason a rest cannot be chosen today, or null when it can.
export function restUnavailable(plan: RoutinePlan, rests: readonly string[], today: string) {
  if (rests.includes(today)) return '오늘은 이미 휴식일로 지정했습니다';
  const day = arrangeTargets(plan, rests).days.find((d) => d.date === today);
  if (today < plan.start_date || today > planEndDate(plan)) return '루틴 기간이 아닙니다';
  if (!day) return '오늘은 계획된 운동일이 아닙니다';
  if (!day.target) return '오늘 남은 계획 목표가 없습니다';
  return null;
}

export function restPreview(
  plan: RoutinePlan,
  rests: readonly string[],
  today: string,
  records: readonly WorkoutRecord[] = [],
) {
  if (restUnavailable(plan, rests, today)) return null;
  const before = arrangeTargets(plan, rests, records, today);
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

export function routineProgress(
  plan: RoutinePlan,
  rests: readonly string[],
  today: string,
  records: readonly WorkoutRecord[] = [],
) {
  const { days, excluded } = arrangeTargets(plan, rests, records, today);
  const end = planEndDate(plan);
  const inRange = today >= plan.start_date && today <= end;
  const currentWeek = inRange ? Math.floor(dayDiff(plan.start_date, today) / 7) + 1 : null;
  const unavailable = restUnavailable(plan, rests, today);
  return {
    today,
    start_date: plan.start_date,
    end_date: end,
    status: inRange ? 'active' : 'finished',
    progression: isAuto(plan) ? 'auto' : 'manual',
    current_week: currentWeek,
    today_plan: days.find((d) => d.date === today) ?? null,
    this_week: days.filter((d) => d.week === currentWeek),
    weeks: Array.from({ length: 12 }, (_, i) => i + 1).map((week) => ({
      week,
      is_deload: week % 4 === 0,
      change: plan.weeks?.find((w) => w.week === week) ?? null,
      entries: [
        ...days
          .filter((d) => d.target?.week === week)
          .map((d) => ({ date: d.date as string | null, excluded: false, target: d.target! })),
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
    rest_preview: unavailable ? null : restPreview(plan, rests, today, records),
  };
}
