import { Plus, Timer } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

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

// #116: cardio goals on the 나의 목표 page, next to the strength goals. The server judges them;
// this screen only shows the judgment. The kind labels and time format repeat the ones of the
// cardio session screen (#115, frontend/src/cardio/format.ts); merge them there once it lands.
const kindLabels: Record<CardioKind, string> = {
  running: '러닝',
  walking: '걷기',
  outdoor_cycling: '실외 사이클',
  indoor_cycling: '실내 자전거',
  rowing: '로잉',
  stairs: '계단',
  elliptical: '일립티컬',
  swimming: '수영',
  other: '기타',
};
const typeLabels: Record<CardioGoalType, string> = {
  distance: '거리 누적',
  duration: '시간 누적',
  count: '횟수 누적',
  record_time: '기록 시간 (거리를 시간 안에)',
  longest_distance: '최장 거리',
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

const km = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(n);
/** Seconds as 1:05:09 or 28:30. */
function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
/** Seconds as 2시간 30분 (totals are shown in minutes). */
const minutes = (seconds: number) => {
  const total = Math.floor(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
};
const amount = (goal: StoredGoal, value: number) =>
  goal.goal_type === 'count'
    ? `${value}회`
    : goal.goal_type === 'duration'
      ? minutes(value)
      : `${km(value)} km`;
const targetOf = (goal: StoredGoal) =>
  goal.goal_type === 'count'
    ? goal.target_count!
    : goal.goal_type === 'duration'
      ? goal.target_duration_sec!
      : goal.target_distance_km!;

/** The goal in one line, e.g. "주간 러닝 15 km" or "러닝 5 km 30:00 이내". */
function goalTitle(goal: StoredGoal) {
  const kind = goal.kind ? kindLabels[goal.kind] : '유산소';
  if (goal.goal_type === 'record_time')
    return `${kind} ${km(goal.target_distance_km!)} km ${clock(goal.target_duration_sec!)} 이내`;
  if (goal.goal_type === 'longest_distance')
    return `${kind} 한 번에 ${km(goal.target_distance_km!)} km`;
  return `${goal.period === 'week' ? '주간' : '월간'} ${kind} ${amount(goal, targetOf(goal))}`;
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
    if (!res.ok) throw Error(data.error ?? '유산소 목표 요청에 실패했습니다');
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
  const [editor, setEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = seoulDate();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setGoals(await request<StoredGoal[]>(''));
    } catch (e) {
      setError(`유산소 목표를 불러오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function save(goal: CardioGoalInput) {
    setSaving(true);
    try {
      await request('', 'POST', goal);
      setEditor(false);
      setStatus('유산소 목표를 저장했습니다.');
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function remove(goal: StoredGoal) {
    if (!confirm('이 유산소 목표를 삭제할까요?')) return;
    setSaving(true);
    setError('');
    try {
      await request('/' + goal.id, 'DELETE');
      setStatus('유산소 목표를 삭제했습니다.');
      await load();
    } catch (e) {
      setError(`유산소 목표를 삭제하지 못했습니다: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="cardio-goals-title" className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cardio-goals-title" className="text-body font-semibold">
            유산소 목표
          </h2>
          <p className="text-caption text-muted-foreground">
            주간·월간 거리·시간·횟수와 기록 목표를 유산소 기록으로 판정합니다.
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditor(true)}>
          <Plus aria-hidden />
          유산소 목표 추가
        </Button>
      </div>
      {error && (
        <AlertBanner
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              다시 연결
            </Button>
          }
        >
          {error}
        </AlertBanner>
      )}
      <Notice className="mb-3" notice={status ? { kind: 'status', text: status } : undefined} />
      {loading && goals.length === 0 ? (
        <div aria-busy="true" aria-label="유산소 목표" className="grid gap-5 md:grid-cols-2">
          <p role="status" className="sr-only">
            유산소 목표 불러오는 중…
          </p>
          <SkeletonCard />
        </div>
      ) : goals.length === 0 ? (
        !error && (
          <EmptyState
            icon={<Timer />}
            title="유산소 목표가 없습니다"
            description="예: 주 3회 러닝, 주간 15 km, 5 km 30분 이내"
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
            />
          ))}
        </div>
      )}
      {editor && (
        <Modal title="유산소 목표" close={() => setEditor(false)}>
          <CardioGoalForm deadline={deadline} saving={saving} onSave={save} />
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
}: {
  goal: StoredGoal;
  today: string;
  saving: boolean;
  remove: (goal: StoredGoal) => void;
}) {
  const title = goalTitle(goal);
  const upcoming = today < goal.start_date;
  const ended = today > goal.deadline;
  const p = goal.progress;
  // Period goals are "achieved" only for the current period, so an ended one reads 기간 종료.
  const badge = goal.achieved
    ? { variant: 'success' as const, text: '달성 완료' }
    : ended
      ? { variant: 'warning' as const, text: '기간 종료' }
      : upcoming
        ? { variant: 'outline' as const, text: '시작 전' }
        : { variant: 'outline' as const, text: '도전 중' };
  const unit = goal.period === 'week' ? '주' : '달';
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
                이번 {unit} {amount(goal, p.current.value)}{' '}
                <span className="text-muted-foreground">/ {amount(goal, targetOf(goal))}</span>
              </p>
              <div
                role="progressbar"
                aria-label={`${title} 이번 ${unit} 진행률`}
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
            달성한 {unit} {p.periods_achieved} / 전체 {p.periods.length}
            {unit}
          </p>
        </>
      ) : (
        <p className="mt-5 text-body-sm">
          {goal.goal_type === 'record_time'
            ? p.best === null
              ? `${km(goal.target_distance_km!)} km 이상 기록이 아직 없어요.`
              : `가장 빠른 기록 ${clock(p.best)}`
            : p.best === null
              ? '거리가 있는 기록이 아직 없어요.'
              : `가장 긴 거리 ${km(p.best)} km`}
        </p>
      )}
      <p className="mt-3 text-body-sm text-muted-foreground">
        {goal.start_date} — {goal.deadline}
      </p>
      <Button
        variant="link"
        size="sm"
        className="mt-3 px-0"
        aria-label={`${title} 목표 삭제`}
        disabled={saving}
        onClick={() => remove(goal)}
      >
        목표 삭제
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
const num = (text: string) => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')));

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
    target_distance_km: usesDistance ? num(d.distance) : null,
    target_duration_sec: usesTime ? duration : null,
    target_count: d.goal_type === 'count' ? num(d.count) : null,
    start_date: d.start_date,
    deadline: d.deadline,
  };
}

function CardioGoalForm({
  deadline,
  saving,
  onSave,
}: {
  deadline: string;
  saving: boolean;
  onSave: (goal: CardioGoalInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({
    goal_type: 'distance',
    kind: '',
    period: 'week',
    distance: '',
    minutes: '',
    seconds: '',
    count: '',
    start_date: seoulDate(),
    deadline,
  });
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
      found.target_duration_sec = '목표 시간은 분(0 이상 정수)과 초(0~59 정수)로 입력하세요';
    if (!parsed.success || Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setFailure('');
    try {
      await onSave(parsed.data);
    } catch (e) {
      setFailure(`유산소 목표를 저장하지 못했습니다: ${(e as Error).message}`);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      {failure && <AlertBanner>{failure}</AlertBanner>}
      <div className="grid grid-cols-2 gap-x-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
        <Label className={fieldLabel}>
          목표 종류
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
          운동 종류
          <select
            className={selectField}
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as CardioKind | '' })}
            {...field('kind')}
          >
            {!record && <option value="">전체 유산소</option>}
            {record && draft.kind === '' && <option value="">선택하세요</option>}
            {cardioKinds.map((k) => (
              <option key={k} value={k}>
                {kindLabels[k]}
              </option>
            ))}
          </select>
        </Label>
        {!record && (
          <Label className={fieldLabel}>
            기간 단위
            <select
              className={selectField}
              value={draft.period}
              onChange={(e) => set({ period: e.target.value as 'week' | 'month' })}
              {...field('period')}
            >
              <option value="week">주간 (월~일)</option>
              <option value="month">월간</option>
            </select>
          </Label>
        )}
        {draft.goal_type !== 'duration' && draft.goal_type !== 'count' && (
          <Label className={fieldLabel}>
            목표 거리 (km)
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
              목표 시간 (분)
              <Input
                className={touchText}
                inputMode="numeric"
                value={draft.minutes}
                onChange={(e) => set({ minutes: e.target.value })}
                {...field('target_duration_sec')}
              />
            </Label>
            <Label className={fieldLabel}>
              목표 시간 (초)
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
            목표 횟수
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
          시작일
          <Input
            className={touchText}
            type="date"
            value={draft.start_date}
            onChange={(e) => set({ start_date: e.target.value })}
            {...field('start_date')}
          />
        </Label>
        <Label className={fieldLabel}>
          종료일
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
            ? '한 번의 기록이 목표 거리 이상이고 그 기록의 전체 시간이 목표 시간 이하이면 달성입니다. 페이스로 추정하지 않습니다.'
            : '한 번의 기록이 목표 거리 이상이면 달성입니다.'
          : '주(월~일) 또는 달마다 판정합니다. 시작일·종료일에 걸친 주기도 목표값은 그대로이고, 기간 안의 기록만 셉니다.'}
      </p>
      <Button className="mt-4 w-full" disabled={saving}>
        {saving && <Spinner size="sm" aria-hidden />}
        유산소 목표 저장하기
      </Button>
    </form>
  );
}
