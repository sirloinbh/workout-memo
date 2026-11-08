import { Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { AlertBanner } from './components/alert-banner';
import { Button } from './components/ui/button';
import { Card, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonList } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { defaultWeightStep } from './contract';
import { cn } from './lib/utils';
import { byWeek, kindLabel, previewTargets } from './progression';

// #102: the routine form on the common components. Selects stay native like the journal's
// machine select (#101): the tests and the "자유 운동" empty value rely on a real <select>.
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
const days = ['일', '월', '화', '수', '목', '금', '토'];
type Exercise = {
  exercise: string;
  machine_id?: number | null;
  sets: number | string;
  weight: number | string;
  reps: number | string;
  rep_min?: number | string;
  rep_max?: number | string;
};
type Split = { name: string; body_parts: string[]; exercises: Exercise[] };
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
  name: `분할 ${i + 1}`,
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
function withSplitDefaults(plan: Plan, count: number): Plan {
  const d = splitDefaults[count];
  return {
    ...plan,
    split_count: count,
    cycle: { train_days: d.train, rest_days: d.rest },
    splits: Array.from({ length: count }, (_, i) => ({
      ...(plan.splits[i] ?? split(i)),
      body_parts: [...d.parts[i]],
    })),
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
  '현재 수행 능력(총중량·반복 수)을 입력하면 12주 목표를 자동으로 만듭니다. 종목이 들어 있는 분할의 세션(운동일)마다 반복 수를 1회씩 늘리고, 상한을 넘으면 총중량을 운동별 증량 단위(기본 5 kg, 나의 목표에서 운동마다 변경)만큼 올리고 반복 수를 하한으로 되돌립니다. 주 2~3번 하는 분할은 한 주에 2~3단계 진행합니다. 0 kg(맨몸) 종목은 반복 수만 늘립니다. 4·8·12주차의 세션은 모두 직전 목표 중량의 90%(2.5 kg 단위)·같은 반복 수로 디로딩하며 진행하지 않고, 다음 세션은 디로딩 직전 목표에서 이어갑니다. 세션 날짜부터 같은 분할의 다음 세션 전까지 저장한 일지에서 목표를 달성하지 못하면 다음 세션도 같은 목표를 유지합니다.';
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
    splits: plan.splits.map((s) => ({
      ...s,
      // A free exercise omits machine_id, so plans without machines keep their shape.
      exercises: s.exercises.map(({ rep_min, rep_max, machine_id, ...rest }) => {
        const value = machine_id == null ? rest : { ...rest, machine_id };
        return auto ? { ...value, rep_min, rep_max } : value;
      }),
    })),
  };
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
function Preview({
  plan,
  steps,
  heading: Heading = 'h4',
}: {
  plan: Plan;
  steps: Steps;
  heading?: 'h3' | 'h4';
}) {
  const preview = previewTargets(withSteps(plan, steps));
  if (!preview)
    return (
      <p className={cn(hint, 'my-5')}>
        시작일과 일정(주기 또는 휴식 요일)을 입력하면 12주 예상 목표를 표시합니다.
      </p>
    );
  return (
    <section data-slot="routine-preview" className="my-5 rounded-xl border p-4">
      <Heading className="mb-2 text-body-sm font-semibold">
        12주 예상 목표 · 기록에 따라 바뀔 수 있음
      </Heading>
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
                    {`${w.week}주차${w.week % 4 === 0 ? ' 디로딩' : ''}: `}
                    {w.rows
                      .map(
                        (r) =>
                          `${r.session}번째 ${String(r.weight)} kg × ${r.reps}회(${kindLabel(r)})`,
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
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/routines' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? '루틴 요청에 실패했습니다');
  return data;
}
type Machine = { id: number; brand: string; name: string };
const machineName = (machines: Machine[], id: number | null | undefined) => {
  const m = id == null ? undefined : machines.find((v) => v.id === id);
  return m ? `${m.brand} · ${m.name}` : null;
};
const goalLabel = (w: Week) =>
  w.kind === 'deload'
    ? `디로딩 · ${w.deload_metric === 'weight' ? '총중량 kg' : w.deload_metric === 'sets' ? '세트 수' : '반복 수'} ${w.amount} 감소`
    : `${w.kind === 'increase_weight' ? '총중량 kg' : '반복 수'} ${w.amount} 증가`;

export function Routines() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Steps>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  useEffect(() => {
    let active = true;
    void fetch('/api/exercise-weight-steps')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { exercise: string; weight_step: number }[]) => {
        if (active && Array.isArray(rows))
          setSteps(Object.fromEntries(rows.map((r) => [r.exercise, r.weight_step])));
      })
      .catch(() => undefined);
    // #82: machines are optional; a failed load only leaves the select empty.
    void fetch('/api/machines')
      .then((r) => (r.ok ? (r.json() as Promise<Machine[]>) : []))
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
      <h2 className="mb-2 text-body font-semibold">루틴짜기 · 12주 계획</h2>
      <p className="text-body-sm text-muted-foreground">
        운동일마다 분할을 순환하며 4·8·12주차는 디로딩입니다. 자동 목표는 현재 수행 능력에서 12주
        목표를 계산하고, 수동 목표는 주차별 변화량을 직접 입력합니다.
      </p>
      <p className="mb-4 text-body-sm text-muted-foreground">
        계획은 목표일 뿐이며 실제 수행은 운동 일지에 따로 기록하세요.
      </p>
      {error && <AlertBanner>{error}</AlertBanner>}
      <Notice
        className="mb-3"
        notice={
          savedId !== null
            ? { kind: 'status', text: `루틴 #${savedId}을 저장했습니다.` }
            : undefined
        }
      />
      <Button
        disabled={saving}
        onClick={() => {
          setDraft(newPlan());
          setSelected(null);
          setError('');
          setSavedId(null);
        }}
      >
        <Plus aria-hidden />새 루틴 만들기
      </Button>
      {/* #173: the status line stays for screen readers; row placeholders show the list loading. */}
      <Notice
        className="sr-only"
        notice={loading ? { kind: 'status', text: '루틴 불러오는 중…' } : undefined}
      />
      {loading && !plans.length && (
        <div aria-busy="true" className="mt-3 rounded-lg border p-4">
          <SkeletonList rows={2} />
        </div>
      )}
      {!loading && !plans.length && (
        <p className="mt-3 text-body-sm text-muted-foreground">저장된 루틴이 없습니다.</p>
      )}
      {plans.length > 0 && (
        <ul data-slot="plan-list" className="mt-3 divide-y rounded-lg border">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 text-body-sm [overflow-wrap:anywhere]">{p.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setError('');
                  void request<Plan>('/' + p.id)
                    .then((value) => {
                      setSelected(value);
                      setDraft(null);
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                계획 보기
              </Button>
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <Card className="mt-5 gap-0 px-4 py-5 shadow-none md:px-6 md:py-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saving) return;
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
            <Label className={cn(fieldLabel, 'mb-3')}>
              주차 목표 방식
              <select
                className={nativeSelect}
                value={draft.progression ?? 'manual'}
                onChange={(e) =>
                  setDraft({ ...draft, progression: e.target.value as 'manual' | 'auto' })
                }
              >
                <option value="auto">자동 · 이중 점진 과부하</option>
                <option value="manual">수동 · 주차별 직접 입력</option>
              </select>
            </Label>
            {draft.progression === 'auto' && <p className={cn(hint, 'mb-3')}>{autoRule}</p>}
            <Label className={cn(fieldLabel, 'mb-3')}>
              루틴 이름
              <Input
                className={touchText}
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
              <Label className={fieldLabel}>
                시작일
                <Input
                  className={touchText}
                  required
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                />
              </Label>
              <Label className={fieldLabel}>
                분할 방식
                <select
                  className={nativeSelect}
                  value={draft.split_count}
                  onChange={(e) => setDraft(withSplitDefaults(draft, Number(e.target.value)))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? '무분할' : `${n}분할`}
                    </option>
                  ))}
                </select>
              </Label>
              <Label className={fieldLabel}>
                운동 일정 방식
                <select
                  className={nativeSelect}
                  value={draft.schedule_mode ?? 'weekday'}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule_mode: e.target.value as 'weekday' | 'cycle' })
                  }
                >
                  <option value="cycle">주기 · N일 운동 후 M일 휴식</option>
                  <option value="weekday">요일 · 휴식 요일 지정</option>
                </select>
              </Label>
              {draft.schedule_mode === 'cycle' ? (
                <>
                  <Label className={fieldLabel}>
                    연속 운동일
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
                    이어지는 휴식일
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
                  주당 운동 횟수
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
                시작일부터 운동일과 휴식일을 반복합니다. 분할 방식을 고르면 기본 주기와 부위를
                채우며, 바꿀 수 있습니다.
              </p>
            ) : (
              <fieldset className={box}>
                <legend className={legend}>휴식 요일 · 운동 횟수와 합계 7일</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {days.map((day, i) => (
                    <Label key={day} className="min-h-9 gap-2 text-body-sm pointer-coarse:min-h-11">
                      <Checkbox
                        id={`rest-day-${i}`}
                        // Same as the machine form (#231): the box stays 16px against the legacy 44px button
                        // rule and its ::after area is 44px. Drop once project-standards#415 lands.
                        className="pointer-coarse:min-h-4 pointer-coarse:min-w-4 pointer-coarse:after:-inset-[15px]"
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
            {draft.splits.map((s, i) => (
              <fieldset key={i} className={box}>
                <legend className={legend}>분할 {i + 1}</legend>
                <Label className={fieldLabel}>
                  분할 이름
                  <Input
                    className={touchText}
                    required
                    value={s.name}
                    maxLength={120}
                    onChange={(e) => changeSplit(i, { ...s, name: e.target.value })}
                  />
                </Label>
                <p className="mt-3 mb-2 text-meta text-muted-foreground">
                  부위 버튼을 누를 때마다 순서대로 추가됩니다. 같은 부위도 여러 번 추가할 수
                  있습니다.
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
                      {p} 추가
                    </Button>
                  ))}
                </div>
                <ol data-slot="split-parts" className="mt-2 flex flex-wrap gap-2">
                  {s.body_parts.map((p, j) => (
                    <li
                      key={j}
                      className="flex items-center gap-1 rounded-full border pl-3 text-body-sm"
                    >
                      {p}{' '}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        aria-label={`분할 ${i + 1} 부위 ${j + 1} 삭제`}
                        onClick={() =>
                          changeSplit(i, {
                            ...s,
                            body_parts: s.body_parts.filter((_, k) => j !== k),
                          })
                        }
                      >
                        삭제
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
                    <Label className={cn(fieldLabel, 'col-span-2 md:col-span-1')}>
                      운동명
                      <Input
                        className={touchText}
                        required
                        maxLength={120}
                        value={ex.exercise}
                        onChange={(e) => setExercise(i, s, j, { exercise: e.target.value })}
                      />
                    </Label>
                    <Label className={cn(fieldLabel, 'col-span-2')}>
                      머신
                      <select
                        className={nativeSelect}
                        value={ex.machine_id ?? ''}
                        onChange={(e) =>
                          setExercise(i, s, j, {
                            machine_id: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      >
                        <option value="">자유 운동</option>
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
                              sets: '세트 수',
                              weight: '현재 총중량 (kg, 머신 기본중량 포함)',
                              reps: '현재 반복 수',
                              rep_min: '반복 하한',
                              rep_max: '반복 상한',
                            }[key]
                          : key === 'sets'
                            ? '기준 세트 수'
                            : key === 'weight'
                              ? '기준 총중량 (kg, 머신 기본중량 포함)'
                              : '기준 반복 수'}
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
                        운동 삭제
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => changeSplit(i, { ...s, exercises: [...s.exercises, exercise()] })}
                >
                  <Plus aria-hidden />
                  운동 추가
                </Button>
              </fieldset>
            ))}
            {draft.progression === 'auto' && <Preview plan={draft} steps={steps} heading="h3" />}
            {draft.progression !== 'auto' &&
              draft.weeks?.map((w, i) => (
                <fieldset key={w.week} className={cn(box, 'grid grid-cols-2 gap-3')}>
                  <legend className={legend}>
                    {w.week}주차 {w.kind === 'deload' ? '디로딩' : '증가 목표'}
                  </legend>
                  <Label className={fieldLabel}>
                    {w.kind === 'deload' ? '감소 대상' : '증가 대상'}
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
                            감소 대상 선택
                          </option>
                          <option value="weight">총중량 (kg)</option>
                          <option value="sets">세트 수</option>
                          <option value="reps">반복 수</option>
                        </>
                      ) : (
                        <>
                          <option value="increase_weight">총중량 (kg)</option>
                          <option value="increase_reps">반복 수</option>
                        </>
                      )}
                    </select>
                  </Label>
                  <Label className={fieldLabel}>
                    {w.kind === 'deload' ? '감소량' : '증가량'}
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
            <div className="mt-5 flex flex-wrap gap-2">
              <Button disabled={saving}>
                {saving && <Spinner size="sm" aria-hidden />}
                {saving ? '저장 중…' : '루틴 저장하기'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                취소
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
              {selected.split_count === 1 ? '무분할' : `${selected.split_count}분할`} · 시작일{' '}
              {selected.start_date} ·{' '}
              {selected.schedule_mode === 'cycle' && selected.cycle
                ? `${selected.cycle.train_days}일 운동 · ${selected.cycle.rest_days}일 휴식 반복`
                : `주 ${selected.weekly_workouts}회 · 휴식 ${
                    selected.rest_days.map((d) => days[d]).join(', ') || '없음'
                  }`}
            </p>
            {selected.splits.map((s, i) => (
              <section key={i} className="mt-4 border-t pt-3">
                <h4 className="text-body-sm font-semibold [overflow-wrap:anywhere]">{s.name}</h4>
                <p className="mt-1 text-meta text-muted-foreground">{s.body_parts.join(' → ')}</p>
                <ul className={list}>
                  {s.exercises.map((ex, j) => (
                    <li key={j} className="[overflow-wrap:anywhere]">
                      {ex.exercise}
                      {machineName(machines, ex.machine_id) &&
                        ` (${machineName(machines, ex.machine_id)})`}{' '}
                      · {ex.sets}세트 · 총중량 {ex.weight} kg · {ex.reps}회
                      {selected.progression === 'auto' &&
                        ` · 반복 범위 ${ex.rep_min}~${ex.rep_max}회 · 증량 단위 ${stepOf(steps, ex.exercise)} kg`}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {selected.progression === 'auto' ? (
              <>
                <p className={cn(hint, 'mt-4')}>자동 · 이중 점진 과부하. {autoRule}</p>
                <Preview plan={selected} steps={steps} />
              </>
            ) : (
              <section className="mt-4 border-t pt-3">
                <h4 className="text-body-sm font-semibold">주차별 목표</h4>
                <ol className={list}>
                  {selected.weeks?.map((w) => (
                    <li
                      key={w.week}
                      data-deload={w.kind === 'deload' || undefined}
                      className="text-muted-foreground data-deload:font-medium data-deload:text-foreground"
                    >
                      {w.week}주차 · {goalLabel(w)}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="mt-4 border-t pt-3">
              <h4 className="text-body-sm font-semibold">
                운동 일정 · 시작일부터 12주 (Asia/Seoul)
              </h4>
              <ul className={cn(list, 'md:columns-2 md:gap-6')}>
                {selected.schedule?.map((day) => (
                  <li
                    key={day.date}
                    data-deload={day.is_deload || undefined}
                    className="break-inside-avoid [overflow-wrap:anywhere] text-muted-foreground data-deload:text-foreground"
                  >
                    {day.date} · {day.week}주차 · {selected.splits[day.split_index].name}
                    {day.is_deload ? ' · 디로딩' : ''}
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
