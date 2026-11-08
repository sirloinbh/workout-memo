import { ChevronDown } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { AlertBanner } from '../components/alert-banner';
import { FieldError } from '../components/field';
import { invalidProps } from '../components/field-props';
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
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  type CardioKind,
  cardioKinds,
  cardioSessionSchemaFor,
  type Feedback,
  feedbackLevels,
  fieldErrors,
} from '../contract';
import { cn } from '../lib/utils';
import { type CardioSession, saveCardioSession } from './api';
import { cardioKindLabels, effortLabels, parseDuration, splitDuration } from './format';

// A strength workout the session can be linked to.
export type LinkableWorkout = { id: number; date: string; title: string };

// Whole numbers shown under "더 입력하기", in the schema's field names.
const extras = [
  { key: 'avg_heart_rate', label: '평균 심박 bpm' },
  { key: 'max_heart_rate', label: '최대 심박 bpm' },
  { key: 'calories_kcal', label: '칼로리 kcal' },
  { key: 'elevation_gain_m', label: '상승 고도 m' },
  { key: 'avg_cadence', label: '케이던스 회/분' },
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
// Empty stays null (not recorded, never 0). A decimal comma from a phone keypad counts as a
// point; anything unreadable becomes NaN so the schema reports "숫자로 입력하세요".
const optionalNumber = (value: string) =>
  value.trim() === '' ? null : Number(value.trim().replace(',', '.'));

function initialDraft(session: CardioSession | undefined, date: string): Draft {
  if (!session)
    return {
      kind: 'running',
      date,
      hours: '',
      minutes: '',
      seconds: '',
      distance: '',
      effort: null,
      memo: '',
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
    distance: text(session.distance_km),
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

// #115: create or edit one cardio session in a Modal. Only kind, date, duration, distance,
// effort and memo show at first; "더 입력하기" reveals the rest (decision 6). The input is
// checked with the server's schema before sending, and a server refusal (409 duplicate, 400)
// stays in the form so nothing typed is lost.
export function CardioForm({
  session,
  date,
  today,
  workouts,
  close,
  onSaved,
}: {
  session?: CardioSession;
  // The date a new session starts with.
  date: string;
  today: string;
  workouts: readonly LinkableWorkout[];
  close: () => void;
  onSaved: (session: CardioSession) => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(session, date));
  // An edited session that already has any of the hidden values opens with them shown.
  const [more, setMore] = useState(() => moreKeys.some((key) => draft[key as keyof Draft]));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
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
    const body = {
      date: draft.date,
      kind: draft.kind,
      // zod skips the schema's refinements (future date, max ≥ avg heart rate) while any field
      // fails, so an unreadable duration is stood in by 1 second and reported on its own below.
      duration_sec: 'seconds' in duration ? duration.seconds : 1,
      distance_km: optionalNumber(draft.distance),
      ...Object.fromEntries(extras.map((e) => [e.key, optionalNumber(draft[e.key])])),
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
    // For the same reason the future-date rule is checked here too, with the schema's message.
    if (!found.date && draft.date > today)
      found.date = '유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다';
    setIssues(found);
    if (Object.keys(found).length) {
      if (moreKeys.some((key) => found[key])) setMore(true);
      return;
    }
    if (!checked.success) return;
    setSaving(true);
    setServerError('');
    try {
      onSaved(await saveCardioSession(checked.data, session?.id));
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const durationFields = [
    { key: 'hours', label: '운동 시간 시', short: '시', max: 24 },
    { key: 'minutes', label: '운동 시간 분', short: '분', max: 59 },
    { key: 'seconds', label: '운동 시간 초', short: '초', max: 59 },
  ] as const;

  return (
    <Modal title={session ? '유산소 기록 수정' : '새 유산소 기록'} close={close}>
      <form noValidate onSubmit={(e) => void submit(e)}>
        <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <Label className={fieldLabel}>
                종류
                <select
                  className={selectField}
                  value={draft.kind}
                  onChange={(e) => set('kind', e.target.value as CardioKind)}
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
                날짜
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
            <legend className="mb-2 text-meta text-muted-foreground">운동 시간</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {durationFields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label htmlFor={`cardio-${f.key}`} className="w-4 shrink-0 text-meta">
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
              거리 km (선택)
            </label>
            <NumberInput
              id="cardio-distance"
              label="거리 km"
              className="md:pointer-coarse:[&_input]:text-base"
              step={0.5}
              min={0}
              max={1000}
              inputMode="decimal"
              placeholder="미입력"
              value={draft.distance}
              onValueChange={(value) => set('distance', value)}
              {...invalid('distance_km')}
            />
            {issue('distance_km')}
            {draft.kind === 'swimming' && (
              <p className={formHint}>
                수영 거리도 km로 입력하세요. 1,500 m는 1.5입니다. 목록에는 m로 보여 줍니다.
              </p>
            )}
          </div>
          <div className="mb-4 flex flex-col items-start gap-2 text-meta text-muted-foreground">
            <span>체감 강도 (선택)</span>
            <ToggleChips
              label="체감 강도"
              options={feedbackLevels.map((level) => effortLabels[level])}
              value={draft.effort ? [effortLabels[draft.effort]] : []}
              // At most one level: a new press replaces the old one, and pressing the selected
              // level again clears it back to not recorded (the #83 feedback pattern).
              onValueChange={(next) =>
                set(
                  'effort',
                  feedbackLevels.find(
                    (level) => level !== draft.effort && next.includes(effortLabels[level]),
                  ) ?? null,
                )
              }
            />
            {issue('effort')}
          </div>
          <Label className={fieldLabel}>
            메모 (선택)
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
            더 입력하기
            <ChevronDown aria-hidden className={cn('transition-transform', more && 'rotate-180')} />
          </Button>
          {more && (
            <div id="cardio-more" className="grid gap-x-3 sm:grid-cols-2">
              {extras.map((e) => (
                <div key={e.key}>
                  <Label className={fieldLabel}>
                    {e.label} (선택)
                    <Input
                      className={touchText}
                      inputMode="numeric"
                      placeholder="미입력"
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
                  시작 시각 (선택)
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
                  연결할 근력 일지
                  <select
                    className={selectField}
                    value={draft.workout_id}
                    onChange={(e) => set('workout_id', e.target.value)}
                    {...invalid('workout_id')}
                  >
                    <option value="">연결 안 함</option>
                    {linkable.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.title}
                      </option>
                    ))}
                    {linkedElsewhere && (
                      <option value={String(linkedElsewhere.id)}>
                        {linkedElsewhere.title
                          ? `${linkedElsewhere.date.slice(0, 10)} ${linkedElsewhere.title}`
                          : `근력 일지 #${linkedElsewhere.id}`}
                      </option>
                    )}
                  </select>
                </Label>
                {issue('workout_id')}
                <p className={cn(formHint, 'mb-4')}>
                  {linkable.length
                    ? '같은 날짜의 근력 일지 중에서 고릅니다.'
                    : '이 날짜에는 연결할 근력 일지가 없습니다.'}
                </p>
              </div>
            </div>
          )}
        </fieldset>
        {serverError && <AlertBanner className="mt-2">{serverError}</AlertBanner>}
        <ModalFooter>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? '저장 중…' : '유산소 기록 저장'}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={close}>
              취소
            </Button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}
