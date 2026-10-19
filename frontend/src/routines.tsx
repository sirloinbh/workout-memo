import React, { useEffect, useState } from 'react';

const parts = ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'];
const days = ['일', '월', '화', '수', '목', '금', '토'];
type Exercise = {
  exercise: string;
  sets: number | string;
  weight: number | string;
  reps: number | string;
};
type Split = { name: string; body_parts: string[]; exercises: Exercise[] };
type Week = { week: number; kind: string; amount: number | string; deload_metric: string | null };
type Plan = {
  id?: number;
  name: string;
  start_date: string;
  split_count: number;
  weekly_workouts: number;
  rest_days: number[];
  splits: Split[];
  weeks: Week[];
  schedule?: { date: string; week: number; split_index: number; is_deload: boolean }[];
};
const exercise = (): Exercise => ({ exercise: '', sets: '', weight: '', reps: '' });
const split = (i: number): Split => ({
  name: `분할 ${i + 1}`,
  body_parts: [],
  exercises: [exercise()],
});
const newPlan = (): Plan => ({
  name: '',
  start_date: '',
  split_count: 1,
  weekly_workouts: 0,
  rest_days: [],
  splits: [split(0)],
  weeks: Array.from({ length: 12 }, (_, i) => ({
    week: i + 1,
    kind: (i + 1) % 4 === 0 ? 'deload' : 'increase_weight',
    amount: '',
    deload_metric: null,
  })),
});
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
  useEffect(() => {
    let active = true;
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
      <p>운동일마다 분할을 순환합니다. 매주 변화량을 직접 입력하며 4·8·12주차는 디로딩입니다.</p>
      <p>
        증가·감소량은 해당 주의 수동 계획입니다. 실제 일지와 목표 달성은 운동 후 따로 기록하세요.
      </p>
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
            void request<{ id: number }>('', draft)
              .then(async (result) => {
                // The POST has succeeded even if a subsequent read fails.
                // Close this draft so retrying a read cannot duplicate the plan.
                const saved = { ...draft, id: result.id };
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
                onChange={(e) => {
                  const count = Number(e.target.value);
                  setDraft({
                    ...draft,
                    split_count: count,
                    splits: Array.from({ length: count }, (_, i) => draft.splits[i] ?? split(i)),
                  });
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '무분할' : `${n}분할`}
                  </option>
                ))}
              </select>
            </label>
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
          </div>
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
                  {(['sets', 'weight', 'reps'] as const).map((key) => (
                    <label key={key}>
                      {key === 'sets'
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
                        value={ex[key]}
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
          {draft.weeks.map((w, i) => (
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
                      weeks: draft.weeks.map((v, k) =>
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
                      weeks: draft.weeks.map((v, k) =>
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
            {selected.start_date} · 주 {selected.weekly_workouts}회 · 휴식{' '}
            {selected.rest_days.map((d) => days[d]).join(', ') || '없음'}
          </p>
          {selected.splits.map((s, i) => (
            <section key={i}>
              <h4>{s.name}</h4>
              <p>{s.body_parts.join(' → ')}</p>
              <ul>
                {s.exercises.map((ex, j) => (
                  <li key={j}>
                    {ex.exercise} · {ex.sets}세트 · 총중량 {ex.weight} kg · {ex.reps}회
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <ol>
            {selected.weeks.map((w) => (
              <li key={w.week}>
                {w.week}주차 · {goalLabel(w)}
              </li>
            ))}
          </ol>
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
