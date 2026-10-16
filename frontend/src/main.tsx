import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  Plus,
  Dumbbell,
  LayoutDashboard,
  NotebookPen,
  Target,
  Settings2,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  ArrowRight,
  Activity,
} from 'lucide-react';
import './style.css';
type SetRow = { exercise: string; machine_id: number | null; weight: number; reps: number };
type Workout = { id: number; date: string; title: string; notes: string; sets: SetRow[] };
type Machine = {
  id: number;
  brand_id: number;
  brand: string;
  name: string;
  base_weight: number | null;
  notes: string;
};
type Goal = {
  id: number;
  exercise: string;
  target_weight: number;
  target_reps: number;
  start_date: string;
  deadline: string;
  achieved: boolean;
};
const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
// Calendar dates use UTC arithmetic so device time zones and DST cannot shift boundaries.
const calendarDate = (value: string) => new Date(value + 'T12:00:00Z');
const cleanDate = (v: string) => v.slice(0, 10);
const dateLabel = (v: string) =>
  calendarDate(cleanDate(v)).toLocaleDateString('ko-KR', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
const vol = (w: Workout) => w.sets.reduce((n, s) => n + Number(s.weight) * s.reps, 0);
const fmt = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(n);
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? '요청에 실패했습니다');
  return data;
}
function App() {
  const [page, setPage] = useState('overview'),
    [period, setPeriod] = useState('week'),
    [anchor, setAnchor] = useState(today()),
    [workouts, setWorkouts] = useState<Workout[]>([]),
    [goals, setGoals] = useState<Goal[]>([]),
    [machines, setMachines] = useState<Machine[]>([]),
    [brands, setBrands] = useState<{ id: number; name: string }[]>([]),
    [brand, setBrand] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [editor, setEditor] = useState<Partial<Workout> | null>(null),
    [goalEditor, setGoalEditor] = useState(false),
    [machineEditor, setMachineEditor] = useState<Partial<Machine> | null>(null);
  const range = () => {
    const start = calendarDate(anchor);
    let end = new Date(start);
    if (period === 'week') {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
    } else if (period === 'month') {
      start.setUTCDate(1);
      end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
    } else if (period === '4weeks' || period === '12weeks') {
      start.setUTCDate(start.getUTCDate() - (period === '4weeks' ? 27 : 83));
    }
    return { from: iso(start), to: iso(end) };
  };
  const { from, to } = range();
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setLoading(true);
    try {
      const [w, g, m, b] = await Promise.all([
        api<Workout[]>(`/workouts?from=${from}&to=${to}`),
        api<Goal[]>('/goals'),
        api<Machine[]>('/machines'),
        api<{ id: number; name: string }[]>('/brands'),
      ]);
      // Only the newest refresh may update data, errors, or loading state.
      if (version !== refreshVersion.current) return;
      setWorkouts(w);
      setGoals(g);
      setMachines(m);
      setBrands(b);
      setError('');
    } catch (e) {
      if (version === refreshVersion.current) setError((e as Error).message);
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [from, to]);
  const latestRefresh = useRef(refresh);
  useEffect(() => {
    latestRefresh.current = refresh;
    void refresh();
  }, [refresh]);
  async function action(fn: () => Promise<unknown>, done?: () => void) {
    setSaving(true);
    try {
      await fn();
      done?.();
      // A mutation may finish after the user has selected a different period.
      await latestRefresh.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const newWorkout = () =>
    setEditor({
      date: anchor,
      title: '',
      notes: '',
      sets: [{ exercise: '', machine_id: null, weight: 0, reps: 10 }],
    });
  const total = workouts.reduce((n, w) => n + vol(w), 0),
    totalSets = workouts.reduce((n, w) => n + w.sets.length, 0),
    days = new Set(workouts.map((w) => cleanDate(w.date))).size;
  const nav = [
    ['overview', '대시보드', LayoutDashboard],
    ['journal', '운동 일지', NotebookPen],
    ['goals', '나의 목표', Target],
    ['machines', '머신 라이브러리', Dumbbell],
  ] as const;
  function move(dir: number) {
    const d = calendarDate(anchor);
    if (period === 'month') {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + dir);
    } else
      d.setUTCDate(
        d.getUTCDate() +
          dir * (period === 'day' ? 1 : period === 'week' ? 7 : period === '4weeks' ? 28 : 84),
      );
    setAnchor(iso(d));
  }
  return (
    <div className="shell">
      <aside>
        <a className="logo" href="#" onClick={() => setPage('overview')}>
          <span className="logo-mark">
            <Activity size={24} />
          </span>
          form<span className="logo-dot">.</span>
        </a>
        <div className="workspace-label">MY WORKSPACE</div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
              <Icon size={19} />
              {label}
              {page === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-icon">
            <ArrowUpRight size={20} />
          </span>
          <strong>작은 기록, 더 큰 변화.</strong>
          <p>
            어제의 나보다 한 걸음 더.
            <br />
            꾸준함이 만드는 성장을 기록해요.
          </p>
          <div className="tiny-line" />
        </div>
        <div className="profile">
          <div className="avatar">ME</div>
          <div>
            <strong>나의 트레이닝</strong>
            <small>Personal workspace</small>
          </div>
          <Settings2 size={17} />
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            내 워크스페이스 <ChevronRight size={13} /> <b>{nav.find((n) => n[0] === page)?.[1]}</b>
          </div>
          <span className="private-tag">
            <span />
            나만의 운동 공간
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR PROGRESS, IN FOCUS</div>
              <h1>
                {page === 'overview'
                  ? '꾸준함을 기록하는 공간'
                  : page === 'journal'
                    ? '오늘도 한 걸음 더'
                    : page === 'goals'
                      ? '다음 단계의 나를 향해'
                      : '머신을 알면, 기록이 정확해져요'}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === 'overview'
                  ? '운동의 흐름을 살펴보고, 다음 성장을 준비하세요.'
                  : page === 'journal'
                    ? '모든 세트에는 어제보다 나아진 내가 담겨 있어요.'
                    : page === 'goals'
                      ? '중량과 반복 수로 구체적인 성장 목표를 세워보세요.'
                      : '브랜드별 머신과 기본중량을 나만의 라이브러리에 저장하세요.'}
              </p>
            </div>
            <button
              className="primary"
              onClick={
                page === 'goals'
                  ? () => setGoalEditor(true)
                  : page === 'machines'
                    ? () =>
                        setMachineEditor({
                          brand_id: brands[0]?.id,
                          name: '',
                          base_weight: null,
                          notes: '',
                        })
                    : newWorkout
              }
            >
              <Plus size={18} />
              {page === 'goals' ? '목표 추가' : page === 'machines' ? '머신 등록' : '운동 기록하기'}
            </button>
          </div>
          {error && (
            <div role="alert" className="error">
              {error} <button onClick={() => void refresh()}>다시 연결</button>
            </div>
          )}
          {(page === 'overview' || page === 'journal') && (
            <>
              <div className="period-bar">
                <div className="tabs">
                  {[
                    ['day', '1일'],
                    ['week', '1주'],
                    ['month', '1달'],
                    ['4weeks', '4주'],
                    ['12weeks', '12주'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPeriod(key)}
                      className={period === key ? 'selected' : ''}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="date-control">
                  <button aria-label="이전 기간" onClick={() => move(-1)}>
                    <ChevronLeft size={17} />
                  </button>
                  <input
                    aria-label="기준 날짜"
                    type="date"
                    value={anchor}
                    onChange={(e) => e.target.value && setAnchor(e.target.value)}
                  />
                  <button aria-label="다음 기간" onClick={() => move(1)}>
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className="range-label">
                {from} — {to} <span>선택한 기간의 기록</span>
              </div>
              <div className="stats">
                <Stat
                  label="운동한 날"
                  value={String(days)}
                  unit="일"
                  icon={<NotebookPen size={19} />}
                  foot="기록한 날짜 기준"
                />
                <Stat
                  label="누적 볼륨"
                  value={fmt(total)}
                  unit="kg"
                  icon={<Dumbbell size={19} />}
                  foot="총중량 × 반복 수"
                />
                <Stat
                  label="완료한 세트"
                  value={String(totalSets)}
                  unit="세트"
                  icon={<Activity size={19} />}
                  foot={`${workouts.length}개의 운동 일지`}
                />
                <Stat
                  label="목표 달성"
                  value={String(goals.filter((g) => g.achieved).length)}
                  unit={`/ ${goals.length}`}
                  icon={<Target size={19} />}
                  foot="목표 기간 내 기록 기준"
                />
              </div>
              {page === 'overview' && (
                <div className="overview-grid">
                  <section className="card">
                    <div className="section-title">
                      <div>
                        <h2>트레이닝 볼륨</h2>
                        <p>기록이 쌓일수록 선명해지는 성장</p>
                      </div>
                      <span className="legend">
                        <i />
                        볼륨 (kg)
                      </span>
                    </div>
                    <Chart workouts={workouts} from={from} to={to} />
                  </section>
                  <section className="focus-card">
                    <div className="focus-top">
                      THE NEXT CHAPTER <ArrowUpRight size={19} />
                    </div>
                    <h2>
                      조금 더 무겁게.
                      <br />한 번 더 해내기.
                    </h2>
                    <p>
                      작은 도전이 모여
                      <br />
                      나만의 성장을 만듭니다.
                    </p>
                    <button onClick={() => setPage('goals')}>
                      나의 목표 확인하기 <ArrowRight size={17} />
                    </button>
                    <div className="rings">
                      <span />
                      <span />
                      <span />
                    </div>
                  </section>
                </div>
              )}
              <section className="card journal-card">
                <div className="section-title">
                  <div>
                    <h2>
                      운동 기록 <span className="count">{workouts.length}</span>
                    </h2>
                    <p>오늘의 노력이 내일의 기준이 되도록</p>
                  </div>
                  {page === 'overview' && (
                    <button className="text-button" onClick={() => setPage('journal')}>
                      전체 기록 <ArrowRight size={15} />
                    </button>
                  )}
                </div>
                {loading ? (
                  <div className="empty">기록을 불러오는 중…</div>
                ) : workouts.length === 0 ? (
                  <div className="empty">
                    <NotebookPen size={30} />
                    <h3>첫 번째 기록을 남겨보세요</h3>
                    <p>오늘의 세트부터, 나의 성장 이야기가 시작돼요.</p>
                    <button className="subtle-button" onClick={newWorkout}>
                      <Plus size={16} />
                      운동 기록하기
                    </button>
                  </div>
                ) : (
                  <div className="workout-list">
                    {workouts.map((w) => (
                      <div className="workout-row" key={w.id}>
                        <div className="date-tile">
                          <strong>{Number(cleanDate(w.date).slice(8))}</strong>
                          <small>{Number(cleanDate(w.date).slice(5, 7))}월</small>
                        </div>
                        <div className="workout-info">
                          <h3>{w.title}</h3>
                          <p>
                            {dateLabel(w.date)} ·{' '}
                            {Array.from(new Set(w.sets.map((s) => s.exercise))).join(', ')}
                          </p>
                          {w.notes && <p>{w.notes}</p>}
                        </div>
                        <div className="row-volume">
                          <strong>
                            {fmt(vol(w))} <small>kg</small>
                          </strong>
                          <span>{w.sets.length} 세트</span>
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            setEditor({
                              ...w,
                              date: cleanDate(w.date),
                              sets: w.sets.map((s) => ({ ...s, weight: Number(s.weight) })),
                            })
                          }
                        >
                          수정
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${w.title} 삭제`}
                          onClick={() => {
                            if (confirm('이 운동 일지와 세트를 삭제할까요?'))
                              void action(() => api('/workouts/' + w.id, 'DELETE'));
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          {page === 'goals' && (
            <div className="goal-grid">
              {goals.length === 0 ? (
                <section className="card empty">
                  <Target size={32} />
                  <h3>다음 운동의 목표를 세워보세요</h3>
                  <p>예: 레그 프레스 총중량 100kg, 10회 달성</p>
                </section>
              ) : (
                goals.map((g) => (
                  <section className="card goal-card" key={g.id}>
                    <span className={'badge ' + (g.achieved ? 'success' : '')}>
                      {g.achieved
                        ? '달성 완료'
                        : cleanDate(g.deadline) < today()
                          ? '기간 종료'
                          : '도전 중'}
                    </span>
                    <h2>{g.exercise}</h2>
                    <div className="goal-number">
                      {g.target_weight}
                      <small> kg × </small>
                      {g.target_reps}
                      <small> 회</small>
                    </div>
                    <p>
                      {cleanDate(g.start_date)} — {cleanDate(g.deadline)}
                    </p>
                    <p>
                      {g.achieved
                        ? '목표 기간에 중량과 반복 수를 모두 달성했어요.'
                        : '같은 운동명으로 기록하면 달성 여부를 확인해요.'}
                    </p>
                    <button
                      className="text-button"
                      disabled={saving}
                      onClick={() => {
                        if (confirm('이 목표를 삭제할까요?'))
                          void action(() => api('/goals/' + g.id, 'DELETE'));
                      }}
                    >
                      목표 삭제
                    </button>
                  </section>
                ))
              )}
            </div>
          )}
          {page === 'machines' && (
            <>
              <div className="brand-tabs">
                <button className={!brand ? 'selected' : ''} onClick={() => setBrand(0)}>
                  전체 브랜드
                </button>
                {brands.map((b) => (
                  <button
                    key={b.id}
                    className={brand === b.id ? 'selected' : ''}
                    onClick={() => setBrand(b.id)}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
              <section className="card">
                <div className="section-title">
                  <div>
                    <h2>머신 라이브러리</h2>
                    <p>
                      기본중량은 기종·설정에 따라 다릅니다. 머신 표기와 제조사 자료를 확인해
                      입력하세요.
                    </p>
                  </div>
                </div>
                {machines.filter((m) => !brand || m.brand_id === brand).length === 0 ? (
                  <div className="empty">
                    <Dumbbell size={32} />
                    <h3>나만의 머신을 등록하세요</h3>
                    <p>확인되지 않은 기본중량은 미입력으로 보관할 수 있어요.</p>
                  </div>
                ) : (
                  machines
                    .filter((m) => !brand || m.brand_id === brand)
                    .map((m) => (
                      <div className="workout-row" key={m.id}>
                        <div className="machine-icon">
                          <Dumbbell size={22} />
                        </div>
                        <div className="workout-info">
                          <h3>{m.name}</h3>
                          <p>
                            {m.brand} · {m.notes || '메모 없음'}
                          </p>
                        </div>
                        <strong>{m.base_weight === null ? '미입력' : `${m.base_weight} kg`}</strong>
                        <button
                          className="text-button"
                          onClick={() =>
                            setMachineEditor({
                              ...m,
                              base_weight: m.base_weight === null ? null : Number(m.base_weight),
                            })
                          }
                        >
                          수정
                        </button>
                      </div>
                    ))
                )}
              </section>
            </>
          )}
          <footer>
            <span className="footer-logo">form.</span> 오늘의 기록이 내일의 변화를 만듭니다.
            <span>ONE REP AT A TIME</span>
          </footer>
        </div>
      </main>
      {editor && (
        <Modal
          title={editor.id ? '운동 일지 수정' : '새로운 운동 기록'}
          close={() => setEditor(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () =>
                  api(
                    '/workouts' + (editor.id ? '/' + editor.id : ''),
                    editor.id ? 'PUT' : 'POST',
                    editor,
                  ),
                () => setEditor(null),
              );
            }}
          >
            <div className="form-grid">
              <label>
                운동 날짜
                <input
                  type="date"
                  required
                  value={editor.date}
                  onChange={(e) => setEditor({ ...editor, date: e.target.value })}
                />
              </label>
              <label>
                일지 제목
                <input
                  required
                  maxLength={120}
                  placeholder="예: 하체 · 대퇴사두 집중"
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                />
              </label>
            </div>
            <p className="form-hint">
              세트별로 기록하세요. 중량에는 머신 기본중량을 포함한 총중량(kg)을 입력합니다.
            </p>
            {editor.sets?.map((s, i) => (
              <div className="set-editor" key={i}>
                <div className="set-number">{i + 1}</div>
                <label>
                  운동명
                  <input
                    required
                    list="exercise-names"
                    value={s.exercise}
                    onChange={(e) => {
                      const sets = [...editor.sets!];
                      sets[i] = { ...s, exercise: e.target.value };
                      setEditor({ ...editor, sets });
                    }}
                  />
                </label>
                <label>
                  머신
                  <select
                    value={s.machine_id ?? ''}
                    onChange={(e) => {
                      const m = machines.find((m) => m.id === Number(e.target.value));
                      const sets = [...editor.sets!];
                      sets[i] = {
                        ...s,
                        machine_id: m?.id ?? null,
                        exercise: s.exercise || m?.name || '',
                      };
                      setEditor({ ...editor, sets });
                    }}
                  >
                    <option value="">자유 운동</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (기본 {m.base_weight ?? '?'}kg)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  총중량 kg
                  <input
                    type="number"
                    required
                    min="0"
                    max="99999"
                    step="0.25"
                    value={s.weight}
                    onChange={(e) => {
                      const sets = [...editor.sets!];
                      sets[i] = { ...s, weight: Number(e.target.value) };
                      setEditor({ ...editor, sets });
                    }}
                  />
                </label>
                <label>
                  횟수
                  <input
                    type="number"
                    required
                    min="1"
                    max="1000"
                    value={s.reps}
                    onChange={(e) => {
                      const sets = [...editor.sets!];
                      sets[i] = { ...s, reps: Number(e.target.value) };
                      setEditor({ ...editor, sets });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  disabled={editor.sets!.length === 1}
                  aria-label="세트 삭제"
                  onClick={() =>
                    setEditor({ ...editor, sets: editor.sets!.filter((_, j) => j !== i) })
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <datalist id="exercise-names">
              {Array.from(
                new Set([...goals.map((g) => g.exercise), ...machines.map((m) => m.name)]),
              ).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </datalist>
            <button
              type="button"
              className="subtle-button"
              onClick={() =>
                setEditor({ ...editor, sets: [...editor.sets!, { ...editor.sets!.at(-1)! }] })
              }
            >
              <Plus size={16} />
              세트 추가
            </button>
            <label>
              운동 메모
              <textarea
                maxLength={4000}
                value={editor.notes}
                placeholder="컨디션, 자세, 다음 운동에서 기억할 것…"
                onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
              />
            </label>
            <button className="primary full" disabled={saving}>
              {saving ? '저장 중…' : '기록 저장하기'}
            </button>
          </form>
        </Modal>
      )}
      {goalEditor && (
        <Modal title="점진적 과부하 목표" close={() => setGoalEditor(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(
                () =>
                  api('/goals', 'POST', {
                    exercise: f.get('exercise'),
                    target_weight: Number(f.get('weight')),
                    target_reps: Number(f.get('reps')),
                    start_date: f.get('start'),
                    deadline: f.get('deadline'),
                  }),
                () => setGoalEditor(false),
              );
            }}
          >
            <label>
              운동명
              <input
                name="exercise"
                required
                maxLength={120}
                placeholder="일지와 같은 운동명을 입력하세요"
              />
            </label>
            <div className="form-grid">
              <label>
                목표 총중량 (kg)
                <input name="weight" type="number" min="0" max="99999" step="0.25" required />
              </label>
              <label>
                목표 반복 수
                <input name="reps" type="number" min="1" max="1000" defaultValue="10" required />
              </label>
              <label>
                시작일
                <input name="start" type="date" defaultValue={today()} required />
              </label>
              <label>
                종료일
                <input name="deadline" type="date" defaultValue={to} required />
              </label>
            </div>
            <p className="form-hint">
              기간 안에 한 세트에서 목표 중량 이상, 목표 반복 수 이상을 수행하면 달성 처리됩니다.
            </p>
            <button className="primary full" disabled={saving}>
              목표 저장하기
            </button>
          </form>
        </Modal>
      )}
      {machineEditor && (
        <Modal
          title={machineEditor.id ? '머신 정보 수정' : '머신 등록'}
          close={() => setMachineEditor(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () =>
                  api(
                    '/machines' + (machineEditor.id ? '/' + machineEditor.id : ''),
                    machineEditor.id ? 'PUT' : 'POST',
                    machineEditor,
                  ),
                () => setMachineEditor(null),
              );
            }}
          >
            <label>
              브랜드
              <select
                required
                value={machineEditor.brand_id ?? ''}
                onChange={(e) =>
                  setMachineEditor({ ...machineEditor, brand_id: Number(e.target.value) })
                }
              >
                <option value="" disabled>
                  브랜드 선택
                </option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              머신 이름
              <input
                required
                maxLength={120}
                value={machineEditor.name}
                onChange={(e) => setMachineEditor({ ...machineEditor, name: e.target.value })}
              />
            </label>
            <label>
              기본중량 (kg) · 모르면 비워두세요
              <input
                type="number"
                min="0"
                max="99999"
                step="0.25"
                value={machineEditor.base_weight ?? ''}
                onChange={(e) =>
                  setMachineEditor({
                    ...machineEditor,
                    base_weight: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              확인 자료 / 설정 메모
              <textarea
                maxLength={2000}
                value={machineEditor.notes}
                onChange={(e) => setMachineEditor({ ...machineEditor, notes: e.target.value })}
              />
            </label>
            <button className="primary full" disabled={saving}>
              머신 저장하기
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  icon,
  foot,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  foot: string;
}) {
  return (
    <section className="stat">
      <div className="stat-top">
        {label}
        <span>{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="stat-foot">{foot}</div>
    </section>
  );
}
function Chart({ workouts, from, to }: { workouts: Workout[]; from: string; to: string }) {
  const start = calendarDate(from),
    end = calendarDate(to);
  const count = Math.round((+end - +start) / 86400000) + 1;
  const buckets = count > 31 ? 12 : count > 7 ? Math.ceil(count / 7) : count;
  const values = Array.from({ length: buckets }, (_, i) => {
    const a = new Date(start);
    a.setUTCDate(a.getUTCDate() + Math.floor((i * count) / buckets));
    const b = new Date(start);
    b.setUTCDate(b.getUTCDate() + Math.floor(((i + 1) * count) / buckets));
    return {
      label:
        count > 7
          ? `${a.getUTCMonth() + 1}/${a.getUTCDate()}`
          : ['일', '월', '화', '수', '목', '금', '토'][a.getUTCDay()],
      value: workouts
        .filter((w) => cleanDate(w.date) >= iso(a) && cleanDate(w.date) < iso(b))
        .reduce((n, w) => n + vol(w), 0),
    };
  });
  const max = Math.max(100, ...values.map((v) => v.value));
  return (
    <div
      className="chart"
      role="img"
      aria-label={`기간별 운동 볼륨: ${values.map((v) => v.label + ' ' + fmt(v.value) + 'kg').join(', ')}`}
    >
      <div className="chart-y">
        {[1, 0.75, 0.5, 0.25, 0].map((v) => (
          <span key={v}>{fmt(max * v)}</span>
        ))}
      </div>
      <div className="plot">
        <div className="grid-lines">
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} />
          ))}
        </div>
        <div className="bars">
          {values.map((v, i) => (
            <div className="bar-column" key={i}>
              <div
                className={'bar ' + (i === values.length - 1 ? 'last' : '')}
                style={{ height: Math.max(v.value ? 3 : 0, (v.value / max) * 145) }}
                title={`${v.label}: ${fmt(v.value)}kg`}
              />
              <span>{v.label}</span>
            </div>
          ))}
        </div>
        {!workouts.length && <div className="chart-empty">첫 기록부터 그래프가 채워져요</div>}
      </div>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">
          <h2>{title}</h2>
          <button autoFocus className="icon-button" aria-label="닫기" onClick={close}>
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
