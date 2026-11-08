import type { CardioGoal, CardioKind } from './domain.js';

// #116: cardio goal judgment (2026-11-08 user decisions D2~D5). Pure so it is tested without a
// database; the route feeds it the stored goals and the sessions dated up to today (Seoul).

export type CardioGoalSession = {
  date: string;
  kind: CardioKind;
  duration_sec: number;
  distance_km: number | null;
};
export type GoalPeriodResult = {
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
