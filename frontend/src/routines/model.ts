import { defaultWeightStep } from '../../../shared/contract';
import { type CardioItem } from '../routine-cardio';

// #88: 이두·삼두 replace 팔 for new choices; a saved 팔 still shows and can be removed.
export const parts = ['가슴', '등', '어깨', '이두', '삼두', '하체-앞', '하체-뒤', '복근'];
export const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export type Exercise = {
  exercise: string;
  machine_id?: number | null;
  sets: number | string;
  weight: number | string;
  reps: number | string;
  rep_min?: number | string;
  rep_max?: number | string;
};
// #117: a cardio item as the form holds it; numbers may be '' while typed.
export type Cardio = CardioItem;
export type Split = {
  name: string;
  body_parts: string[];
  exercises: Exercise[];
  cardio?: Cardio[];
};
export type Week = {
  week: number;
  kind: string;
  amount: number | string;
  deload_metric: string | null;
};
export type Plan = {
  id?: number;
  name: string;
  progression?: 'manual' | 'auto';
  start_date: string;
  split_count: number;
  weekly_workouts: number;
  rest_days: number[];
  schedule_mode?: 'weekday' | 'cycle';
  cycle?: { train_days: number | string; rest_days: number | string };
  splits: Split[];
  weeks?: Week[];
  schedule?: { date: string; week: number; split_index: number; is_deload: boolean }[];
};
// #28: new exercises default to 3 sets and an 8–12 rep range.
export const exercise = (): Exercise => ({
  exercise: '',
  machine_id: null,
  sets: 3,
  weight: '',
  reps: '',
  rep_min: 8,
  rep_max: 12,
});
export const split = (i: number): Split => ({
  name: `Split ${i + 1}`,
  body_parts: [],
  exercises: [exercise()],
});
// #88: picking a split count fills its training/rest cycle and default body parts.
export const legs = ['하체-앞', '하체-뒤'];
export const splitDefaults: Record<number, { train: number; rest: number; parts: string[][] }> = {
  1: { train: 2, rest: 1, parts: [parts] },
  2: {
    train: 2,
    rest: 1,
    parts: [
      ['등', '가슴', '이두', '삼두'],
      [...legs, '복근', '어깨'],
    ],
  },
  3: {
    train: 3,
    rest: 1,
    parts: [
      ['등', '이두'],
      [...legs, '복근'],
      ['가슴', '어깨', '삼두'],
    ],
  },
  4: {
    train: 4,
    rest: 1,
    parts: [['등'], ['가슴', '이두'], [...legs, '복근'], ['어깨', '삼두']],
  },
  5: { train: 5, rest: 2, parts: [['가슴'], ['등'], legs, ['어깨'], ['이두', '삼두', '복근']] },
};
export const sameParts = (a: string[], b: string[]) => a.join('|') === b.join('|');
// #385: a split count change fills only what the user has not changed. A split whose body parts
// are empty or still the previous count's defaults gets the new defaults; a customised split
// keeps its parts. The cycle is filled only in cycle mode, and only while it is unset or still
// the previous count's default.
export function withSplitDefaults(plan: Plan, count: number): Plan {
  const d = splitDefaults[count];
  const old = splitDefaults[plan.split_count];
  const untouched = (s: Split | undefined, i: number) =>
    !s || s.body_parts.length === 0 || (old && sameParts(s.body_parts, old.parts[i] ?? []));
  const cycleUntouched =
    !plan.cycle ||
    (old &&
      Number(plan.cycle.train_days) === old.train &&
      Number(plan.cycle.rest_days) === old.rest);
  return {
    ...plan,
    split_count: count,
    ...(plan.schedule_mode === 'cycle' && cycleUntouched
      ? { cycle: { train_days: d.train, rest_days: d.rest } }
      : {}),
    splits: Array.from({ length: count }, (_, i) => {
      const current = plan.splits[i];
      return {
        ...(current ?? split(i)),
        body_parts: current && !untouched(current, i) ? current.body_parts : [...d.parts[i]],
      };
    }),
  };
}
export const newPlan = (): Plan =>
  withSplitDefaults(
    {
      name: '',
      progression: 'auto',
      start_date: '',
      split_count: 1,
      weekly_workouts: 0,
      rest_days: [],
      schedule_mode: 'cycle',
      splits: [split(0)],
      weeks: Array.from({ length: 12 }, (_, i) => ({
        week: i + 1,
        kind: (i + 1) % 4 === 0 ? 'deload' : 'increase_weight',
        amount: '',
        deload_metric: null,
      })),
    },
    1,
  );
export const autoRule =
  "Enter your current performance (total weight and reps) and the 12-week goals are created automatically. Reps go up by 1 each session (workout day) of a split that includes the exercise; once the upper limit is exceeded, the total weight goes up by the exercise's increase step (default 5 kg, changeable per exercise in My Goals) and reps return to the lower limit. A split done 2-3 times a week advances 2-3 steps per week. Exercises at 0 kg (bodyweight) only increase reps. In weeks 4, 8, and 12, every session is a deload at 90% of the previous target weight (in 2.5 kg steps) with the same reps and does not advance, and the next session continues from the target before the deload. If you do not hit the goal in the journal saved between a session's date and the next session of the same split, the next session keeps the same goal.";
// The server receives only the fields of the chosen mode.
export function payload(plan: Plan) {
  const auto = plan.progression === 'auto';
  const cycle = plan.schedule_mode === 'cycle' && plan.cycle;
  return {
    ...plan,
    // A cycle has no rest weekdays; the weekly count is nominal (training days, at most 7).
    ...(cycle
      ? {
          rest_days: [],
          weekly_workouts: Math.min(7, Number(cycle.train_days) || 1),
          cycle: { train_days: Number(cycle.train_days), rest_days: Number(cycle.rest_days) },
        }
      : { schedule_mode: plan.schedule_mode, cycle: undefined }),
    progression: auto ? 'auto' : 'manual',
    weeks: auto ? undefined : plan.weeks,
    splits: plan.splits.map(({ cardio, ...s }) => ({
      ...s,
      // A free exercise omits machine_id, so plans without machines keep their shape.
      exercises: s.exercises.map(({ rep_min, rep_max, machine_id, ...rest }) => {
        const value = machine_id == null ? rest : { ...rest, machine_id };
        return auto ? { ...value, rep_min, rep_max } : value;
      }),
      // #117: a split without cardio keeps the older plan shape.
      ...(cardio?.length ? { cardio: cardio.map(cardioPayload) } : {}),
    })),
  };
}
// Only the fields of the item's kind of target, as numbers (the inputs are required).
export const cardioPayload = ({ kind, intensity, minutes, distance_km, interval }: Cardio) =>
  interval
    ? {
        kind,
        intensity,
        interval: {
          repeats: Number(interval.repeats),
          work_sec: Number(interval.work_sec),
          recovery_sec: Number(interval.recovery_sec),
        },
      }
    : minutes !== undefined
      ? { kind, intensity, minutes: Number(minutes) }
      : { kind, intensity, distance_km: Number(distance_km) };

// #86: each exercise's increment comes from the user's per-exercise settings.
export type Steps = Record<string, number>;
export const stepOf = (steps: Steps, name: string) =>
  steps[name.trim().toLowerCase()] ?? defaultWeightStep;
export const withSteps = (plan: Plan, steps: Steps) => ({
  ...plan,
  splits: plan.splits.map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => ({ ...e, weight_step: stepOf(steps, e.exercise) })),
  })),
});

export type Machine = { id: number; brand: string; name: string };
export const machineName = (machines: Machine[], id: number | null | undefined) => {
  const m = id == null ? undefined : machines.find((v) => v.id === id);
  return m ? `${m.brand} · ${m.name}` : null;
};
// #105 (decided 2026-11-10): four steps over one draft; the save API is unchanged.
export const routineSteps = ['Basics', 'Schedule', 'Splits and exercises', 'Goals'] as const;
export const stepName = (name: (typeof routineSteps)[number], plan: Plan) =>
  name !== 'Goals' ? name : plan.progression === 'auto' ? '12-week preview' : 'Weekly goals';
export const goalLabel = (w: Week) =>
  w.kind === 'deload'
    ? `Deload · ${w.deload_metric === 'weight' ? 'Total weight kg' : w.deload_metric === 'sets' ? 'Sets' : 'Reps'} -${w.amount}`
    : `${w.kind === 'increase_weight' ? 'Total weight kg' : 'Reps'} +${w.amount}`;
