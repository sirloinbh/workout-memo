import { ChevronDown } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import {
  type CardioKind,
  cardioKinds,
  cardioSessionSchemaFor,
  type Feedback,
  feedbackLevels,
  fieldErrors,
} from '../../../shared/contract';
import {
  fieldLabel,
  formHint,
  selectField,
  textareaField,
  touchText,
} from '../components/form-styles';
import { Modal, ModalFooter } from '../components/modal';
import { NumberInput } from '../components/number-input';
import { ToggleChips } from '../components/toggle-chips';
import { AlertBanner } from '../components/ui/alert-banner';
import { Button } from '../components/ui/button';
import { FieldError } from '../components/ui/field';
import { invalidProps } from '../components/ui/field-props';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { cn } from '../lib/utils';
import type { CardioPreset } from '../routine-cardio';
import { type CardioBody, type CardioSession, saveCardioSession } from './api';
import {
  cardioKindLabels,
  effortLabels,
  kmToMetres,
  metresToKm,
  optionalNumber,
  parseDuration,
  splitDuration,
} from './format';

// What the form edits: a stored session, or (with `apply`) a row of the import preview that
// has no id yet.
type FormSession = CardioBody & { id?: number };

// A strength workout the session can be linked to.
export type LinkableWorkout = { id: number; date: string; title: string };

// Whole numbers shown under "Show more fields", in the schema's field names.
const extras = [
  { key: 'avg_heart_rate', label: 'Average heart rate bpm' },
  { key: 'max_heart_rate', label: 'Max heart rate bpm' },
  { key: 'calories_kcal', label: 'Calories kcal' },
  { key: 'elevation_gain_m', label: 'Elevation gain m' },
  { key: 'avg_cadence', label: 'Cadence /min' },
] as const;
type ExtraKey = (typeof extras)[number]['key'];

type Draft = {
  kind: CardioKind;
  date: string;
  hours: string;
  minutes: string;
  seconds: string;
  distance: string;
  effort: Feedback | null;
  memo: string;
  start_time: string;
  workout_id: string;
} & Record<ExtraKey, string>;

const text = (value: number | null) => (value === null ? '' : String(value));
// Swimming distance is typed in metres, every other kind in km (2026-11-08 decision); the
// stored value is always km. Converts the typed text between the two, leaving unreadable text.
const distanceUnit = (kind: CardioKind) => (kind === 'swimming' ? 'm' : 'km');
function convertDistance(text: string, from: CardioKind, to: CardioKind) {
  if (distanceUnit(from) === distanceUnit(to)) return text;
  const value = optionalNumber(text);
  if (value === null || Number.isNaN(value)) return text;
  return String(distanceUnit(to) === 'm' ? kmToMetres(value) : metresToKm(value));
}

function initialDraft(
  session: FormSession | undefined,
  date: string,
  preset?: CardioPreset,
): Draft {
  if (!session)
    return {
      kind: preset?.kind ?? 'running',
      date,
      ...(preset?.duration_sec !== undefined
        ? splitDuration(preset.duration_sec)
        : { hours: '', minutes: '', seconds: '' }),
      distance:
        preset?.distance_km === undefined
          ? ''
          : preset.kind === 'swimming'
            ? String(kmToMetres(preset.distance_km))
            : String(preset.distance_km),
      effort: null,
      memo: preset?.memo ?? '',
      start_time: '',
      workout_id: '',
      avg_heart_rate: '',
      max_heart_rate: '',
      calories_kcal: '',
      elevation_gain_m: '',
      avg_cadence: '',
    };
  return {
    kind: session.kind,
    date: session.date.slice(0, 10),
    ...splitDuration(session.duration_sec),
    distance:
      session.distance_km !== null && session.kind === 'swimming'
        ? String(kmToMetres(session.distance_km))
        : text(session.distance_km),
    effort: session.effort,
    memo: session.memo,
    start_time: session.start_time ?? '',
    workout_id: text(session.workout_id),
    ...(Object.fromEntries(extras.map((e) => [e.key, text(session[e.key])])) as Record<
      ExtraKey,
      string
    >),
  };
}

const moreKeys = [...extras.map((e) => e.key), 'start_time', 'workout_id'];
// The fields that have an input and show their own error; any other key (an imported record's
// source or external_id) is reported once at the form level (#386).
const shownKeys = ['kind', 'date', 'duration_sec', 'distance_km', 'effort', 'memo', ...moreKeys];

// #115: create or edit one cardio session in a Modal. Only kind, date, duration, distance,
// effort and memo show at first; "Show more fields" reveals the rest (decision 6). The input is
// checked with the server's schema before sending, and a server refusal (409 duplicate, 400)
// stays in the form so nothing typed is lost.
// #119: with `apply` the form edits a row of the file import preview instead: it checks the
// same rules, hands the values back and sends nothing (the preview saves all rows together).
export function CardioForm({
  session,
  date,
  today,
  workouts,
  close,
  onSaved,
  apply,
  preset,
}: {
  session?: FormSession;
  // The date a new session starts with.
  date: string;
  today: string;
  workouts: readonly LinkableWorkout[];
  close: () => void;
  onSaved?: (session: CardioSession) => void;
  apply?: (body: CardioBody) => void;
  // #117: a new session filled in from a routine's cardio item (ignored when editing).
  preset?: CardioPreset;
}) {
  const [draft, setDraft] = useState(() => initialDraft(session, date, preset));
  // An edited session that already has any of the hidden values opens with them shown.
  const [more, setMore] = useState(() => moreKeys.some((key) => draft[key as keyof Draft]));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  // Switching between swimming (m) and another kind (km) keeps the same physical distance:
  // running "5" becomes swimming "5000", swimming "1500" becomes running "1.5".
  const setKind = (kind: CardioKind) =>
    setDraft((d) => ({ ...d, kind, distance: convertDistance(d.distance, d.kind, kind) }));
  const unit = distanceUnit(draft.kind);
  const invalid = (key: string) => invalidProps(key, issues[key]);
  const issue = (key: string) => <FieldError name={key}>{issues[key]}</FieldError>;

  // Same-day workouts, plus the one already linked when it is on another day, so editing
  // never drops a link silently.
  const linkable = workouts.filter((w) => w.date.slice(0, 10) === draft.date);
  const linked = draft.workout_id ? Number(draft.workout_id) : null;
  const linkedElsewhere =
    linked !== null && !linkable.some((w) => w.id === linked)
      ? (workouts.find((w) => w.id === linked) ?? { id: linked, date: '', title: '' })
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const duration = parseDuration(draft);
    const typedDistance = optionalNumber(draft.distance);
    const swimMetres = unit === 'm' && typedDistance !== null && !Number.isNaN(typedDistance);
    const extraValues = Object.fromEntries(
      extras.map((e) => [e.key, optionalNumber(draft[e.key])]),
    ) as Record<ExtraKey, number | null>;
    const body = {
      date: draft.date,
      kind: draft.kind,
      // zod skips the schema's refinements (future date, max ≥ avg heart rate) while any field
      // fails, so an unreadable duration is stood in by 1 second and reported on its own below.
      duration_sec: 'seconds' in duration ? duration.seconds : 1,
      distance_km: swimMetres ? metresToKm(typedDistance) : typedDistance,
      ...extraValues,
      effort: draft.effort,
      start_time: draft.start_time || null,
      workout_id: draft.workout_id ? Number(draft.workout_id) : null,
      memo: draft.memo,
      // PUT replaces the whole record: an imported session keeps its dedupe key.
      source: session?.source ?? 'manual',
      external_id: session?.external_id ?? null,
    };
    const checked = cardioSessionSchemaFor(today).safeParse(body);
    const found = checked.success ? {} : fieldErrors(checked.error);
    if ('error' in duration) found.duration_sec = duration.error;
    // For the same reason the cross-field rules are checked here too, with the schema's
    // messages, so they show even while another field fails.
    if (!found.date && draft.date > today)
      found.date = 'The cardio record date cannot be after today';
    const { avg_heart_rate: avg, max_heart_rate: max } = extraValues;
    if (!found.max_heart_rate && !found.avg_heart_rate && avg !== null && max !== null && max < avg)
      found.max_heart_rate = 'Max heart rate cannot be lower than average heart rate';
    // Metres must be whole (the schema keeps 1 m precision) and the messages speak in metres.
    if (
      swimMetres &&
      (!Number.isInteger(typedDistance) || typedDistance <= 0 || typedDistance > 1_000_000)
    )
      found.distance_km = 'Enter a swimming distance as a whole number from 1 to 1,000,000 m';
    setIssues(found);
    const hidden = Object.entries(found).filter(([key]) => !shownKeys.includes(key));
    setServerError(
      hidden.length
        ? `This record cannot be used: ${hidden.map(([key, message]) => `${key} - ${message}`).join('; ')}`
        : '',
    );
    if (Object.keys(found).length) {
      if (moreKeys.some((key) => found[key])) setMore(true);
      return;
    }
    if (!checked.success) return;
    if (apply) {
      apply(checked.data);
      return;
    }
    setSaving(true);
    setServerError('');
    try {
      const saved = await saveCardioSession(checked.data, session?.id);
      onSaved?.(saved);
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const durationFields = [
    { key: 'hours', label: 'Workout time hours', short: 'hr', max: 24 },
    { key: 'minutes', label: 'Workout time minutes', short: 'min', max: 59 },
    { key: 'seconds', label: 'Workout time seconds', short: 'sec', max: 59 },
  ] as const;

  return (
    <Modal
      title={apply ? 'Edit imported record' : session ? 'Edit cardio record' : 'New cardio record'}
      close={close}
    >
      <form noValidate onSubmit={(e) => void submit(e)}>
        <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <Label className={fieldLabel}>
                Type
                <select
                  className={selectField}
                  value={draft.kind}
                  onChange={(e) => setKind(e.target.value as CardioKind)}
                  {...invalid('kind')}
                >
                  {cardioKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {cardioKindLabels[kind]}
                    </option>
                  ))}
                </select>
              </Label>
              {issue('kind')}
            </div>
            <div>
              <Label className={fieldLabel}>
                Date
                <Input
                  className={touchText}
                  type="date"
                  max={today}
                  value={draft.date}
                  onChange={(e) => set('date', e.target.value)}
                  {...invalid('date')}
                />
              </Label>
              {issue('date')}
            </div>
          </div>
          <fieldset className="m-0 mb-4 min-w-0 border-0 p-0">
            <legend className="mb-2 text-meta text-muted-foreground">Workout time</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {durationFields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label htmlFor={`cardio-${f.key}`} className="mb-0 w-4 shrink-0 text-meta">
                    {f.short}
                  </label>
                  <NumberInput
                    id={`cardio-${f.key}`}
                    label={f.label}
                    className="flex-1 md:pointer-coarse:[&_input]:text-base"
                    min={0}
                    max={f.max}
                    placeholder={f.key === 'hours' ? '0' : undefined}
                    value={draft[f.key]}
                    onValueChange={(value) => set(f.key, value)}
                    {...invalid('duration_sec')}
                  />
                </div>
              ))}
            </div>
            {issue('duration_sec')}
          </fieldset>
          <div className="mb-4 flex flex-col gap-2">
            <label htmlFor="cardio-distance" className="mb-0 text-meta text-muted-foreground">
              Distance {unit} (optional)
            </label>
            <NumberInput
              id="cardio-distance"
              label={`Distance ${unit}`}
              className="md:pointer-coarse:[&_input]:text-base"
              step={unit === 'm' ? 25 : 0.5}
              min={0}
              max={unit === 'm' ? 1_000_000 : 1000}
              inputMode={unit === 'm' ? 'numeric' : 'decimal'}
              placeholder="Not entered"
              value={draft.distance}
              onValueChange={(value) => set('distance', value)}
              {...invalid('distance_km')}
            />
            {issue('distance_km')}
            {unit === 'm' && (
              <p className={formHint}>
                Enter swimming distance in m. It is converted to km when saved.
              </p>
            )}
          </div>
          <div className="mb-4 flex flex-col items-start gap-2 text-meta text-muted-foreground">
            <span>Perceived effort (optional)</span>
            <ToggleChips
              type="single"
              label="Perceived effort"
              options={feedbackLevels}
              renderOption={(level) => effortLabels[level as Feedback]}
              value={draft.effort}
              // A new press replaces the old level; pressing it again clears it to not recorded
              // (the #83 feedback pattern).
              onValueChange={(next) => set('effort', next as Feedback | null)}
            />
            {issue('effort')}
          </div>
          <Label className={fieldLabel}>
            Memo (optional)
            <textarea
              className={textareaField}
              maxLength={2000}
              value={draft.memo}
              onChange={(e) => set('memo', e.target.value)}
              {...invalid('memo')}
            />
          </Label>
          {issue('memo')}
          <Button
            type="button"
            variant="outline"
            className="mb-4"
            aria-expanded={more}
            aria-controls="cardio-more"
            onClick={() => setMore(!more)}
          >
            Show more fields
            <ChevronDown aria-hidden className={cn('transition-transform', more && 'rotate-180')} />
          </Button>
          {more && (
            <div id="cardio-more" className="grid gap-x-3 sm:grid-cols-2">
              {extras.map((e) => (
                <div key={e.key}>
                  <Label className={fieldLabel}>
                    {e.label} (optional)
                    <Input
                      className={touchText}
                      inputMode="numeric"
                      placeholder="Not entered"
                      value={draft[e.key]}
                      onChange={(event) => set(e.key, event.target.value)}
                      {...invalid(e.key)}
                    />
                  </Label>
                  {issue(e.key)}
                </div>
              ))}
              <div>
                <Label className={fieldLabel}>
                  Start time (optional)
                  <Input
                    className={touchText}
                    type="time"
                    value={draft.start_time}
                    onChange={(e) => set('start_time', e.target.value)}
                    {...invalid('start_time')}
                  />
                </Label>
                {issue('start_time')}
              </div>
              <div className="sm:col-span-2">
                <Label className={fieldLabel}>
                  Strength journal to link
                  <select
                    className={selectField}
                    value={draft.workout_id}
                    onChange={(e) => set('workout_id', e.target.value)}
                    {...invalid('workout_id')}
                  >
                    <option value="">Not linked</option>
                    {linkable.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.title}
                      </option>
                    ))}
                    {linkedElsewhere && (
                      <option value={String(linkedElsewhere.id)}>
                        {linkedElsewhere.title
                          ? `${linkedElsewhere.date.slice(0, 10)} ${linkedElsewhere.title}`
                          : `Strength journal #${linkedElsewhere.id}`}
                      </option>
                    )}
                  </select>
                </Label>
                {issue('workout_id')}
                <p className={cn(formHint, 'mb-4')}>
                  {linkedElsewhere
                    ? linkedElsewhere.date
                      ? `Linked to the strength journal for another date (${linkedElsewhere.date.slice(0, 10)}).`
                      : 'Linked to the strength journal for another date.'
                    : linkable.length
                      ? 'Choose from the strength journals on the same date.'
                      : 'There is no strength journal to link on this date.'}
                </p>
              </div>
            </div>
          )}
        </fieldset>
        {serverError && <AlertBanner className="mt-2 mb-5">{serverError}</AlertBanner>}
        <ModalFooter>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving && <Spinner size="sm" aria-hidden />}
              {apply ? 'Apply to preview' : saving ? 'Saving…' : 'Save cardio record'}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={close}>
              Cancel
            </Button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}
