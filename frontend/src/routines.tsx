import React, { useEffect, useState } from 'react';
import { defaultWeightStep } from './contract';
import { byWeek, kindLabel, previewTargets } from './progression';

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
function Preview({ plan, steps }: { plan: Plan; steps: Steps }) {
  const preview = previewTargets(withSteps(plan, steps));
  if (!preview)
    return <p>시작일과 일정(주기 또는 휴식 요일)을 입력하면 12주 예상 목표를 표시합니다.</p>;
  return (
    <section className="routine-preview">
      <h4>12주 예상 목표 · 기록에 따라 바뀔 수 있음</h4>
      {preview.map((split, i) =>
        split
          .filter((ex) => ex.exercise.trim())
          .map((ex, j) => (
            <details key={`${i}-${j}`} open>
              <summary>
                {plan.splits[i].name} · {ex.exercise}
              </summary>
              <ol>
                {byWeek(ex.rows).map((w) => (
                  <li key={w.week} className={w.week % 4 === 0 ? 'deload' : ''}>
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
  return (
    <section className="routine-page">
      <h2>루틴짜기 · 12주 계획</h2>
      <p>
        운동일마다 분할을 순환하며 4·8·12주차는 디로딩입니다. 자동 목표는 현재 수행 능력에서 12주
        목표를 계산하고, 수동 목표는 주차별 변화량을 직접 입력합니다.
      </p>
      <p>계획은 목표일 뿐이며 실제 수행은 운동 일지에 따로 기록하세요.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {savedId !== null && <p role="status">루틴 #{savedId}을 저장했습니다.</p>}
      <button
        className="primary"
        disabled={saving}
        onClick={() => {
          setDraft(newPlan());
          setSelected(null);
          setError('');
          setSavedId(null);
        }}
      >
        새 루틴 만들기
      </button>
      {loading && <p role="status">루틴 불러오는 중…</p>}
      {!loading && !plans.length && <p>저장된 루틴이 없습니다.</p>}
      <ul>
        {plans.map((p) => (
          <li key={p.id}>
            {p.name}{' '}
            <button
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
            </button>
          </li>
        ))}
      </ul>
      {draft && (
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
          <label>
            주차 목표 방식
            <select
              value={draft.progression ?? 'manual'}
              onChange={(e) =>
                setDraft({ ...draft, progression: e.target.value as 'manual' | 'auto' })
              }
            >
              <option value="auto">자동 · 이중 점진 과부하</option>
              <option value="manual">수동 · 주차별 직접 입력</option>
            </select>
          </label>
          {draft.progression === 'auto' && <p className="form-hint">{autoRule}</p>}
          <label>
            루틴 이름
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              시작일
              <input
                required
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </label>
            <label>
              분할 방식
              <select
                value={draft.split_count}
                onChange={(e) => setDraft(withSplitDefaults(draft, Number(e.target.value)))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '무분할' : `${n}분할`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              운동 일정 방식
              <select
                value={draft.schedule_mode ?? 'weekday'}
                onChange={(e) =>
                  setDraft({ ...draft, schedule_mode: e.target.value as 'weekday' | 'cycle' })
                }
              >
                <option value="cycle">주기 · N일 운동 후 M일 휴식</option>
                <option value="weekday">요일 · 휴식 요일 지정</option>
              </select>
            </label>
            {draft.schedule_mode === 'cycle' ? (
              <>
                <label>
                  연속 운동일
                  <input
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
                </label>
                <label>
                  이어지는 휴식일
                  <input
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
                </label>
              </>
            ) : (
              <label>
                주당 운동 횟수
                <input
                  required
                  type="number"
                  min={1}
                  max={7}
                  value={draft.weekly_workouts || ''}
                  onChange={(e) => setDraft({ ...draft, weekly_workouts: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          {draft.schedule_mode === 'cycle' ? (
            <p className="form-hint">
              시작일부터 운동일과 휴식일을 반복합니다. 분할 방식을 고르면 기본 주기와 부위를 채우며,
              바꿀 수 있습니다.
            </p>
          ) : (
            <fieldset>
              <legend>휴식 요일 · 운동 횟수와 합계 7일</legend>
              {days.map((day, i) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={draft.rest_days.includes(i)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rest_days: e.target.checked
                          ? [...draft.rest_days, i].sort()
                          : draft.rest_days.filter((d) => d !== i),
                      })
                    }
                  />
                  {day}
                </label>
              ))}
            </fieldset>
          )}
          {draft.splits.map((s, i) => (
            <fieldset key={i}>
              <legend>분할 {i + 1}</legend>
              <label>
                분할 이름
                <input
                  required
                  value={s.name}
                  maxLength={120}
                  onChange={(e) => changeSplit(i, { ...s, name: e.target.value })}
                />
              </label>
              <p>
                부위 버튼을 누를 때마다 순서대로 추가됩니다. 같은 부위도 여러 번 추가할 수 있습니다.
              </p>
              {parts.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => changeSplit(i, { ...s, body_parts: [...s.body_parts, p] })}
                >
                  {p} 추가
                </button>
              ))}
              <ol>
                {s.body_parts.map((p, j) => (
                  <li key={j}>
                    {p}{' '}
                    <button
                      type="button"
                      aria-label={`분할 ${i + 1} 부위 ${j + 1} 삭제`}
                      onClick={() =>
                        changeSplit(i, { ...s, body_parts: s.body_parts.filter((_, k) => j !== k) })
                      }
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ol>
              {s.exercises.map((ex, j) => (
                <div className="routine-exercise" key={j}>
                  <label>
                    운동명
                    <input
                      required
                      maxLength={120}
                      value={ex.exercise}
                      onChange={(e) =>
                        changeSplit(i, {
                          ...s,
                          exercises: s.exercises.map((v, k) =>
                            k === j ? { ...v, exercise: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    머신
                    <select
                      value={ex.machine_id ?? ''}
                      onChange={(e) =>
                        changeSplit(i, {
                          ...s,
                          exercises: s.exercises.map((v, k) =>
                            k === j
                              ? {
                                  ...v,
                                  machine_id: e.target.value ? Number(e.target.value) : null,
                                }
                              : v,
                          ),
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
                  </label>
                  {(draft.progression === 'auto'
                    ? (['sets', 'weight', 'reps', 'rep_min', 'rep_max'] as const)
                    : (['sets', 'weight', 'reps'] as const)
                  ).map((key) => (
                    <label key={key}>
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
                      <input
                        required
                        type="number"
                        min={key === 'weight' ? 0 : 1}
                        max={key === 'weight' ? 99999 : key === 'sets' ? 200 : 1000}
                        step={key === 'weight' ? 'any' : 1}
                        value={ex[key] ?? ''}
                        onChange={(e) =>
                          changeSplit(i, {
                            ...s,
                            exercises: s.exercises.map((v, k) =>
                              k === j
                                ? {
                                    ...v,
                                    [key]: e.target.value === '' ? '' : Number(e.target.value),
                                  }
                                : v,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={s.exercises.length === 1}
                    onClick={() =>
                      changeSplit(i, { ...s, exercises: s.exercises.filter((_, k) => k !== j) })
                    }
                  >
                    운동 삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => changeSplit(i, { ...s, exercises: [...s.exercises, exercise()] })}
              >
                운동 추가
              </button>
            </fieldset>
          ))}
          {draft.progression === 'auto' && <Preview plan={draft} steps={steps} />}
          {draft.progression !== 'auto' &&
            draft.weeks?.map((w, i) => (
              <fieldset key={w.week}>
                <legend>
                  {w.week}주차 {w.kind === 'deload' ? '디로딩' : '증가 목표'}
                </legend>
                <label>
                  {w.kind === 'deload' ? '감소 대상' : '증가 대상'}
                  <select
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
                </label>
                <label>
                  {w.kind === 'deload' ? '감소량' : '증가량'}
                  <input
                    required
                    type="number"
                    min={
                      w.kind === 'increase_weight' || w.deload_metric === 'weight' ? '0.000001' : 1
                    }
                    max={
                      w.deload_metric === 'sets'
                        ? 200
                        : w.kind === 'increase_reps' || w.deload_metric === 'reps'
                          ? 1000
                          : 99999
                    }
                    step={w.kind === 'increase_weight' || w.deload_metric === 'weight' ? 'any' : 1}
                    value={w.amount}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        weeks: draft.weeks!.map((v, k) =>
                          k === i
                            ? { ...v, amount: e.target.value === '' ? '' : Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
              </fieldset>
            ))}
          <button className="primary" disabled={saving}>
            {saving ? '저장 중…' : '루틴 저장하기'}
          </button>
          <button type="button" disabled={saving} onClick={() => setDraft(null)}>
            취소
          </button>
        </form>
      )}
      {selected && (
        <article>
          <h3>{selected.name}</h3>
          <p>
            {selected.split_count === 1 ? '무분할' : `${selected.split_count}분할`} · 시작일{' '}
            {selected.start_date} ·{' '}
            {selected.schedule_mode === 'cycle' && selected.cycle
              ? `${selected.cycle.train_days}일 운동 · ${selected.cycle.rest_days}일 휴식 반복`
              : `주 ${selected.weekly_workouts}회 · 휴식 ${
                  selected.rest_days.map((d) => days[d]).join(', ') || '없음'
                }`}
          </p>
          {selected.splits.map((s, i) => (
            <section key={i}>
              <h4>{s.name}</h4>
              <p>{s.body_parts.join(' → ')}</p>
              <ul>
                {s.exercises.map((ex, j) => (
                  <li key={j}>
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
              <p>자동 · 이중 점진 과부하. {autoRule}</p>
              <Preview plan={selected} steps={steps} />
            </>
          ) : (
            <ol>
              {selected.weeks?.map((w) => (
                <li key={w.week}>
                  {w.week}주차 · {goalLabel(w)}
                </li>
              ))}
            </ol>
          )}
          <h4>운동 일정 · 시작일부터 12주 (Asia/Seoul)</h4>
          <ul>
            {selected.schedule?.map((day) => (
              <li key={day.date}>
                {day.date} · {day.week}주차 · {selected.splits[day.split_index].name}{' '}
                {day.is_deload ? '· 디로딩' : ''}
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
