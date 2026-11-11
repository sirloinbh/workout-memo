import { plural } from './labels';
// Routine goals (#28). Planned targets are shown per exercise exactly as planned;
// weights of different exercises are never summed. Only saved journals are records.
export type TargetExercise = {
  exercise: string;
  machine_id?: number | null;
  sets: number;
  weight: number;
  reps: number;
  base: { sets: number; weight: number; reps: number };
  projected?: boolean;
  result?: 'achieved' | 'missed' | null;
};
type Change = { week: number; kind: string; amount: number; deload_metric: string | null };
export type Target = {
  order: number;
  week: number;
  session?: number;
  is_deload: boolean;
  split_index: number;
  split_name: string;
  change: Change | null;
  exercises: TargetExercise[];
};
type Day = { date: string; week: number; rest: boolean; target: Target | null };
type Move = {
  order: number;
  week: number;
  is_deload: boolean;
  split_name: string;
  from: string;
  to: string | null;
};
export type Previous = { date: string; sets: { weight: number; reps: number }[] };
export type Progress = {
  today: string;
  routine: { id: number; name: string } | null;
  start_date?: string;
  end_date?: string;
  status?: string;
  progression?: 'manual' | 'auto';
  current_week?: number | null;
  today_plan?: Day | null;
  this_week?: Day[];
  weeks?: {
    week: number;
    is_deload?: boolean;
    change: Change | null;
    entries: { date: string | null; excluded: boolean; target: Target }[];
  }[];
  excluded?: Target[];
  rested_today?: boolean;
  can_rest?: boolean;
  rest_unavailable?: string | null;
  rest_preview?: { date: string; moves: Move[]; excluded: Target[] } | null;
  previous?: Record<string, Previous>;
};
type DraftSet = {
  exercise: string;
  machine_id: number | null;
  weight: number;
  reps: number;
  notes: string;
  completed: boolean;
  rpe: number | null;
};

export const kg = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
export const exerciseKey = (name: string) => name.trim().toLowerCase();
// Auto routines (#28 rule change) have no manual change; the target is computed.
export const changeLabel = (c: Change | null, deload = false) =>
  !c
    ? deload
      ? "Deload · auto (90% of last week's weight)"
      : 'Auto · double progressive overload'
    : c.kind === 'deload'
      ? `Deload · ${c.deload_metric === 'weight' ? 'Total weight' : c.deload_metric === 'sets' ? 'Sets' : 'Reps'} -${c.amount}${c.deload_metric === 'weight' ? ' kg' : ''}`
      : `${c.kind === 'increase_weight' ? 'Total weight' : 'Reps'} +${c.amount}${c.kind === 'increase_weight' ? ' kg' : ''}`;
export const targetLabel = (t: { week: number; is_deload: boolean; split_name: string }) =>
  `Week ${t.week}${t.is_deload ? ' deload' : ''} · ${t.split_name}`;
// Auto routines advance per session, so label the session within its week.
export const sessionLabel = (t: Target, auto: boolean) =>
  auto && t.session
    ? `Week ${t.week} session ${t.session}${t.is_deload ? ' deload' : ''} · ${t.split_name}`
    : targetLabel(t);
export const exerciseText = (e: {
  exercise: string;
  sets: number;
  weight: number;
  reps: number;
  projected?: boolean;
  result?: string | null;
}) =>
  `${e.exercise} ${plural(e.sets, 'set')} · total weight ${kg(e.weight)} kg · ${plural(e.reps, 'rep')}` +
  (e.result === 'achieved'
    ? ' · Achieved'
    : e.result === 'missed'
      ? ' · Not achieved (held)'
      : '') +
  (e.projected ? ' · Projected' : '');
export const previousText = (p: Previous | undefined) =>
  p
    ? `Previous ${p.date} · ${p.sets.map((s) => `${kg(s.weight)} kg × ${plural(s.reps, 'rep')}`).join(', ')}`
    : 'No previous record';

// A local journal draft prefilled from today's targets. It becomes a record only
// when the user saves it through the normal journal save flow. A planned machine
// is kept only while it is in the loaded machine list (#82).
export function routineDraft(progress: Progress | null, machineIds?: ReadonlySet<number>) {
  const target = progress?.routine && progress.today_plan?.target;
  if (!progress?.routine || !target) return null;
  const sets: DraftSet[] = target.exercises
    .flatMap((e) =>
      Array.from({ length: e.sets }, () => ({
        exercise: e.exercise,
        machine_id: e.machine_id != null && machineIds?.has(e.machine_id) ? e.machine_id : null,
        weight: e.weight,
        reps: e.reps,
        notes: '',
        // Targets are planned, not performed, until the user marks each set (#31).
        completed: false,
        rpe: null,
      })),
    )
    .slice(0, 200);
  return {
    date: progress.today,
    title: `${progress.routine.name} · ${target.split_name}`.slice(0, 120),
    notes: '',
    sets,
  };
}

// Reference shown next to a journal set whose exercise is in today's routine.
export function setReference(progress: Progress | null, exercise: string) {
  const key = exerciseKey(exercise);
  const planned = progress?.today_plan?.target?.exercises.find(
    (e) => exerciseKey(e.exercise) === key,
  );
  if (!planned) return null;
  return `Today's goal ${kg(planned.weight)} kg × ${plural(planned.reps, 'rep')} · ${previousText(progress?.previous?.[key])}`;
}
