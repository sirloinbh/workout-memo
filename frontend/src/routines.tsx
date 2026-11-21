import { Plus } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import {
  type CardioKind,
  cardioKinds,
  cardioWeeklyTargets,
  defaultWeightStep,
  routineCardioIntensities,
  type RoutineCardioIntensity,
} from '../../shared/contract';
import { cardioKindLabels } from './cardio/format';
import { AlertBanner } from './components/alert-banner';
import { Button } from './components/ui/button';
import { Card, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Combobox } from './components/ui/combobox';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonList } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { SimilarNameHint } from './exercise-names';
import { bodyPartLabel, plural } from './labels';
import { requestJson } from './lib/api';
import { cn } from './lib/utils';
import { byWeek, kindLabel, previewTargets } from './progression';
import { type CardioItem, cardioLabel, cardioUnit, intensityLabels } from './routine-cardio';

// #102: the routine form on the common components. Selects stay native like the journal's
// machine select (#101): the tests and the "Free workout" empty value rely on a real <select>.
const fieldLabel = 'flex-col items-stretch gap-1.5 text-meta font-normal text-muted-foreground';
// The common Input drops to 14px from 768px; touch screens keep 16px so iOS does not zoom (#104).
const touchText = 'md:pointer-coarse:text-base';
const nativeSelect =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 md:text-body-sm md:pointer-coarse:text-base dark:bg-input/30';
const hint = 'rounded-md bg-muted p-3 text-meta text-muted-foreground';
const box = 'my-5 min-w-0 rounded-xl border p-4';
const legend = 'px-1 text-body-sm font-semibold text-foreground';
const list = 'mt-2 space-y-1.5 pl-1 text-body-sm';

// #88: 이두·삼두 replace 팔 for new choices; a saved 팔 still shows and can be removed.
const parts = ['가슴', '등', '어깨', '이두', '삼두', '하체-앞', '하체-뒤', '복근'];
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Exercise = {
  exercise: string;
  machine_id?: number | null;
  sets: number | string;
  weight: number | string;
  reps: number | string;
  rep_min?: number | string;
  rep_max?: number | string;
};
// #117: a cardio item as the form holds it; numbers may be '' while typed.
type Cardio = CardioItem;
type Split = { name: string; body_parts: string[]; exercises: Exercise[]; cardio?: Cardio[] };
type Week = { week: number; kind: string; amount: number | string; deload_metric: string | null };
type Plan = {
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
const exercise = (): Exercise => ({
  exercise: '',
  machine_id: null,
  sets: 3,
  weight: '',
  reps: '',
  rep_min: 8,
  rep_max: 12,
});
const split = (i: number): Split => ({
  name: `Split ${i + 1}`,
  body_parts: [],
  exercises: [exercise()],
});
// #88: picking a split count fills its training/rest cycle and default body parts.
const legs = ['하체-앞', '하체-뒤'];
const splitDefaults: Record<number, { train: number; rest: number; parts: string[][] }> = {
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
const sameParts = (a: string[], b: string[]) => a.join('|') === b.join('|');
// #385: a split count change fills only what the user has not changed. A split whose body parts
// are empty or still the previous count's defaults gets the new defaults; a customised split
// keeps its parts. The cycle is filled only in cycle mode, and only while it is unset or still
// the previous count's default.
function withSplitDefaults(plan: Plan, count: number): Plan {
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
const newPlan = (): Plan =>
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
const autoRule =
  "Enter your current performance (total weight and reps) and the 12-week goals are created automatically. Reps go up by 1 each session (workout day) of a split that includes the exercise; once the upper limit is exceeded, the total weight goes up by the exercise's increase step (default 5 kg, changeable per exercise in My Goals) and reps return to the lower limit. A split done 2-3 times a week advances 2-3 steps per week. Exercises at 0 kg (bodyweight) only increase reps. In weeks 4, 8, and 12, every session is a deload at 90% of the previous target weight (in 2.5 kg steps) with the same reps and does not advance, and the next session continues from the target before the deload. If you do not hit the goal in the journal saved between a session's date and the next session of the same split, the next session keeps the same goal.";
// The server receives only the fields of the chosen mode.
function payload(plan: Plan) {
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
const cardioPayload = ({ kind, intensity, minutes, distance_km, interval }: Cardio) =>
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
// #117: each split's cardio items with their 12 weekly targets (all modes; intervals are fixed).
function CardioPreview({ splits }: { splits: Split[] }) {
  const items = splits.flatMap((s) => (s.cardio ?? []).map((c) => ({ split: s.name, item: c })));
  if (!items.length) return null;
  return (
    <section data-slot="routine-cardio-preview" className="my-5 rounded-xl border p-4">
      <h4 className="mb-2 text-body-sm font-semibold">Cardio · 12 weeks</h4>
      <p className="mb-2 text-meta text-muted-foreground">
        Done after the split&apos;s strength work. Time or distance goes up 10% a week; weeks 4, 8
        and 12 are deloads at 80% of the week before. Intervals keep their repeats.
      </p>
      <ul className={list}>
        {items.map(({ split, item }, i) => {
          const weeks =
            item.interval || item.minutes === '' || item.distance_km === ''
              ? null
              : cardioWeeklyTargets(cardioPayload(item));
          return (
            <li key={i} className="[overflow-wrap:anywhere]">
              <span className="font-medium">
                {split} · {cardioLabel(item)}
              </span>
              {weeks && (
                <span className="block text-meta text-muted-foreground">
                  {weeks
                    .map(
                      (w) =>
                        `Week ${w.week}${w.deload ? ' deload' : ''} ${w.target} ${cardioUnit(item)}`,
                    )
                    .join(', ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
// #86: each exercise's increment comes from the user's per-exercise settings.
type Steps = Record<string, number>;
const stepOf = (steps: Steps, name: string) =>
  steps[name.trim().toLowerCase()] ?? defaultWeightStep;
const withSteps = (plan: Plan, steps: Steps) => ({
  ...plan,
  splits: plan.splits.map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => ({ ...e, weight_step: stepOf(steps, e.exercise) })),
  })),
});
// #102: native <details> stay (components/ui has no accordion); the deload weeks are marked
// with data-deload and a stronger text colour instead of the old .deload class.
// In the form it sits under the step's h3 (#105), in the plan view under the plan's h3.
function Preview({ plan, steps }: { plan: Plan; steps: Steps }) {
  const preview = previewTargets(withSteps(plan, steps));
  if (!preview)
    return (
      <p className={cn(hint, 'my-5')}>
        Enter a start date and a schedule (cycle or rest weekdays) to see the 12-week projected
        goals.
      </p>
    );
  return (
    <section data-slot="routine-preview" className="my-5 rounded-xl border p-4">
      <h4 className="mb-2 text-body-sm font-semibold">
        12-week projected goals · may change with your records
      </h4>
      {preview.map((split, i) =>
        split
          .filter((ex) => ex.exercise.trim())
          .map((ex, j) => (
            <details key={`${i}-${j}`} open className="border-t first-of-type:border-t-0">
              <summary className="cursor-pointer py-2 text-body-sm font-medium [overflow-wrap:anywhere] pointer-coarse:py-3">
                {plan.splits[i].name} · {ex.exercise}
              </summary>
              <ol className="mb-3 space-y-1.5 pl-1 text-meta text-muted-foreground">
                {byWeek(ex.rows).map((w) => (
                  <li
                    key={w.week}
                    data-deload={w.week % 4 === 0 || undefined}
                    className="[overflow-wrap:anywhere] data-deload:font-medium data-deload:text-foreground"
                  >
                    {`Week ${w.week}${w.week % 4 === 0 ? ' deload' : ''}: `}
                    {w.rows
                      .map(
                        (r) =>
                          `Session ${r.session} ${String(r.weight)} kg × ${plural(r.reps, 'rep')} (${kindLabel(r)})`,
                      )
                      .join(', ')}
                  </li>
                ))}
              </ol>
            </details>
          )),
      )}
    </section>
  );
}
const request = <T,>(path: string, body?: unknown) =>
  requestJson<T>('/api/routines' + path, { method: body ? 'POST' : 'GET', body });
type Machine = { id: number; brand: string; name: string };
const machineName = (machines: Machine[], id: number | null | undefined) => {
  const m = id == null ? undefined : machines.find((v) => v.id === id);
  return m ? `${m.brand} · ${m.name}` : null;
};
// #105 (decided 2026-11-10): four steps over one draft; the save API is unchanged.
const routineSteps = ['Basics', 'Schedule', 'Splits and exercises', 'Goals'] as const;
const stepName = (name: (typeof routineSteps)[number], plan: Plan) =>
  name !== 'Goals' ? name : plan.progression === 'auto' ? '12-week preview' : 'Weekly goals';
const goalLabel = (w: Week) =>
  w.kind === 'deload'
    ? `Deload · ${w.deload_metric === 'weight' ? 'Total weight kg' : w.deload_metric === 'sets' ? 'Sets' : 'Reps'} -${w.amount}`
    : `${w.kind === 'increase_weight' ? 'Total weight kg' : 'Reps'} +${w.amount}`;

// #124: exercise name candidates come from the page (GET /api/exercise-names plus local names).
export function Routines({ exerciseNames = [] }: { exerciseNames?: readonly string[] }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Steps>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  // #105: the form is entered one step at a time; only earlier steps can be revisited.
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const movedAt = useRef(0);
  useEffect(() => {
    // Focus follows a step change (not the form opening) so the new step is announced.
    if (moved.current) stepHeading.current?.focus();
    moved.current = false;
  }, [step]);
  const goTo = (next: number) => {
    moved.current = true;
    movedAt.current = performance.now();
    setStep(next);
  };
  // #173: the plan being opened, so its button shows it is waiting.
  const [opening, setOpening] = useState<number | null>(null);
  // #312, #323: what waits for the user to discard the open draft (a saved plan, or 'new' for a
  // fresh draft), and the button that asked.
  const [replacing, setReplacing] = useState<Plan | 'new' | null>(null);
  // The dialog wording, kept after replacing clears so the closing dialog does not switch text.
  const [asking, setAsking] = useState<'plan' | 'new'>('plan');
  const askToReplace = (next: Plan | 'new') => {
    setAsking(next === 'new' ? 'new' : 'plan');
    setReplacing(next);
  };
  const askedFrom = useRef<HTMLButtonElement | null>(null);
  const startDraft = () => {
    setDraft(newPlan());
    setStep(0);
    setSelected(null);
    setError('');
    setSavedId(null);
  };
  const openPlan = (p: Plan) => {
    setError('');
    setOpening(p.id!);
    void request<Plan>('/' + p.id)
      .then((value) => {
        setSelected(value);
        setDraft(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setOpening(null));
  };
  useEffect(() => {
    let active = true;
    void requestJson<{ exercise: string; weight_step: number }[]>('/api/exercise-weight-steps')
      .then((rows: { exercise: string; weight_step: number }[]) => {
        if (active && Array.isArray(rows))
          setSteps(Object.fromEntries(rows.map((r) => [r.exercise, r.weight_step])));
      })
      .catch(() => undefined);
    // #82: machines are optional; a failed load only leaves the select empty.
    void requestJson<Machine[]>('/api/machines')
      .then((m) => {
        if (active && Array.isArray(m)) setMachines(m);
      })
      .catch(() => undefined);
    request<Plan[]>('')
      .then((p) => {
        if (active) setPlans(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const changeSplit = (index: number, value: Split) => {
    if (draft)
      setDraft({ ...draft, splits: draft.splits.map((s, i) => (i === index ? value : s)) });
  };
  const setExercise = (i: number, s: Split, j: number, value: Partial<Exercise>) =>
    changeSplit(i, {
      ...s,
      exercises: s.exercises.map((v, k) => (k === j ? { ...v, ...value } : v)),
    });
  return (
    <section data-slot="routine-page">
      <h2 className="mb-2 text-body font-semibold">Routine Builder · 12-week plan</h2>
      <p className="text-body-sm text-muted-foreground">
        Splits rotate on each workout day, and weeks 4, 8, and 12 are deload weeks. Auto goals
        calculate the 12-week goals from your current performance, and for manual goals you enter
        the weekly changes yourself.
      </p>
      <p className="mb-4 text-body-sm text-muted-foreground">
        A plan is only a goal. Record what you actually did separately in the workout journal.
      </p>
      {/* An open form shows its error beside its buttons, on whichever step it is. */}
      {error && !draft && <AlertBanner>{error}</AlertBanner>}
      <Notice
        className="mb-3"
        notice={
          savedId !== null ? { kind: 'status', text: `Routine #${savedId} saved.` } : undefined
        }
      />
      <Button
        // A plan still opening would close the new draft when it arrives.
        disabled={saving || opening !== null}
        onClick={(e) => {
          askedFrom.current = e.currentTarget;
          if (draft) askToReplace('new');
          else startDraft();
        }}
      >
        <Plus aria-hidden />
        Create new routine
      </Button>
      {/* #173: row placeholders while the saved routines first load (reloads after a save do not
          show a loading state); the status line is for screen readers. */}
      {loading && (
        <div aria-busy="true" aria-label="Saved routines" className="mt-3 rounded-lg border p-4">
          <Notice className="sr-only" notice={{ kind: 'status', text: 'Loading routines…' }} />
          <SkeletonList rows={2} />
        </div>
      )}
      {!loading && !plans.length && (
        <p className="mt-3 text-body-sm text-muted-foreground">No saved routines.</p>
      )}
      {plans.length > 0 && (
        <ul data-slot="plan-list" className="mt-3 divide-y rounded-lg border">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 text-body-sm [overflow-wrap:anywhere]">{p.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={saving || opening !== null}
                aria-busy={opening === p.id || undefined}
                onClick={(e) => {
                  askedFrom.current = e.currentTarget;
                  if (draft) askToReplace(p);
                  else openPlan(p);
                }}
              >
                {opening === p.id && <Spinner size="sm" aria-hidden />}
                View plan
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(open) => !open && setReplacing(null)}
        title="Discard the new routine you are entering?"
        description={
          asking === 'new'
            ? 'Starting over clears the new routine form, and what you entered is not saved.'
            : 'Opening this plan closes the new routine form, and what you entered is not saved.'
        }
        confirmLabel={asking === 'new' ? 'Discard and start over' : 'Discard and view plan'}
        cancelLabel="Keep editing"
        returnFocusRef={askedFrom}
        onConfirm={() => {
          if (replacing === 'new') startDraft();
          else if (replacing) openPlan(replacing);
        }}
      />
      {draft && (
        <Card className="mt-5 gap-0 px-4 py-5 shadow-none md:px-6 md:py-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saving) return;
              // Before the last step a submit (Next or Enter) only moves on. Only the current
              // step's fields are rendered, so the browser checks just those first.
              if (step < routineSteps.length - 1) {
                goTo(step + 1);
                return;
              }
              // Save takes Next's place, so a double tap on Next would save at once.
              if (performance.now() - movedAt.current < 400) return;
              setSaving(true);
              setError('');
              void request<{ id: number }>('', payload(draft))
                .then(async (result) => {
                  // The POST has succeeded even if a subsequent read fails.
                  // Close this draft so retrying a read cannot duplicate the plan.
                  const saved = { ...(payload(draft) as Plan), id: result.id };
                  setSavedId(result.id);
                  setDraft(null);
                  setSelected(saved);
                  setPlans((previous) => [saved, ...previous]);
                  const detail = await request<Plan>('/' + result.id);
                  setPlans(await request<Plan[]>(''));
                  setSelected(detail);
                })
                .catch((e) => setError(e.message))
                .finally(() => setSaving(false));
            }}
          >
            <nav aria-label="Routine steps">
              <ol data-slot="routine-steps" className="mb-4 flex flex-wrap gap-2">
                {routineSteps.map((name, i) => (
                  <li key={name}>
                    {i < step ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => goTo(i)}>
                        {i + 1}. {stepName(name, draft)}
                      </Button>
                    ) : (
                      // The current and later steps are not links: later ones open through Next.
                      <span
                        aria-current={i === step ? 'step' : undefined}
                        className={cn(
                          'inline-flex min-h-8 items-center rounded-md px-3 text-body-sm',
                          i === step
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {i + 1}. {stepName(name, draft)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            <h3
              ref={stepHeading}
              tabIndex={-1}
              className="mb-3 text-body font-semibold outline-none"
            >
              Step {step + 1} of {routineSteps.length} · {stepName(routineSteps[step], draft)}
            </h3>
            {step === 0 && (
              <>
                <Label className={cn(fieldLabel, 'mb-3')}>
                  Weekly goal mode
                  <select
                    className={nativeSelect}
                    value={draft.progression ?? 'manual'}
                    onChange={(e) =>
                      setDraft({ ...draft, progression: e.target.value as 'manual' | 'auto' })
                    }
                  >
                    <option value="auto">Auto · double progressive overload</option>
                    <option value="manual">Manual · Enter by week</option>
                  </select>
                </Label>
                {draft.progression === 'auto' && <p className={cn(hint, 'mb-3')}>{autoRule}</p>}
                <Label className={cn(fieldLabel, 'mb-3')}>
                  Routine name
                  <Input
                    className={touchText}
                    required
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Label>
                <Label className={fieldLabel}>
                  Start date
                  <Input
                    className={touchText}
                    required
                    type="date"
                    value={draft.start_date}
                    onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                  />
                </Label>
              </>
            )}
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
                  <Label className={fieldLabel}>
                    Split type
                    <select
                      className={nativeSelect}
                      value={draft.split_count}
                      onChange={(e) => setDraft(withSplitDefaults(draft, Number(e.target.value)))}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? 'No split' : `${n}-day split`}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label className={fieldLabel}>
                    Workout schedule type
                    <select
                      className={nativeSelect}
                      value={draft.schedule_mode ?? 'weekday'}
                      onChange={(e) =>
                        setDraft({ ...draft, schedule_mode: e.target.value as 'weekday' | 'cycle' })
                      }
                    >
                      <option value="cycle">Cycle · N days on, then M days off</option>
                      <option value="weekday">Weekdays · Set rest weekdays</option>
                    </select>
                  </Label>
                  {draft.schedule_mode === 'cycle' ? (
                    <>
                      <Label className={fieldLabel}>
                        Consecutive workout days
                        <Input
                          className={touchText}
                          required
                          type="number"
                          min={1}
                          max={7}
                          value={draft.cycle?.train_days ?? ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              cycle: { rest_days: 1, ...draft.cycle, train_days: e.target.value },
                            })
                          }
                        />
                      </Label>
                      <Label className={fieldLabel}>
                        Consecutive rest days
                        <Input
                          className={touchText}
                          required
                          type="number"
                          min={0}
                          max={7}
                          value={draft.cycle?.rest_days ?? ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              cycle: { train_days: 1, ...draft.cycle, rest_days: e.target.value },
                            })
                          }
                        />
                      </Label>
                    </>
                  ) : (
                    <Label className={fieldLabel}>
                      Workouts per week
                      <Input
                        className={touchText}
                        required
                        type="number"
                        min={1}
                        max={7}
                        value={draft.weekly_workouts || ''}
                        onChange={(e) =>
                          setDraft({ ...draft, weekly_workouts: Number(e.target.value) })
                        }
                      />
                    </Label>
                  )}
                </div>
                {draft.schedule_mode === 'cycle' ? (
                  <p className={cn(hint, 'mt-3')}>
                    Workout days and rest days repeat from the start date. Choosing a split type
                    fills in the default cycle and body parts, and you can change them.
                  </p>
                ) : (
                  <fieldset className={box}>
                    <legend className={legend}>
                      Rest weekdays · Workouts plus rest total 7 days
                    </legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {days.map((day, i) => (
                        <Label
                          key={day}
                          className="min-h-9 gap-2 text-body-sm pointer-coarse:min-h-11"
                        >
                          <Checkbox
                            id={`rest-day-${i}`}
                            // The box stays 16px against the legacy 44px button rule; the common
                            // Checkbox gives the 44px tap area (#271).
                            className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
                            checked={draft.rest_days.includes(i)}
                            onCheckedChange={(checked) =>
                              setDraft({
                                ...draft,
                                rest_days:
                                  checked === true
                                    ? [...draft.rest_days, i].sort()
                                    : draft.rest_days.filter((d) => d !== i),
                              })
                            }
                          />
                          {day}
                        </Label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}
            {step === 2 &&
              draft.splits.map((s, i) => (
                <fieldset key={i} className={box}>
                  <legend className={legend}>Split {i + 1}</legend>
                  <Label className={fieldLabel}>
                    Split name
                    <Input
                      className={touchText}
                      required
                      value={s.name}
                      maxLength={120}
                      onChange={(e) => changeSplit(i, { ...s, name: e.target.value })}
                    />
                  </Label>
                  <p className="mt-3 mb-2 text-meta text-muted-foreground">
                    Each time you tap a body part button it is added in order. You can add the same
                    part more than once.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {parts.map((p) => (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        key={p}
                        onClick={() => changeSplit(i, { ...s, body_parts: [...s.body_parts, p] })}
                      >
                        Add {bodyPartLabel(p)}
                      </Button>
                    ))}
                  </div>
                  <ol data-slot="split-parts" className="mt-2 flex flex-wrap gap-2">
                    {s.body_parts.map((p, j) => (
                      <li
                        key={j}
                        className="flex items-center gap-1 rounded-full border pl-3 text-body-sm"
                      >
                        {bodyPartLabel(p)}{' '}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          aria-label={`Delete split ${i + 1} body part ${j + 1}`}
                          onClick={() =>
                            changeSplit(i, {
                              ...s,
                              body_parts: s.body_parts.filter((_, k) => j !== k),
                            })
                          }
                        >
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {s.exercises.map((ex, j) => (
                    <div
                      data-slot="routine-exercise"
                      className="mt-3 grid grid-cols-2 items-end gap-3 border-t pt-3 md:grid-cols-3"
                      key={j}
                    >
                      {/* The hint stays in the name's grid cell. The row aligns cells at the bottom, so on
                          wide screens name and Machine (one-line labels) align at the top instead and a
                          shown hint does not lift the name field above Machine. */}
                      <div className="col-span-2 md:col-span-1 md:self-start">
                        <Label className={fieldLabel}>
                          Exercise name
                          {/* #124: the same suggestions as the journal and goals. */}
                          <Combobox
                            className={touchText}
                            required
                            maxLength={120}
                            value={ex.exercise}
                            options={exerciseNames}
                            listLabel="Previously used names"
                            onValueChange={(name) => setExercise(i, s, j, { exercise: name })}
                          />
                        </Label>
                        <SimilarNameHint
                          value={ex.exercise}
                          names={exerciseNames}
                          onReplace={(name) => setExercise(i, s, j, { exercise: name })}
                        />
                      </div>
                      <Label className={cn(fieldLabel, 'col-span-2 md:self-start')}>
                        Machine
                        <select
                          className={nativeSelect}
                          value={ex.machine_id ?? ''}
                          onChange={(e) =>
                            setExercise(i, s, j, {
                              machine_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">Free workout</option>
                          {machines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.brand} · {m.name}
                            </option>
                          ))}
                        </select>
                      </Label>
                      {(draft.progression === 'auto'
                        ? (['sets', 'weight', 'reps', 'rep_min', 'rep_max'] as const)
                        : (['sets', 'weight', 'reps'] as const)
                      ).map((key) => (
                        <Label key={key} className={fieldLabel}>
                          {draft.progression === 'auto'
                            ? {
                                sets: 'Number of sets',
                                weight: 'Current total weight (kg, including machine base weight)',
                                reps: 'Current reps',
                                rep_min: 'Lower reps',
                                rep_max: 'Upper reps',
                              }[key]
                            : key === 'sets'
                              ? 'Reference sets'
                              : key === 'weight'
                                ? 'Reference total weight (kg, including machine base weight)'
                                : 'Reference reps'}
                          <Input
                            className={touchText}
                            required
                            type="number"
                            min={key === 'weight' ? 0 : 1}
                            max={key === 'weight' ? 99999 : key === 'sets' ? 200 : 1000}
                            step={key === 'weight' ? 'any' : 1}
                            value={ex[key] ?? ''}
                            onChange={(e) =>
                              setExercise(i, s, j, {
                                [key]: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                          />
                        </Label>
                      ))}
                      <div className="col-span-2 flex items-end md:col-span-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={s.exercises.length === 1}
                          onClick={() =>
                            changeSplit(i, {
                              ...s,
                              exercises: s.exercises.filter((_, k) => k !== j),
                            })
                          }
                        >
                          Delete exercise
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    onClick={() =>
                      changeSplit(i, { ...s, exercises: [...s.exercises, exercise()] })
                    }
                  >
                    <Plus aria-hidden />
                    Add exercise
                  </Button>
                  {/* #117: cardio done after this split's strength work. */}
                  {(s.cardio ?? []).map((c, j) => {
                    const setCardio = (value: Cardio) =>
                      changeSplit(i, {
                        ...s,
                        cardio: s.cardio!.map((v, k) => (k === j ? value : v)),
                      });
                    const number = (v: string) => (v === '' ? '' : Number(v));
                    // The same names repeat per item and split; screen readers hear which one.
                    // The space stays outside the hidden span, or the name reads "Intensity(split".
                    const where = (
                      <>
                        {' '}
                        <span className="sr-only">
                          (split {i + 1}, cardio {j + 1})
                        </span>
                      </>
                    );
                    return (
                      <div
                        data-slot="routine-cardio"
                        key={j}
                        className="mt-3 grid grid-cols-2 items-end gap-3 border-t pt-3 md:grid-cols-3"
                      >
                        <Label className={fieldLabel}>
                          Cardio type{where}
                          <select
                            className={nativeSelect}
                            value={c.kind}
                            onChange={(e) =>
                              setCardio({ ...c, kind: e.target.value as CardioKind })
                            }
                          >
                            {cardioKinds.map((k) => (
                              <option key={k} value={k}>
                                {cardioKindLabels[k]}
                              </option>
                            ))}
                          </select>
                        </Label>
                        <Label className={fieldLabel}>
                          Intensity{where}
                          <select
                            className={nativeSelect}
                            value={c.intensity}
                            onChange={(e) => {
                              const intensity = e.target.value as RoutineCardioIntensity;
                              // An interval item has repeats instead of a time or distance.
                              // The typed target stays in the form (not sent while it is an
                              // interval), so switching back does not lose it.
                              if (intensity === 'interval')
                                setCardio({
                                  ...c,
                                  intensity,
                                  interval: c.interval ?? {
                                    repeats: 6,
                                    work_sec: 60,
                                    recovery_sec: 60,
                                  },
                                });
                              else {
                                const next: Cardio = { ...c, intensity };
                                delete next.interval;
                                if (next.minutes === undefined && next.distance_km === undefined)
                                  next.minutes = '';
                                setCardio(next);
                              }
                            }}
                          >
                            {routineCardioIntensities.map((v) => (
                              <option key={v} value={v}>
                                {intensityLabels[v]}
                              </option>
                            ))}
                          </select>
                        </Label>
                        {c.interval ? (
                          (['repeats', 'work_sec', 'recovery_sec'] as const).map((key) => (
                            <Label key={key} className={fieldLabel}>
                              {
                                {
                                  repeats: 'Repeats',
                                  work_sec: 'Work seconds',
                                  recovery_sec: 'Recovery seconds',
                                }[key]
                              }
                              {where}
                              <Input
                                className={touchText}
                                required
                                type="number"
                                min={key === 'repeats' ? 1 : key === 'work_sec' ? 5 : 0}
                                max={key === 'repeats' ? 50 : 3600}
                                value={c.interval![key]}
                                onChange={(e) =>
                                  setCardio({
                                    ...c,
                                    interval: { ...c.interval!, [key]: number(e.target.value) },
                                  })
                                }
                              />
                            </Label>
                          ))
                        ) : (
                          <>
                            <Label className={fieldLabel}>
                              Target{where}
                              <select
                                className={nativeSelect}
                                value={c.minutes !== undefined ? 'time' : 'distance'}
                                onChange={(e) =>
                                  setCardio(
                                    e.target.value === 'time'
                                      ? { kind: c.kind, intensity: c.intensity, minutes: '' }
                                      : { kind: c.kind, intensity: c.intensity, distance_km: '' },
                                  )
                                }
                              >
                                <option value="time">Time</option>
                                <option value="distance">Distance</option>
                              </select>
                            </Label>
                            {c.minutes !== undefined ? (
                              <Label className={fieldLabel}>
                                Week 1 minutes{where}
                                <Input
                                  className={touchText}
                                  required
                                  type="number"
                                  min={1}
                                  max={600}
                                  value={c.minutes}
                                  onChange={(e) =>
                                    setCardio({ ...c, minutes: number(e.target.value) })
                                  }
                                />
                              </Label>
                            ) : (
                              <Label className={fieldLabel}>
                                Week 1 km{where}
                                <Input
                                  className={touchText}
                                  required
                                  type="number"
                                  min={0.1}
                                  max={500}
                                  step={0.1}
                                  value={c.distance_km}
                                  onChange={(e) =>
                                    setCardio({ ...c, distance_km: number(e.target.value) })
                                  }
                                />
                              </Label>
                            )}
                          </>
                        )}
                        <div className="col-span-2 flex items-end md:col-span-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Delete split ${i + 1} cardio ${j + 1}`}
                            onClick={() =>
                              changeSplit(i, {
                                ...s,
                                cardio: s.cardio!.filter((_, k) => k !== j),
                              })
                            }
                          >
                            Delete cardio
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="secondary"
                    // Beside Add exercise until cardio items come between them.
                    className={cn('mt-3', !s.cardio?.length && 'ml-2')}
                    disabled={(s.cardio?.length ?? 0) >= 10}
                    onClick={() =>
                      changeSplit(i, {
                        ...s,
                        cardio: [
                          ...(s.cardio ?? []),
                          { kind: 'running', intensity: 'zone2', minutes: '' },
                        ],
                      })
                    }
                  >
                    <Plus aria-hidden />
                    Add cardio
                  </Button>
                </fieldset>
              ))}
            {step === 3 && draft.progression === 'auto' && (
              <>
                {/* The rule from step 1 again, beside the targets it produces. */}
                <p className={hint}>{autoRule}</p>
                <Preview plan={draft} steps={steps} />
              </>
            )}
            {step === 3 && <CardioPreview splits={draft.splits} />}
            {step === 3 &&
              draft.progression !== 'auto' &&
              draft.weeks?.map((w, i) => (
                <fieldset key={w.week} className={cn(box, 'grid grid-cols-2 gap-3')}>
                  <legend className={legend}>
                    Week {w.week} {w.kind === 'deload' ? 'Deload' : 'Increase goal'}
                  </legend>
                  <Label className={fieldLabel}>
                    {w.kind === 'deload' ? 'Decrease target' : 'Increase target'}
                    <select
                      className={nativeSelect}
                      required
                      value={w.kind === 'deload' ? (w.deload_metric ?? '') : w.kind}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          weeks: draft.weeks!.map((v, k) =>
                            k === i
                              ? {
                                  ...v,
                                  amount: '',
                                  ...(v.kind === 'deload'
                                    ? { deload_metric: e.target.value }
                                    : { kind: e.target.value }),
                                }
                              : v,
                          ),
                        })
                      }
                    >
                      {w.kind === 'deload' ? (
                        <>
                          <option value="" disabled>
                            Choose decrease target
                          </option>
                          <option value="weight">Total weight (kg)</option>
                          <option value="sets">Number of sets</option>
                          <option value="reps">Reps</option>
                        </>
                      ) : (
                        <>
                          <option value="increase_weight">Total weight (kg)</option>
                          <option value="increase_reps">Reps</option>
                        </>
                      )}
                    </select>
                  </Label>
                  <Label className={fieldLabel}>
                    {w.kind === 'deload' ? 'Decrease amount' : 'Increase amount'}
                    <Input
                      className={touchText}
                      required
                      type="number"
                      min={
                        w.kind === 'increase_weight' || w.deload_metric === 'weight'
                          ? '0.000001'
                          : 1
                      }
                      max={
                        w.deload_metric === 'sets'
                          ? 200
                          : w.kind === 'increase_reps' || w.deload_metric === 'reps'
                            ? 1000
                            : 99999
                      }
                      step={
                        w.kind === 'increase_weight' || w.deload_metric === 'weight' ? 'any' : 1
                      }
                      value={w.amount}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          weeks: draft.weeks!.map((v, k) =>
                            k === i
                              ? {
                                  ...v,
                                  amount: e.target.value === '' ? '' : Number(e.target.value),
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  </Label>
                </fieldset>
              ))}
            {/* #105: a server check can be about an earlier step, which the step list reaches. */}
            {error && <AlertBanner className="mt-5 mb-0">{error}</AlertBanner>}
            <div className="mt-5 flex flex-wrap gap-2">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => goTo(step - 1)}
                >
                  Previous
                </Button>
              )}
              {step < routineSteps.length - 1 ? (
                <Button type="submit">Next</Button>
              ) : (
                <Button type="submit" disabled={saving}>
                  {saving && <Spinner size="sm" aria-hidden />}
                  {saving ? 'Saving…' : 'Save routine'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  // A failed save's error belongs to the closed draft.
                  setError('');
                  setDraft(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {selected && (
        <Card
          role="region"
          aria-labelledby="routine-plan-title"
          className="mt-5 gap-0 px-4 py-5 shadow-none md:px-6 md:py-6"
        >
          <article>
            <CardTitle
              id="routine-plan-title"
              asHeading="h3"
              className="text-body font-semibold [overflow-wrap:anywhere]"
            >
              {selected.name}
            </CardTitle>
            <p className="mt-1.5 text-body-sm text-muted-foreground">
              {selected.split_count === 1 ? 'No split' : `${selected.split_count}-day split`} ·
              Start date {selected.start_date} ·{' '}
              {selected.schedule_mode === 'cycle' && selected.cycle
                ? `Repeats ${selected.cycle.train_days} days on, ${selected.cycle.rest_days} days off`
                : `${selected.weekly_workouts} workouts/week · Rest ${
                    selected.rest_days.map((d) => days[d]).join(', ') || 'none'
                  }`}
            </p>
            {selected.splits.map((s, i) => (
              <section key={i} className="mt-4 border-t pt-3">
                <h4 className="text-body-sm font-semibold [overflow-wrap:anywhere]">{s.name}</h4>
                <p className="mt-1 text-meta text-muted-foreground">
                  {s.body_parts.map(bodyPartLabel).join(' → ')}
                </p>
                <ul className={list}>
                  {s.exercises.map((ex, j) => (
                    <li key={j} className="[overflow-wrap:anywhere]">
                      {ex.exercise}
                      {machineName(machines, ex.machine_id) &&
                        ` (${machineName(machines, ex.machine_id)})`}{' '}
                      · {plural(Number(ex.sets), 'set')} · total weight {ex.weight} kg ·{' '}
                      {plural(Number(ex.reps), 'rep')}
                      {selected.progression === 'auto' &&
                        ` · Rep range ${ex.rep_min}–${ex.rep_max} · Increase step ${stepOf(steps, ex.exercise)} kg`}
                    </li>
                  ))}
                  {s.cardio?.map((c, j) => (
                    <li key={`cardio-${j}`} className="[overflow-wrap:anywhere]">
                      Cardio · {cardioLabel(c)}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <CardioPreview splits={selected.splits} />
            {selected.progression === 'auto' ? (
              <>
                <p className={cn(hint, 'mt-4')}>Auto · double progressive overload. {autoRule}</p>
                <Preview plan={selected} steps={steps} />
              </>
            ) : (
              <section className="mt-4 border-t pt-3">
                <h4 className="text-body-sm font-semibold">Goals by week</h4>
                <ol className={list}>
                  {selected.weeks?.map((w) => (
                    <li
                      key={w.week}
                      data-deload={w.kind === 'deload' || undefined}
                      className="text-muted-foreground data-deload:font-medium data-deload:text-foreground"
                    >
                      Week {w.week} · {goalLabel(w)}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="mt-4 border-t pt-3">
              <h4 className="text-body-sm font-semibold">
                Workout schedule · 12 weeks from the start date (Asia/Seoul)
              </h4>
              <ul className={cn(list, 'md:columns-2 md:gap-6')}>
                {selected.schedule?.map((day) => (
                  <li
                    key={day.date}
                    data-deload={day.is_deload || undefined}
                    className="break-inside-avoid [overflow-wrap:anywhere] text-muted-foreground data-deload:text-foreground"
                  >
                    {day.date} · Week {day.week} · {selected.splits[day.split_index].name}
                    {day.is_deload ? ' · Deload' : ''}
                  </li>
                ))}
              </ul>
            </section>
          </article>
        </Card>
      )}
    </section>
  );
}
