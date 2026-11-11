import { Plus, Timer } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import {
  cardioKindLabels,
  formatDistance,
  formatDuration,
  kmToMetres,
  metresToKm,
  optionalNumber,
} from './cardio/format';
import { AlertBanner } from './components/alert-banner';
import { FieldError } from './components/field';
import { invalidProps } from './components/field-props';
import { fieldLabel, formHint as hint, selectField, touchText } from './components/form-styles';
import { Modal } from './components/modal';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardDescription, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonCard } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import {
  type CardioGoalInput,
  cardioGoalSchema,
  type CardioGoalType,
  type CardioKind,
  cardioKinds,
  fieldErrors,
} from './contract';
import { seoulDate } from './date';
import { plural } from './labels';

// #116: cardio goals on the My Goals page, next to the strength goals. The server judges them;
// this screen only shows the judgment. Kind labels and time/distance formats come from the
// cardio session screen (#115).
const typeLabels: Record<CardioGoalType, string> = {
  distance: 'Total distance',
  duration: 'Total time',
  count: 'Total sessions',
  record_time: 'Record time (distance within time)',
  longest_distance: 'Longest distance',
};
const isRecord = (type: CardioGoalType) => type === 'record_time' || type === 'longest_distance';

type Period = { start: string; end: string; value: number; achieved: boolean };
type StoredGoal = {
  id: number;
  goal_type: CardioGoalType;
  kind: CardioKind | null;
  period: 'week' | 'month' | null;
  target_distance_km: number | null;
  target_duration_sec: number | null;
  target_count: number | null;
  start_date: string;
  deadline: string;
  achieved: boolean;
  progress:
    | { kind: 'period'; current: Period | null; periods: Period[]; periods_achieved: number }
    | { kind: 'record'; best: number | null };
};

/** A goal's own fields: a stored goal or a suggested next one (#251). */
type GoalShape = Omit<StoredGoal, 'id' | 'achieved' | 'progress'>;

const km = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
/** Seconds as 2 h 30 min (totals are shown in minutes). */
const minutes = (seconds: number) => {
  const total = Math.floor(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};
const amount = (goal: GoalShape, value: number) =>
  goal.goal_type === 'count'
    ? `${plural(value, 'session')}`
    : goal.goal_type === 'duration'
      ? minutes(value)
      : distanceOf(goal, value);
// Swimming goals read in metres like the session screen; every kind together stays in km.
const distanceOf = (goal: GoalShape, value: number) =>
  goal.kind ? formatDistance(goal.kind, value)! : `${km(value)} km`;
const targetOf = (goal: GoalShape) =>
  goal.goal_type === 'count'
    ? goal.target_count!
    : goal.goal_type === 'duration'
      ? goal.target_duration_sec!
      : goal.target_distance_km!;

/** The goal in one line, e.g. "Weekly running 15 km" or "Running 5 km within 30:00". */
function goalTitle(goal: GoalShape) {
  const kind = goal.kind ? cardioKindLabels[goal.kind] : 'Cardio';
  if (goal.goal_type === 'record_time')
    return `${kind} ${distanceOf(goal, goal.target_distance_km!)} within ${formatDuration(goal.target_duration_sec!)}`;
  if (goal.goal_type === 'longest_distance')
    return `${kind} ${distanceOf(goal, goal.target_distance_km!)} in one session`;
  return `${goal.period === 'week' ? 'Weekly' : 'Monthly'} ${kind.toLowerCase()} ${amount(goal, targetOf(goal))}`;
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/cardio-goals' + path, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error ?? 'The cardio goal request failed');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function CardioGoals({ deadline }: { deadline: string }) {
  const [goals, setGoals] = useState<StoredGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  // The add form, empty or filled with a suggested next goal (#251).
  const [editor, setEditor] = useState<{ initial: GoalShape | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const today = seoulDate();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setGoals(await request<StoredGoal[]>(''));
    } catch (e) {
      setError(`Could not load cardio goals: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function save(goal: CardioGoalInput) {
    setSaving(true);
    try {
      await request('', 'POST', goal);
      setEditor(null);
      setStatus('Cardio goal saved.');
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function remove(goal: StoredGoal) {
    if (!confirm('Delete this cardio goal?')) return;
    setSaving(true);
    setError('');
    try {
      await request('/' + goal.id, 'DELETE');
      setStatus('Cardio goal deleted.');
      await load();
    } catch (e) {
      setError(`Could not delete the cardio goal: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="cardio-goals-title" className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cardio-goals-title" className="text-body font-semibold">
            Cardio goals
          </h2>
          <p className="text-caption text-muted-foreground">
            Weekly and monthly distance, time, count, and record goals are judged from cardio
            records.
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditor({ initial: null })}>
          <Plus aria-hidden />
          Add cardio goal
        </Button>
      </div>
      {error && (
        <AlertBanner
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Reconnect
            </Button>
          }
        >
          {error}
        </AlertBanner>
      )}
      <Notice className="mb-3" notice={status ? { kind: 'status', text: status } : undefined} />
      {loading && goals.length === 0 ? (
        <div aria-busy="true" aria-label="Cardio goals" className="grid gap-5 md:grid-cols-2">
          <p role="status" className="sr-only">
            Loading cardio goals…
          </p>
          <SkeletonCard />
        </div>
      ) : goals.length === 0 ? (
        !error && (
          <EmptyState
            icon={<Timer />}
            title="No cardio goals"
            description="e.g. 3 runs a week, 15 km a week, 5 km within 30 min"
          />
        )
      ) : (
        <div data-slot="cardio-goal-grid" className="grid gap-5 md:grid-cols-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              today={today}
              saving={saving}
              remove={(goal) => void remove(goal)}
              suggest={(next) => setEditor({ initial: next })}
            />
          ))}
        </div>
      )}
      {editor && (
        <Modal title="Cardio goals" close={() => setEditor(null)}>
          <CardioGoalForm
            deadline={deadline}
            initial={editor.initial}
            saving={saving}
            onSave={save}
          />
        </Modal>
      )}
    </section>
  );
}

function GoalCard({
  goal,
  today,
  saving,
  remove,
  suggest,
}: {
  goal: StoredGoal;
  today: string;
  saving: boolean;
  remove: (goal: StoredGoal) => void;
  suggest: (next: GoalShape) => void;
}) {
  const title = goalTitle(goal);
  // #251 (N3): only an achieved goal offers the next one; the server computes it.
  const [next, setNext] = useState<GoalShape | null>(null);
  useEffect(() => {
    if (!goal.achieved) return;
    let active = true;
    request<{ suggestion: GoalShape | null }>(`/${goal.id}/suggestion`)
      .then((data) => {
        if (active) setNext(data.suggestion);
      })
      // Without a suggestion the card simply shows none.
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // `today` too: a page left open past midnight asks again, so the start date is today's.
  }, [goal.id, goal.achieved, today]);
  const upcoming = today < goal.start_date;
  const ended = today > goal.deadline;
  const p = goal.progress;
  // Period goals are "achieved" only for the current period, so an ended one reads Period ended.
  const badge = goal.achieved
    ? { variant: 'success' as const, text: 'Achieved' }
    : ended
      ? { variant: 'warning' as const, text: 'Period ended' }
      : upcoming
        ? { variant: 'outline' as const, text: 'Not started' }
        : { variant: 'outline' as const, text: 'In progress' };
  const unit = goal.period === 'week' ? 'week' : 'month';
  return (
    <Card
      data-slot="cardio-goal"
      className="items-start gap-0 px-6 py-6 shadow-none md:px-7 md:py-7"
    >
      <Badge variant={badge.variant} className="mb-5">
        {badge.text}
      </Badge>
      <CardTitle asHeading="h3" className="text-body font-semibold [overflow-wrap:anywhere]">
        {title}
      </CardTitle>
      <CardDescription className="mt-1 text-caption">{typeLabels[goal.goal_type]}</CardDescription>
      {p.kind === 'period' ? (
        <>
          {p.current && (
            <>
              <p className="mt-5 text-body-sm">
                This {unit} {amount(goal, p.current.value)}{' '}
                <span className="text-muted-foreground">/ {amount(goal, targetOf(goal))}</span>
              </p>
              <div
                role="progressbar"
                aria-label={`${title} progress this ${unit}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round((p.current.value / targetOf(goal)) * 100))}
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, (p.current.value / targetOf(goal)) * 100)}%`,
                  }}
                />
              </div>
            </>
          )}
          <p className="mt-3 text-body-sm text-muted-foreground">
            {unit === 'week' ? 'Weeks' : 'Months'} achieved {p.periods_achieved} /{' '}
            {p.periods.length} total
          </p>
        </>
      ) : (
        <p className="mt-5 text-body-sm">
          {goal.goal_type === 'record_time'
            ? p.best === null
              ? `No records of ${distanceOf(goal, goal.target_distance_km!)} or more yet.`
              : `Fastest record ${formatDuration(p.best)}`
            : p.best === null
              ? 'No records with a distance yet.'
              : `Longest distance ${distanceOf(goal, p.best)}`}
        </p>
      )}
      <p className="mt-3 text-body-sm text-muted-foreground">
        {goal.start_date} — {goal.deadline}
      </p>
      {goal.achieved && next && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 h-auto min-h-8 text-left [overflow-wrap:anywhere] whitespace-normal"
          onClick={() => suggest(next)}
        >
          Next goal: {goalTitle(next)}
        </Button>
      )}
      <Button
        variant="link"
        size="sm"
        className="mt-3 px-0"
        aria-label={`Delete ${title} goal`}
        disabled={saving}
        onClick={() => remove(goal)}
      >
        Delete goal
      </Button>
    </Card>
  );
}

type Draft = {
  goal_type: CardioGoalType;
  kind: CardioKind | '';
  period: 'week' | 'month';
  distance: string;
  minutes: string;
  seconds: string;
  count: string;
  start_date: string;
  deadline: string;
};
// Empty stays null so the schema says which target is missing; other text becomes NaN.
const num = optionalNumber;
// Swimming distance is typed in metres, every other kind (and every kind together) in km, as in
// the cardio session form (#252, 2026-11-08 decision); the goal always stores km.
const distanceUnit = (kind: CardioKind | '') => (kind === 'swimming' ? 'm' : 'km');
// Switching between swimming and another kind keeps the same distance: "5" km ↔ "5000" m.
function convertDistance(text: string, from: CardioKind | '', to: CardioKind | '') {
  if (distanceUnit(from) === distanceUnit(to)) return text;
  const value = optionalNumber(text);
  if (value === null || Number.isNaN(value)) return text;
  return String(distanceUnit(to) === 'm' ? kmToMetres(value) : metresToKm(value));
}

// The typed distance in km: metres for swimming are divided by 1000; unreadable text stays NaN.
const distanceKm = (d: Draft) => {
  const value = num(d.distance);
  return value !== null && !Number.isNaN(value) && distanceUnit(d.kind) === 'm'
    ? metresToKm(value)
    : value;
};
// A suggested goal (#251) as the form's text fields; swimming distance in metres.
function draftFrom(goal: GoalShape): Draft {
  const sec = goal.target_duration_sec;
  const km = goal.target_distance_km;
  return {
    goal_type: goal.goal_type,
    kind: goal.kind ?? '',
    period: goal.period ?? 'week',
    distance: km === null ? '' : String(goal.kind === 'swimming' ? kmToMetres(km) : km),
    minutes: sec === null ? '' : String(Math.floor(sec / 60)),
    seconds: sec === null ? '' : String(sec % 60),
    count: goal.target_count === null ? '' : String(goal.target_count),
    start_date: goal.start_date,
    deadline: goal.deadline,
  };
}
/** The draft as the API body: only the fields of the chosen goal type are filled. */
function draftToGoal(d: Draft): CardioGoalInput {
  const record = isRecord(d.goal_type);
  const usesDistance = ['distance', 'record_time', 'longest_distance'].includes(d.goal_type);
  const usesTime = d.goal_type === 'duration' || d.goal_type === 'record_time';
  const min = num(d.minutes);
  const sec = num(d.seconds);
  const duration = min === null && sec === null ? null : (min ?? 0) * 60 + (sec ?? 0);
  return {
    goal_type: d.goal_type,
    kind: d.kind === '' ? null : d.kind,
    period: record ? null : d.period,
    target_distance_km: usesDistance ? distanceKm(d) : null,
    target_duration_sec: usesTime ? duration : null,
    target_count: d.goal_type === 'count' ? num(d.count) : null,
    start_date: d.start_date,
    deadline: d.deadline,
  };
}

function CardioGoalForm({
  deadline,
  initial,
  saving,
  onSave,
}: {
  deadline: string;
  initial: GoalShape | null;
  saving: boolean;
  onSave: (goal: CardioGoalInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? draftFrom(initial)
      : {
          goal_type: 'distance',
          kind: '',
          period: 'week',
          distance: '',
          minutes: '',
          seconds: '',
          count: '',
          start_date: seoulDate(),
          deadline,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const record = isRecord(draft.goal_type);
  const field = (name: string) => invalidProps(name, errors[name]);
  const message = (name: string) => <FieldError name={name}>{errors[name]}</FieldError>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = cardioGoalSchema.safeParse(draftToGoal(draft));
    const found = parsed.success ? {} : fieldErrors(parsed.error);
    // Minutes and seconds are two fields; check them before they become one number of seconds.
    const usesTime = draft.goal_type === 'duration' || draft.goal_type === 'record_time';
    const whole = (text: string, max: number) =>
      text.trim() === '' || (/^\d+$/.test(text.trim()) && Number(text.trim()) <= max);
    if (usesTime && !(whole(draft.minutes, 44640) && whole(draft.seconds, 59)))
      found.target_duration_sec =
        'Enter minutes (whole number, 0 or more) and seconds (whole number, 0–59)';
    // Metres must be whole (the schema keeps 1 m precision) and the message speaks in metres.
    const metres = num(draft.distance);
    const usesDistance = draft.goal_type !== 'duration' && draft.goal_type !== 'count';
    if (
      usesDistance &&
      distanceUnit(draft.kind) === 'm' &&
      metres !== null &&
      !Number.isNaN(metres) &&
      (!Number.isInteger(metres) || metres <= 0 || metres > 10_000_000)
    )
      found.target_distance_km =
        'Enter a swimming goal distance as a whole number from 1 to 10,000,000 m';
    if (!parsed.success || Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setFailure('');
    try {
      await onSave(parsed.data);
    } catch (e) {
      setFailure(`Could not save the cardio goal: ${(e as Error).message}`);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      {failure && <AlertBanner>{failure}</AlertBanner>}
      <div className="grid grid-cols-2 gap-x-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
        <Label className={fieldLabel}>
          Goal type
          <select
            className={selectField}
            value={draft.goal_type}
            onChange={(e) => {
              // Messages of fields the new type hides would linger until the next submit.
              setErrors({});
              set({ goal_type: e.target.value as CardioGoalType });
            }}
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Label>
        <Label className={fieldLabel}>
          Workout type
          <select
            className={selectField}
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as CardioKind | '';
              set({ kind, distance: convertDistance(draft.distance, draft.kind, kind) });
            }}
            {...field('kind')}
          >
            {!record && <option value="">All cardio</option>}
            {record && draft.kind === '' && <option value="">Choose</option>}
            {cardioKinds.map((k) => (
              <option key={k} value={k}>
                {cardioKindLabels[k]}
              </option>
            ))}
          </select>
        </Label>
        {!record && (
          <Label className={fieldLabel}>
            Period unit
            <select
              className={selectField}
              value={draft.period}
              onChange={(e) => set({ period: e.target.value as 'week' | 'month' })}
              {...field('period')}
            >
              <option value="week">Weekly (Mon–Sun)</option>
              <option value="month">Monthly</option>
            </select>
          </Label>
        )}
        {draft.goal_type !== 'duration' && draft.goal_type !== 'count' && (
          <Label className={fieldLabel}>
            Goal distance ({distanceUnit(draft.kind)})
            <Input
              className={touchText}
              inputMode="decimal"
              value={draft.distance}
              onChange={(e) => set({ distance: e.target.value })}
              {...field('target_distance_km')}
            />
          </Label>
        )}
        {(draft.goal_type === 'duration' || draft.goal_type === 'record_time') && (
          <>
            <Label className={fieldLabel}>
              Goal time (min)
              <Input
                className={touchText}
                inputMode="numeric"
                value={draft.minutes}
                onChange={(e) => set({ minutes: e.target.value })}
                {...field('target_duration_sec')}
              />
            </Label>
            <Label className={fieldLabel}>
              Goal time (sec)
              <Input
                className={touchText}
                inputMode="numeric"
                value={draft.seconds}
                onChange={(e) => set({ seconds: e.target.value })}
                {...field('target_duration_sec')}
              />
            </Label>
          </>
        )}
        {draft.goal_type === 'count' && (
          <Label className={fieldLabel}>
            Goal sessions
            <Input
              className={touchText}
              inputMode="numeric"
              value={draft.count}
              onChange={(e) => set({ count: e.target.value })}
              {...field('target_count')}
            />
          </Label>
        )}
        <Label className={fieldLabel}>
          Start date
          <Input
            className={touchText}
            type="date"
            value={draft.start_date}
            onChange={(e) => set({ start_date: e.target.value })}
            {...field('start_date')}
          />
        </Label>
        <Label className={fieldLabel}>
          End date
          <Input
            className={touchText}
            type="date"
            value={draft.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
            {...field('deadline')}
          />
        </Label>
      </div>
      {message('goal_type')}
      {message('kind')}
      {message('period')}
      {message('target_distance_km')}
      {message('target_duration_sec')}
      {message('target_count')}
      {message('start_date')}
      {message('deadline')}
      <p className={hint}>
        {record
          ? draft.goal_type === 'record_time'
            ? 'It counts as achieved when a single record meets the goal distance and its total time is within the goal time. Pace is not used to estimate.'
            : 'It counts as achieved when a single record meets the goal distance.'
          : 'Judged per week (Mon–Sun) or month. Cycles that span the start or end date keep the same goal value, and only records within the period are counted.'}
      </p>
      <Button className="mt-4 w-full" disabled={saving}>
        {saving && <Spinner size="sm" aria-hidden />}
        Save cardio goal
      </Button>
    </form>
  );
}
