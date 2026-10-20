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
  DatabaseBackup,
  Scale,
  Trophy,
} from 'lucide-react';
import './style.css';
import { seoulDate } from './date';
import { Routines } from './routines';
import { Backup } from './backup';
import { BodyMeasurements } from './body';
import { Analysis } from './analysis';
import { RoutineProgress, routineDraft, setReference, type Progress } from './progress';
import {
  cancelTimer,
  finished,
  formatRemaining,
  maxRest,
  minRest,
  parseTimer,
  pauseTimer,
  remainingMs,
  restTimerKey,
  resumeTimer,
  startTimer,
  validDuration,
  withDuration,
  type RestTimer,
} from './rest-timer';
type SetRow = {
  exercise: string;
  machine_id: number | null;
  weight: number;
  reps: number;
  notes: string;
  // Missing on rows saved before completion tracking; those count as completed.
  completed?: boolean;
  rpe?: number | null;
};
// Only completed sets are actual performance for statistics and goals.
const done = (s: SetRow) => s.completed !== false;
const repeatTapWindow = 700;
function readTimer(): RestTimer {
  try {
    return parseTimer(localStorage.getItem(restTimerKey), Date.now());
  } catch {
    return parseTimer(null, Date.now());
  }
}
type Workout = {
  id: number;
  version?: number;
  date: string;
  title: string;
  notes: string;
  sets: SetRow[];
};
type Draft = {
  format: 1;
  savedAt: number;
  editor: Partial<Workout>;
  request?: { key: string; body: string; path: string; method: string };
};
const draftKey = 'workout-memo:draft:v1';
const draftLifetime = 7 * 86400000;
function retryKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works on a phone accessing a local HTTP server.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function readDraft(): { draft: Draft | null; warning: string } {
  try {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return { draft: null, warning: '' };
    const d = JSON.parse(raw) as Draft;
    if (
      d.format !== 1 ||
      !Number.isFinite(d.savedAt) ||
      d.savedAt > Date.now() ||
      !d.editor ||
      typeof d.editor.date !== 'string' ||
      typeof d.editor.title !== 'string' ||
      typeof d.editor.notes !== 'string' ||
      (d.editor.id !== undefined && (!Number.isInteger(d.editor.id) || d.editor.id <= 0)) ||
      (d.editor.version !== undefined &&
        (!Number.isInteger(d.editor.version) || d.editor.version <= 0)) ||
      !Array.isArray(d.editor.sets) ||
      !d.editor.sets.length ||
      d.editor.sets.length > 200 ||
      !d.editor.sets.every(
        (s) =>
          s &&
          typeof s.exercise === 'string' &&
          (s.notes === undefined || typeof s.notes === 'string') &&
          (s.machine_id === null || (Number.isInteger(s.machine_id) && s.machine_id > 0)) &&
          Number.isFinite(s.weight) &&
          Number.isFinite(s.reps) &&
          (s.completed === undefined || typeof s.completed === 'boolean') &&
          (s.rpe === undefined || s.rpe === null || Number.isFinite(s.rpe)),
      ) ||
      (d.request &&
        (typeof d.request.key !== 'string' ||
          typeof d.request.body !== 'string' ||
          typeof d.request.path !== 'string' ||
          !['POST', 'PUT'].includes(d.request.method)))
    ) {
      throw Error('invalid draft');
    }
    if (Date.now() - d.savedAt >= draftLifetime) {
      localStorage.removeItem(draftKey);
      return {
        draft: null,
        warning:
          '7일이 지난 로컬 초안을 정리했습니다. 저장 결과가 불확실했다면 서버 기록을 확인하세요.',
      };
    }
    return { draft: d, warning: '' };
  } catch {
    return {
      draft: null,
      warning:
        '로컬 저장 공간을 읽지 못했거나 초안이 손상되었습니다. 새 입력은 계속할 수 있습니다.',
    };
  }
}
type Machine = {
  id: number;
  brand_id: number;
  brand: string;
  name: string;
  base_weight: number | null;
  notes: string;
  official_weight_id?: number | null;
  official_status?: OfficialWeight['status'] | null;
  official_model_name?: string | null;
  official_setting?: string | null;
  official_raw_value?: number | string | null;
  official_raw_unit?: string | null;
  official_weight_kg?: number | string | null;
  official_basis?: OfficialWeight['basis'];
  official_source_url?: string | null;
  official_checked_date?: string | null;
};
// Manufacturer starting resistance (no plates). Reference only: never added to a set total.
type OfficialWeight = {
  id: number;
  brand: string;
  lineup: string;
  model_number: string;
  model_name: string;
  official_item_name: string;
  setting: string;
  status: 'verified' | 'unverified' | 'conflict';
  raw_value: number | string | null;
  raw_unit: string | null;
  official_kg_text: string | null;
  weight_kg: number | string | null;
  basis: 'per_arm' | 'combined' | 'unspecified' | null;
  source_url: string | null;
  checked_date: string;
  notes: string;
};
const basisLabel = { per_arm: '편측', combined: '합계', unspecified: '기준 미표기' } as const;
function officialLabel(r: {
  status?: OfficialWeight['status'] | null;
  raw_value?: number | string | null;
  raw_unit?: string | null;
  weight_kg?: number | string | null;
  basis?: OfficialWeight['basis'];
}) {
  if (r.status !== 'verified' && r.status !== 'conflict') return '공식값 미확인';
  if (r.raw_value === null || r.raw_value === undefined || r.weight_kg == null)
    return '공식값 미확인';
  const raw = r.raw_unit === 'kg' ? '' : `${fmt(Number(r.raw_value))} ${r.raw_unit} = `;
  return (
    `${raw}${fmt(Number(r.weight_kg))} kg · ${r.basis ? basisLabel[r.basis] : '기준 미표기'}` +
    (r.status === 'conflict' ? ' · 공식 자료 간 불일치' : '')
  );
}
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
const today = () => seoulDate();
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
const vol = (w: Workout) => w.sets.filter(done).reduce((n, s) => n + Number(s.weight) * s.reps, 0);
const fmt = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n);
async function api<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api' + path, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error ?? '요청에 실패했습니다');
    return data;
  } finally {
    clearTimeout(timer);
  }
}
function App() {
  const [page, setPage] = useState('overview'),
    [period, setPeriod] = useState('week'),
    [anchor, setAnchor] = useState(today()),
    [workouts, setWorkouts] = useState<Workout[]>([]),
    [goals, setGoals] = useState<Goal[]>([]),
    [machines, setMachines] = useState<Machine[]>([]),
    [brands, setBrands] = useState<{ id: number; name: string }[]>([]),
    [officialWeights, setOfficialWeights] = useState<OfficialWeight[] | null>([]),
    [brand, setBrand] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [editor, updateEditor] = useState<Partial<Workout> | null>(null),
    [goalEditor, setGoalEditor] = useState(false),
    [machineEditor, setMachineEditor] = useState<Partial<Machine> | null>(null);
  const [initialDraft] = useState(readDraft);
  const [recovery, setRecovery] = useState(initialDraft.draft);
  const [storageWarning, setStorageWarning] = useState(initialDraft.warning);
  const [saveState, setSaveState] = useState('');
  const [saveError, setSaveError] = useState('');
  const draft = useRef<Draft | null>(initialDraft.draft);
  const workoutSaving = useRef(false);
  const [timer, setTimerState] = useState(readTimer);
  const [durationInput, setDurationInput] = useState(String(timer.duration));
  const [timerWarning, setTimerWarning] = useState('');
  const [tick, setTick] = useState(0);
  const timerNow = Date.now();
  const timerLeft = remainingMs(timer, timerNow);
  const timerEnded = finished(timer, timerNow);
  function updateTimer(next: RestTimer) {
    setTimerState(next);
    try {
      localStorage.setItem(restTimerKey, JSON.stringify(next));
      setTimerWarning('');
    } catch {
      setTimerWarning(
        '타이머 상태를 이 브라우저에 보관하지 못했습니다. 새로고침하면 초기화됩니다.',
      );
    }
  }
  // Ticks only redraw; the shown value is always computed from the stored end time.
  useEffect(() => {
    if (timer.state !== 'running') return;
    const left = remainingMs(timer, Date.now());
    if (!left) return;
    const id = setTimeout(() => setTick(Date.now()), left % 1000 || 1000);
    return () => clearTimeout(id);
  }, [timer, tick]);
  useEffect(() => {
    // Background tabs may skip ticks; redraw as soon as the tab is visible again.
    const wake = () => setTick(Date.now());
    window.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      window.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressError, setProgressError] = useState('');
  const [restConfirm, setRestConfirm] = useState(false);
  const [restBusy, setRestBusy] = useState(false);
  const restPending = useRef(false);
  const loadProgress = useCallback(async () => {
    try {
      setProgress(await api<Progress>('/routine-progress'));
      setProgressError('');
    } catch (e) {
      setProgressError((e as Error).message);
    }
  }, []);
  // Reload on every page change: a routine created in 루틴짜기 must show up when the
  // user comes back to the journal without a full page refresh.
  useEffect(() => {
    void loadProgress();
  }, [loadProgress, page]);
  // Rest changes only the plan. A pending request blocks repeated clicks and the
  // server applies the same day's rest at most once.
  async function changeRest(method: 'POST' | 'DELETE') {
    const routine = progress?.routine;
    if (!progress || !routine || restPending.current) return;
    restPending.current = true;
    setRestBusy(true);
    try {
      const path =
        `/routines/${routine.id}/rests` + (method === 'DELETE' ? '/' + progress.today : '');
      setProgress(
        await api<Progress>(path, method, method === 'POST' ? { date: progress.today } : undefined),
      );
      setRestConfirm(false);
      setProgressError('');
    } catch (e) {
      setProgressError((e as Error).message);
    } finally {
      restPending.current = false;
      setRestBusy(false);
    }
  }
  function persist(value: Draft | null) {
    draft.current = value;
    try {
      if (value) localStorage.setItem(draftKey, JSON.stringify(value));
      else localStorage.removeItem(draftKey);
      setStorageWarning('');
    } catch {
      setStorageWarning(
        '로컬 저장 공간 오류: 초안 보관 또는 정리에 실패했습니다. 새로고침하면 입력을 잃거나 이전 초안이 다시 보일 수 있습니다.',
      );
    }
  }
  function setEditor(value: Partial<Workout> | null) {
    if (workoutSaving.current) return;
    updateEditor(value);
    if (value) {
      persist({ format: 1, savedAt: Date.now(), editor: value, request: draft.current?.request });
      setRecovery(null);
      setSaveState('로컬 초안 · 서버 저장 전');
    } else setRecovery(draft.current);
  }
  // Taps on one set within this window after completing it are treated as a double tap.
  const completedAt = useRef(new Map<number, number>());
  function markSet(i: number, completed: boolean) {
    // The synchronously stored draft is newer than this render: a repeated tap from the
    // same render must not toggle back or restart the rest timer.
    const latest = draft.current?.editor ?? editor;
    const current = latest?.sets?.[i];
    if (!latest || !current || done(current) === completed) return;
    if (!completed && Date.now() - (completedAt.current.get(i) ?? -Infinity) < repeatTapWindow)
      return;
    if (completed) completedAt.current.set(i, Date.now());
    const sets = [...latest.sets!];
    sets[i] = { ...current, completed };
    setEditor({ ...latest, sets });
    if (completed && timer.autoStart && !workoutSaving.current)
      updateTimer(startTimer(timer, Date.now()));
  }
  async function saveWorkout() {
    if (!editor || workoutSaving.current) return;
    workoutSaving.current = true;
    setSaving(true);
    setSaveState('저장 중…');
    setSaveError('');
    const path = '/workouts' + (editor.id ? '/' + editor.id : '');
    const method = editor.id ? 'PUT' : 'POST';
    try {
      const body = JSON.stringify(editor);
      const old = draft.current?.request;
      const request =
        old?.body === body && old.path === path && old.method === method
          ? old
          : { key: retryKey(), body, path, method };
      persist({ format: 1, savedAt: draft.current?.savedAt ?? Date.now(), editor, request });
      await api(path, method, editor, request.key);
      persist(null);
      setRecovery(null);
      updateEditor(null);
      setSaveState('서버 저장 완료');
      void loadProgress();
      await latestRefresh.current();
    } catch (e) {
      setSaveState('저장 실패 · 서버 저장 여부 미확인');
      setSaveError(
        (e as Error).message +
          ' 입력은 화면에 유지됩니다. 재시도하거나 서버 기록을 확인하세요. 내용을 바꾸어 저장하면 별도 요청으로 처리됩니다.',
      );
    } finally {
      workoutSaving.current = false;
      setSaving(false);
    }
  }
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
      const [w, g, m, b, o] = await Promise.all([
        api<Workout[]>(`/workouts?from=${from}&to=${to}`),
        api<Goal[]>('/goals'),
        api<Machine[]>('/machines'),
        api<{ id: number; name: string }[]>('/brands'),
        // Reference data is optional: its failure must not block journal data.
        api<OfficialWeight[]>('/official-machine-weights').catch(() => null),
      ]);
      // Only the newest refresh may update data, errors, or loading state.
      if (version !== refreshVersion.current) return;
      setWorkouts(w);
      setGoals(g);
      setMachines(m);
      setBrands(b);
      setOfficialWeights(o);
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
  const newWorkout = () => {
    if (recovery) return;
    setEditor({
      date: anchor,
      title: '',
      notes: '',
      // #28: a new journal starts with three sets.
      sets: Array.from({ length: 3 }, () => ({
        exercise: '',
        machine_id: null,
        weight: 0,
        reps: 10,
        notes: '',
        completed: false,
        rpe: null,
      })),
    });
  };
  const quickWorkout = () => {
    const value = routineDraft(progress);
    if (recovery || !value) return;
    setEditor(value);
  };
  const total = workouts.reduce((n, w) => n + vol(w), 0),
    totalSets = workouts.reduce((n, w) => n + w.sets.filter(done).length, 0),
    days = new Set(workouts.filter((w) => w.sets.some(done)).map((w) => cleanDate(w.date))).size;
  const nav = [
    ['overview', '대시보드', LayoutDashboard],
    ['journal', '운동 일지', NotebookPen],
    ['goals', '나의 목표', Target],
    ['analysis', '종목 분석', Trophy],
    ['routines', '루틴짜기', NotebookPen],
    ['body', '신체 기록', Scale],
    ['machines', '머신 라이브러리', Dumbbell],
    ['backup', '백업·내보내기', DatabaseBackup],
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
  // #17 period selection, shared by the dashboard, journal and body measurements.
  const periodControls = (
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
    </>
  );
  const timerPanel = (
    <section className="rest-timer" aria-label="휴식 타이머">
      <strong role="timer" aria-live="polite" className={timerEnded ? 'ended' : ''}>
        {timerEnded
          ? '휴식 종료'
          : timer.state === 'running'
            ? `${formatRemaining(timerLeft)} 남음`
            : timer.state === 'paused'
              ? `${formatRemaining(timerLeft)} 일시정지`
              : `휴식 ${formatRemaining(timerLeft)}`}
      </strong>
      <div className="rest-actions">
        {(timer.state === 'idle' || timerEnded) && (
          <button
            type="button"
            className="subtle-button"
            onClick={() => updateTimer(startTimer(timer, Date.now()))}
          >
            휴식 시작
          </button>
        )}
        {timer.state === 'running' && !timerEnded && (
          <button
            type="button"
            className="subtle-button"
            onClick={() => updateTimer(pauseTimer(timer, Date.now()))}
          >
            일시정지
          </button>
        )}
        {timer.state === 'paused' && (
          <button
            type="button"
            className="subtle-button"
            onClick={() => updateTimer(resumeTimer(timer, Date.now()))}
          >
            재개
          </button>
        )}
        {timer.state !== 'idle' && (
          <button
            type="button"
            className="text-button"
            onClick={() => updateTimer(cancelTimer(timer))}
          >
            휴식 취소
          </button>
        )}
      </div>
      <label>
        휴식 시간(초)
        <input
          type="number"
          aria-label="휴식 시간(초)"
          min={minRest}
          max={maxRest}
          step="1"
          inputMode="numeric"
          value={durationInput}
          onChange={(e) => {
            setDurationInput(e.target.value);
            const seconds = Number(e.target.value);
            if (validDuration(seconds)) updateTimer(withDuration(timer, seconds));
          }}
        />
      </label>
      <label className="rest-auto">
        <input
          type="checkbox"
          checked={timer.autoStart}
          onChange={(e) => updateTimer({ ...timer, autoStart: e.target.checked })}
        />
        세트 완료 시 자동 시작
      </label>
      <p className="form-hint">
        종료 시각 기준으로 이 브라우저에만 보관합니다. 탭을 다시 열면 남은 시간이 맞춰지며,
        브라우저를 닫은 동안에는 알림이 없습니다.
      </p>
      {timerWarning && (
        <p role="alert" className="error">
          {timerWarning}
        </p>
      )}
    </section>
  );
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
          {page === 'routines' && <Routines />}
          {page === 'backup' && <Backup onRestored={() => void latestRefresh.current()} />}
          {page === 'body' && (
            <BodyMeasurements from={from} to={to} workouts={workouts} controls={periodControls} />
          )}
          {page === 'analysis' && <Analysis />}
          {page !== 'routines' && page !== 'body' && page !== 'analysis' && page !== 'backup' && (
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
                disabled={!!recovery && (page === 'overview' || page === 'journal')}
                onClick={
                  page === 'goals'
                    ? () => setGoalEditor(true)
                    : page === 'machines'
                      ? () =>
                          setMachineEditor({
                            brand_id: brand || brands[0]?.id,
                            name: '',
                            base_weight: null,
                            notes: '',
                            official_weight_id: null,
                          })
                      : newWorkout
                }
              >
                <Plus size={18} />
                {page === 'goals'
                  ? '목표 추가'
                  : page === 'machines'
                    ? '머신 등록'
                    : '운동 기록하기'}
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error} <button onClick={() => void refresh()}>다시 연결</button>
            </div>
          )}
          {storageWarning && !editor && (
            <p role="alert" className="error">
              {storageWarning}
            </p>
          )}
          {saveState && !editor && <p role="status">{saveState}</p>}
          {recovery && !editor && (
            <section className="card">
              <p>
                이 브라우저에 로컬 초안이 있습니다. 서버 기록과 별도로 보관됩니다. 복구 또는 폐기 후
                다른 기록을 입력하세요.
              </p>
              <button
                className="subtle-button"
                onClick={() => {
                  updateEditor(recovery.editor);
                  setRecovery(null);
                  setSaveState('로컬 초안 · 서버 저장 전');
                }}
              >
                초안 복구
              </button>
              <button
                className="text-button"
                onClick={() => {
                  persist(null);
                  setRecovery(null);
                  setSaveState('초안 폐기');
                }}
              >
                초안 폐기
              </button>
            </section>
          )}
          {!editor && timer.state !== 'idle' && timerPanel}
          {(page === 'overview' || page === 'journal') && (
            <>
              {periodControls}
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
              {page === 'journal' && (
                <RoutineProgress
                  progress={progress}
                  error={progressError}
                  busy={restBusy}
                  confirming={restConfirm}
                  draftDisabled={!!recovery || saving}
                  onQuick={quickWorkout}
                  onRestStart={() => setRestConfirm(true)}
                  onRestBack={() => setRestConfirm(false)}
                  onRestConfirm={() => void changeRest('POST')}
                  onRestCancel={() => void changeRest('DELETE')}
                  onReload={() => void loadProgress()}
                />
              )}
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
                          <details>
                            <summary>세트 기록 보기</summary>
                            <ol>
                              {w.sets.map((s, i) => (
                                <li key={i}>
                                  {s.exercise} · {fmt(Number(s.weight))}kg × {s.reps}회 ·{' '}
                                  {machines.find((m) => m.id === s.machine_id)?.name ?? '머신 없음'}
                                  {s.rpe != null && ` · RPE ${fmt(Number(s.rpe))}`}
                                  {!done(s) && ' · 미완료(통계 제외)'}
                                  {s.notes && <p>{s.notes}</p>}
                                </li>
                              ))}
                            </ol>
                          </details>
                        </div>
                        <div className="row-volume">
                          <strong>
                            {fmt(vol(w))} <small>kg</small>
                          </strong>
                          <span>{w.sets.filter(done).length} 세트</span>
                          {w.sets.some((s) => !done(s)) && (
                            <span>미완료 {w.sets.filter((s) => !done(s)).length}</span>
                          )}
                        </div>
                        <button
                          className="text-button"
                          disabled={!!recovery || saving}
                          onClick={() =>
                            !recovery &&
                            setEditor({
                              ...w,
                              version: w.version ?? 1,
                              date: cleanDate(w.date),
                              sets: w.sets.map((s) => ({
                                ...s,
                                weight: Number(s.weight),
                                completed: done(s),
                                rpe: s.rpe == null ? null : Number(s.rpe),
                              })),
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
                          {m.official_status && (
                            <p className="official-ref">
                              공식 참고값({m.official_model_name}
                              {m.official_setting ? ` · ${m.official_setting}` : ''}):{' '}
                              {officialLabel({
                                status: m.official_status,
                                raw_value: m.official_raw_value,
                                raw_unit: m.official_raw_unit,
                                weight_kg: m.official_weight_kg,
                                basis: m.official_basis,
                              })}
                              {m.official_source_url && (
                                <>
                                  {' · '}
                                  <a href={m.official_source_url} target="_blank" rel="noreferrer">
                                    출처
                                  </a>
                                  {` (${m.official_checked_date} 확인)`}
                                </>
                              )}
                            </p>
                          )}
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
              void saveWorkout();
            }}
          >
            {saveState && <p role="status">{saveState}</p>}
            {storageWarning && (
              <p role="alert" className="error">
                {storageWarning}
              </p>
            )}
            <p className="form-hint">
              초안은 이 기기·브라우저의 localStorage에 마지막 입력부터 7일 보관합니다. 다른 기기와
              동기화되지 않으며 브라우저 데이터 삭제·비공개 모드에서는 사라질 수 있습니다. 서버 저장
              기록만 통계와 목표에 반영합니다.
            </p>
            {saveError && (
              <div role="alert" className="error">
                {saveError}
                <button type="button" disabled={saving} onClick={() => void saveWorkout()}>
                  다시 저장 재시도
                </button>
              </div>
            )}
            {timerPanel}
            <fieldset disabled={saving} className="workout-fields">
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
                세트별로 기록하세요. 중량에는 머신 기본중량을 포함한 총중량(kg)을 입력합니다. 좌우를
                함께 움직이는 장비는 양쪽 중량의 합계를, 편측 운동은 한쪽에서 실제로 움직인 총중량을
                기록하세요. 기본중량을 모르면 임의로 더하지 말고 세트 메모에 남겨주세요. 머신을
                선택해도 기본중량을 자동으로 더하지 않습니다.
              </p>
              <p className="form-hint">
                수행한 세트는 완료로 표시하세요. 완료한 세트만 통계와 목표 달성에 반영하며 미완료
                세트는 계획으로 함께 보관합니다. RPE는 1~10의 0.5 단위이며 비워두면 미입력으로
                남습니다. 완료 {editor.sets?.filter(done).length ?? 0} / {editor.sets?.length ?? 0}
                세트
              </p>
              {editor.sets?.map((s, i) => (
                <div className={'set-editor' + (done(s) ? ' completed' : '')} key={i}>
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
                          {m.brand} · {m.name} (기본중량{' '}
                          {m.base_weight === null ? '미확인' : `${m.base_weight} kg`})
                          {m.official_status
                            ? ` · 공식 참고값 ${officialLabel({
                                status: m.official_status,
                                raw_value: m.official_raw_value,
                                raw_unit: m.official_raw_unit,
                                weight_kg: m.official_weight_kg,
                                basis: m.official_basis,
                              })}`
                            : ''}
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
                  <div className="set-actions">
                    <button
                      type="button"
                      className={done(s) ? 'set-done active' : 'set-done'}
                      aria-pressed={done(s)}
                      aria-label={`${i + 1}세트 완료`}
                      onClick={() => markSet(i, !done(s))}
                    >
                      {done(s) ? '완료됨 · 취소하려면 다시 누르기' : '완료'}
                    </button>
                    <label>
                      RPE (선택)
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        inputMode="decimal"
                        placeholder="미입력"
                        value={s.rpe ?? ''}
                        onChange={(e) => {
                          const sets = [...editor.sets!];
                          sets[i] = {
                            ...s,
                            rpe: e.target.value === '' ? null : Number(e.target.value),
                          };
                          setEditor({ ...editor, sets });
                        }}
                      />
                    </label>
                  </div>
                  <label className="set-notes">
                    세트 메모
                    <textarea
                      maxLength={4000}
                      value={s.notes}
                      placeholder="자세, 머신 설정, 편측 기록 등"
                      onChange={(e) => {
                        const sets = [...editor.sets!];
                        sets[i] = { ...s, notes: e.target.value };
                        setEditor({ ...editor, sets });
                      }}
                    />
                  </label>
                  {setReference(progress, s.exercise) && (
                    <p className="set-reference">{setReference(progress, s.exercise)}</p>
                  )}
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
                  new Set([
                    ...(progress?.today_plan?.target?.exercises.map((e) => e.exercise) ?? []),
                    ...goals.map((g) => g.exercise),
                    ...machines.map((m) => m.name),
                  ]),
                ).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </datalist>
              <button
                type="button"
                className="subtle-button"
                onClick={() =>
                  setEditor({
                    ...editor,
                    // The next set is planned until it is marked completed.
                    sets: [
                      ...editor.sets!,
                      { ...editor.sets!.at(-1)!, completed: false, rpe: null },
                    ],
                  })
                }
              >
                <Plus size={16} />
                세트 추가
              </button>
              <button
                type="button"
                className="subtle-button"
                disabled={editor.sets!.length >= 200}
                onClick={() =>
                  setEditor({
                    ...editor,
                    sets: [
                      ...editor.sets!,
                      {
                        exercise: '',
                        machine_id: null,
                        weight: 0,
                        reps: 10,
                        notes: '',
                        completed: false,
                        rpe: null,
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                다른 운동 추가
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
            </fieldset>
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
                onChange={(e) => {
                  const brandId = Number(e.target.value);
                  const name = brands.find((b) => b.id === brandId)?.name;
                  const linked = officialWeights?.find(
                    (r) => r.id === machineEditor.official_weight_id,
                  );
                  // A reference from another brand cannot stay linked after a brand change.
                  setMachineEditor({
                    ...machineEditor,
                    brand_id: brandId,
                    official_weight_id:
                      linked && linked.brand === name ? machineEditor.official_weight_id : null,
                  });
                }}
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
            {(() => {
              const brandName = brands.find((b) => b.id === machineEditor.brand_id)?.name;
              const refs = (officialWeights ?? []).filter((r) => r.brand === brandName);
              const selected = refs.find((r) => r.id === machineEditor.official_weight_id);
              if (officialWeights === null)
                return <p className="form-hint">공식 참고값을 불러오지 못했습니다.</p>;
              if (!refs.length)
                return <p className="form-hint">이 브랜드의 공식 참고값 자료가 없습니다.</p>;
              return (
                <>
                  <label>
                    공식 참고값 (선택)
                    <select
                      value={selected?.id ?? ''}
                      onChange={(e) =>
                        setMachineEditor({
                          ...machineEditor,
                          official_weight_id: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">연결 안 함</option>
                      {refs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.lineup} · {r.model_name}
                          {r.setting ? ` (${r.setting})` : ''} — {officialLabel(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected && (
                    <div className="official-ref" role="note" aria-label="공식 참고값">
                      <strong>공식 참고값: {officialLabel(selected)}</strong>
                      <p>
                        {selected.brand} {selected.lineup}
                        {selected.model_number ? ` ${selected.model_number}` : ''} ·{' '}
                        {selected.official_item_name}
                        {selected.official_kg_text
                          ? ` · 제조사 kg 표기 ${selected.official_kg_text}`
                          : ''}
                      </p>
                      {selected.notes && <p>{selected.notes}</p>}
                      <p>
                        {selected.source_url ? (
                          <a href={selected.source_url} target="_blank" rel="noreferrer">
                            제조사 공식 출처
                          </a>
                        ) : (
                          '공식 출처 없음'
                        )}{' '}
                        · {selected.checked_date} 확인
                      </p>
                      <p>
                        공식 참고값은 플레이트 없는 시작 저항이며 아래 기본중량에 자동 반영되지
                        않습니다. 편측 값은 양쪽 합계가 아닙니다.
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
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
            <p className="form-hint">
              확인하지 못한 기본중량은 비워두세요. 확인된 0 kg과 구분하여 저장하며, 기본중량을
              수정해도 과거 세트의 총중량은 변경되지 않습니다.
            </p>
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
