import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  DatabaseBackup,
  Dumbbell,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Scale,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { BrowserRouter, useLocation, useNavigate, useSearchParams } from 'react-router';

import { Analysis } from './analysis';
import { Backup } from './backup';
import { BodyMeasurements } from './body';
import { listCardioSessions } from './cardio/api';
import { CardioSummaryCard, CardioTab } from './cardio/cardio-tab';
import { CardioGoals } from './cardio-goals';
import { AlertBanner } from './components/alert-banner';
import { Combobox } from './components/combobox';
import { DateStepper, RangeSummary } from './components/date-stepper';
import { FieldError } from './components/field';
import { invalidProps } from './components/field-props';
import {
  fieldLabel,
  formHint,
  selectField,
  textareaField,
  touchText,
} from './components/form-styles';
import { AppShell, type NavItem } from './components/layout/app-shell';
import { List, ListItem } from './components/list';
import { Modal, ModalFooter } from './components/modal';
import { NumberValueInput } from './components/number-input';
import { PageHeader } from './components/page-header';
import { SegmentedControl } from './components/segmented-control';
import { StatCard } from './components/stat-card';
import { Switch } from './components/switch';
import { ToggleChips } from './components/toggle-chips';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { EmptyState } from './components/ui/empty-state';
import { Input as CommonInput } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonList } from './components/ui/skeleton';
import { Toaster } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import {
  defaultWeightStep,
  type Feedback,
  feedbackLevels,
  fieldErrors,
  type GoalInput,
  goalSchema,
  machineSchema,
  weightStepSchema,
  workoutSchema,
} from './contract';
import { dateTitle, monthNames, seoulDate } from './date';
import { checkRange, maxRangeDays, parseRange, rangeBuckets } from './date-range';
import { candidateNames, type ExerciseName } from './exercise-name-match';
import { SimilarNameHint } from './exercise-names';
import { plural } from './labels';
import type { NoticeValue } from './lib/use-notice';
import { cn } from './lib/utils';
import { RoutineProgress } from './progress';
import { type Progress, routineDraft, setReference } from './progress-data';
import {
  cancelTimer,
  endAlertDue,
  endVibration,
  finished,
  formatRemaining,
  maxRest,
  minRest,
  parseRestDurations,
  parseTimer,
  pauseTimer,
  remainingMs,
  type RestDurations,
  restDurationsKey,
  type RestKind,
  restKind,
  restKinds,
  type RestTimer,
  restTimerKey,
  resumeTimer,
  startTimer,
  validDuration,
  withDuration,
} from './rest-timer';
import { Routines } from './routines';
const restKindLabels: Record<RestKind, string> = {
  lower: 'Lower body',
  upper: 'Upper body',
  single: 'Single-joint',
};
function readRestDurations(): RestDurations {
  try {
    return parseRestDurations(localStorage.getItem(restDurationsKey));
  } catch {
    return parseRestDurations(null);
  }
}
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
  // #83: how the whole workout felt; null or missing means not recorded.
  feedback?: Feedback | null;
  sets: SetRow[];
};
const feedbackLabels: Record<Feedback, string> = { hard: 'Hard', medium: 'Medium', easy: 'Easy' };
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
      (d.editor.feedback != null && !feedbackLevels.includes(d.editor.feedback)) ||
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
          'Cleaned up local drafts older than 7 days. If the save result was uncertain, check the server record.',
      };
    }
    return { draft: d, warning: '' };
  } catch {
    return {
      draft: null,
      warning:
        'Could not read local storage or the draft is damaged. You can keep entering new input.',
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
  // #84: single-joint machines use the single-joint rest.
  single_joint?: boolean;
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
const basisLabel = {
  per_arm: 'One side',
  combined: 'Combined',
  unspecified: 'No reference shown',
} as const;
function officialLabel(r: {
  status?: OfficialWeight['status'] | null;
  raw_value?: number | string | null;
  raw_unit?: string | null;
  weight_kg?: number | string | null;
  basis?: OfficialWeight['basis'];
}) {
  if (r.status !== 'verified' && r.status !== 'conflict') return 'Official value unconfirmed';
  if (r.raw_value === null || r.raw_value === undefined || r.weight_kg == null)
    return 'Official value unconfirmed';
  const raw = r.raw_unit === 'kg' ? '' : `${fmt(Number(r.raw_value))} ${r.raw_unit} = `;
  return (
    `${raw}${fmt(Number(r.weight_kg))} kg · ${r.basis ? basisLabel[r.basis] : 'Basis not stated'}` +
    (r.status === 'conflict' ? ' · Official sources disagree' : '')
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
  calendarDate(cleanDate(v)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
const vol = (w: Workout) => w.sets.filter(done).reduce((n, s) => n + Number(s.weight) * s.reps, 0);
const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
// #105: weight − / + moves by 5 kg (user decision); typing still allows 0.25 kg.
const weightStep = 5;
// #223: the save progress line ("Saving…", "Saved to server") as a polite Notice.
const statusNotice = (text: string): NoticeValue | undefined =>
  text ? { kind: 'status', text } : undefined;
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
    if (!res.ok) throw Error(data.error ?? 'The request failed');
    return data;
  } finally {
    clearTimeout(timer);
  }
}
// #62: every page has its own URL, so refresh, links and back navigation keep it.
const pages = {
  overview: '/',
  journal: '/journal',
  goals: '/goals',
  analysis: '/analysis',
  routines: '/routines',
  body: '/body',
  machines: '/machines',
  backup: '/backup',
} as const;
type Page = keyof typeof pages;
// #115: the journal's record kinds; Strength is the default and has no address parameter.
type JournalTab = 'strength' | 'cardio';
const journalTabs = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
] as const satisfies readonly { value: JournalTab; label: string }[];
const periodOptions = [
  { value: 'day', label: '1 day' },
  { value: 'week', label: '1 week' },
  { value: 'month', label: '1 month' },
  { value: '4weeks', label: '4 weeks' },
  { value: '12weeks', label: '12 weeks' },
  { value: 'custom', label: 'Custom' },
];

const pageOf = (path: string) =>
  (Object.keys(pages) as Page[]).find((key) => pages[key] === path.replace(/(.)\/$/, '$1'));

export function App() {
  // One client per mounted app keeps browser tabs and tests independent. Retries and
  // focus refetches stay off: failures are shown with an explicit reconnect button.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Workspace />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const page: Page = pageOf(location.pathname) ?? 'overview';
  const setPage = (next: Page) => void navigate(pages[next]);
  useEffect(() => {
    // An unknown address falls back to the dashboard instead of an empty screen.
    if (!pageOf(location.pathname)) void navigate(pages.overview, { replace: true });
  }, [location.pathname, navigate]);
  const queryClient = useQueryClient();
  // #85: a directly chosen range lives in the address (?from&to) so reloads and shared
  // links keep it. Presets stay in component state as before.
  const [searchParams, setSearchParams] = useSearchParams();
  const customRange = parseRange(searchParams.get('from'), searchParams.get('to'));
  const badRangeAddress = !customRange && (searchParams.has('from') || searchParams.has('to'));
  // #115: the journal's Strength/Cardio tab lives in the address too (?tab=cardio), next to the
  // range, so reloads and back/forward keep it. Each one changes only its own parameters.
  const journalTab: JournalTab = searchParams.get('tab') === 'cardio' ? 'cardio' : 'strength';
  const cardioTab = page === 'journal' && journalTab === 'cardio';
  const setJournalTab = (next: JournalTab) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === 'cardio') params.set('tab', 'cardio');
      else params.delete('tab');
      return params;
    });
  const setRangeAddress = (range: { from: string; to: string } | null) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('from');
      params.delete('to');
      if (range) {
        params.set('from', range.from);
        params.set('to', range.to);
      }
      return params;
    });
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState({ from: '', to: '' });
  const [customErrors, setCustomErrors] = useState<{ from?: string; to?: string }>({});
  // #123: until a preset is chosen, body measurements default to 12 weeks because they
  // are recorded about weekly; the dashboard and journal default to one week.
  const [chosenPeriod, setPeriod] = useState<string | null>(null);
  const period = chosenPeriod ?? (page === 'body' ? '12weeks' : 'week');
  const [anchor, setAnchor] = useState(today()),
    [brand, setBrand] = useState(0),
    [actionError, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [editor, updateEditor] = useState<Partial<Workout> | null>(null),
    [goalEditor, setGoalEditor] = useState(false),
    [machineEditor, setMachineEditor] = useState<Partial<Machine> | null>(null);
  const [initialDraft] = useState(readDraft);
  const [recovery, setRecovery] = useState(initialDraft.draft);
  const [storageWarning, setStorageWarning] = useState(initialDraft.warning);
  const [saveState, setSaveState] = useState('');
  const [saveError, setSaveError] = useState('');
  // Per-field messages from the shared contract, keyed like "sets.0.weight" (#64).
  const [issues, setIssues] = useState<Record<string, string>>({});
  const invalid = (key: string) => invalidProps(key, issues[key]);
  const issue = (key: string) => <FieldError name={key}>{issues[key]}</FieldError>;
  const draft = useRef<Draft | null>(initialDraft.draft);
  const workoutSaving = useRef(false);
  const [timer, setTimerState] = useState(readTimer);
  const [durationInput, setDurationInput] = useState(String(timer.duration));
  const [timerWarning, setTimerWarning] = useState('');
  const [restDurations, setRestDurations] = useState(readRestDurations);
  const [restInputs, setRestInputs] = useState(() =>
    Object.fromEntries(restKinds.map((k) => [k, String(restDurations[k])])),
  );
  function updateRestDuration(kind: RestKind, value: string) {
    setRestInputs({ ...restInputs, [kind]: value });
    const seconds = Number(value);
    if (!validDuration(seconds)) return;
    const next = { ...restDurations, [kind]: seconds };
    setRestDurations(next);
    try {
      localStorage.setItem(restDurationsKey, JSON.stringify(next));
      setTimerWarning('');
    } catch {
      setTimerWarning(
        'Could not save the rest time setting in this browser. It returns to the default when you reload.',
      );
    }
  }
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
      setTimerWarning('Could not save the timer state in this browser. It resets when you reload.');
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
  // #105: one short vibration when a rest ends while the app is open. Each end (endsAt)
  // alerts once; browsers without the Vibration API (iPhone Safari) only show Rest over.
  const alertedEnd = useRef<number | null>(null);
  useEffect(() => {
    if (!endAlertDue(timer, Date.now()) || alertedEnd.current === timer.endsAt) return;
    alertedEnd.current = timer.endsAt;
    if ('vibrate' in navigator) navigator.vibrate(endVibration);
  }, [timer, tick]);
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
  // Reload on every page change: a routine created in Routine Builder must show up when the
  // user comes back to the journal without a full page refresh.
  useEffect(() => {
    void loadProgress();
    // Body parts mapped on Exercise Analysis must apply to the rest timer when the user returns.
    void queryClient.invalidateQueries({ queryKey: ['exercise-body-parts'] });
  }, [loadProgress, page, queryClient]);
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
        'Local storage error: saving or clearing the draft failed. If you reload, you may lose your input or see an older draft again.',
      );
    }
  }
  function setEditor(value: Partial<Workout> | null) {
    if (workoutSaving.current) return;
    updateEditor(value);
    if (value) {
      persist({ format: 1, savedAt: Date.now(), editor: value, request: draft.current?.request });
      setRecovery(null);
      setSaveState('Local draft · Before server save');
    } else setRecovery(draft.current);
  }
  // #124: typing, picking a suggestion or accepting a similar name all rename one set.
  function renameSet(i: number, exercise: string) {
    if (!editor?.sets) return;
    setEditor({ ...editor, sets: editor.sets.map((s, j) => (j === i ? { ...s, exercise } : s)) });
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
      updateTimer(startTimer(timer, Date.now(), restSeconds(current)));
  }
  async function saveWorkout() {
    if (!editor || workoutSaving.current) return;
    // #64: the server's schema checks the input first; nothing is sent while it is invalid.
    const checked = workoutSchema.safeParse(editor);
    setIssues(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) {
      setSaveState('Check your input · Not sent to the server');
      return;
    }
    workoutSaving.current = true;
    setSaving(true);
    setSaveState('Saving…');
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
      setSaveState('Saved to server');
      void loadProgress();
      await refreshAll();
    } catch (e) {
      setSaveState('Save failed · Unknown whether the server saved it');
      setSaveError(
        (e as Error).message +
          ' Your input stays on screen. Retry or check the server record. Saving after changing the content is handled as a separate request.',
      );
    } finally {
      workoutSaving.current = false;
      setSaving(false);
    }
  }
  const range = () => {
    if (customRange) return customRange;
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
  // #62: the period is part of the query key, so a late response for an earlier
  // period can never replace the selected one's data, error or loading state.
  const workoutsQuery = useQuery({
    queryKey: ['workouts', from, to],
    queryFn: () => api<Workout[]>(`/workouts?from=${from}&to=${to}`),
  });
  const goalsQuery = useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('/goals') });
  // #115: the dashboard's cardio summary. Only the dashboard asks (the journal tab loads its
  // own list), and a failure only hides the card.
  const cardioQuery = useQuery({
    queryKey: ['cardio-sessions', from, to],
    queryFn: () => listCardioSessions(from, to).catch(() => []),
    enabled: page === 'overview',
  });
  const machinesQuery = useQuery({
    queryKey: ['machines'],
    queryFn: () => api<Machine[]>('/machines'),
  });
  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: () => api<{ id: number; name: string }[]>('/brands'),
  });
  const officialQuery = useQuery({
    queryKey: ['official-machine-weights'],
    // Reference data is optional: its failure must not block journal data.
    queryFn: () => api<OfficialWeight[]>('/official-machine-weights').catch(() => null),
  });
  // #84: the user's exercise → body part mapping (#32) picks the rest of a completed set.
  // It is optional: a failed load only falls back to the configured rest.
  const bodyPartsQuery = useQuery({
    queryKey: ['exercise-body-parts'],
    queryFn: () =>
      api<{ exercise: string; body_parts: string[] }[]>('/exercise-body-parts').catch(() => []),
  });
  // #124: exercise name candidates for the journal and goal fields. Optional: a failed load
  // keeps the names this screen already has.
  const exerciseNamesQuery = useQuery({
    queryKey: ['exercise-names'],
    queryFn: () => api<ExerciseName[]>('/exercise-names').catch(() => []),
  });
  const restSeconds = (s: SetRow) => {
    const machine = machines.find((m) => m.id === s.machine_id);
    const key = s.exercise.trim().toLowerCase();
    const parts = bodyPartsQuery.data?.find((m) => m.exercise === key)?.body_parts ?? [];
    const kind = restKind(machine?.single_joint === true, parts);
    return kind ? restDurations[kind] : timer.duration;
  };
  // The summary belongs to the dashboard only; the journal shows its own tab.
  const cardioSessions = (page === 'overview' && cardioQuery.data) || [];
  const workouts = workoutsQuery.data ?? [],
    goals = goalsQuery.data ?? [],
    machines = machinesQuery.data ?? [],
    brands = brandsQuery.data ?? [],
    officialWeights = officialQuery.data === undefined ? [] : officialQuery.data;
  const exerciseNames = candidateNames(exerciseNamesQuery.data ?? [], [
    ...(progress?.today_plan?.target?.exercises.map((e) => e.exercise) ?? []),
    ...goals.map((g) => g.exercise),
    ...machines.map((m) => m.name),
  ]);
  const journalQueries = [workoutsQuery, goalsQuery, machinesQuery, brandsQuery];
  const loading = [...journalQueries, officialQuery].some((q) => q.isFetching);
  const loadError = journalQueries.find((q) => q.error)?.error?.message ?? '';
  // A later successful load clears an earlier failed action, as a full refresh did.
  const loadedAt = workoutsQuery.dataUpdatedAt;
  useEffect(() => setError(''), [loadedAt]);
  const error = actionError || loadError;
  // Saving refetches only active queries: the selected period and the shared lists.
  const refreshAll = () => queryClient.invalidateQueries();
  const reconnect = () => {
    setError('');
    void Promise.all(journalQueries.map((q) => q.refetch()));
  };
  async function action(fn: () => Promise<unknown>, done?: () => void) {
    setSaving(true);
    try {
      await fn();
      done?.();
      // A mutation may finish after the user has selected a different period.
      await refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const machineIds = () => new Set(machines.map((m) => m.id));
  // #82: a new journal is dated today (Asia/Seoul) even when another day is browsed,
  // and starts with today's routine sets when a routine plans a workout today.
  const newWorkout = () => {
    if (recovery) return;
    const date = today();
    setEditor({
      date,
      title: dateTitle(date),
      notes: '',
      feedback: null,
      // #28: otherwise a new journal starts with three sets.
      sets:
        routineDraft(progress, machineIds())?.sets ??
        Array.from({ length: 3 }, () => ({
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
    const value = routineDraft(progress, machineIds());
    if (recovery || !value) return;
    setEditor(value);
  };
  const total = workouts.reduce((n, w) => n + vol(w), 0),
    totalSets = workouts.reduce((n, w) => n + w.sets.filter(done).length, 0),
    days = new Set(workouts.filter((w) => w.sets.some(done)).map((w) => cleanDate(w.date))).size;
  const nav = [
    ['overview', 'Dashboard', LayoutDashboard],
    ['journal', 'Workout journal', NotebookPen],
    ['goals', 'My Goals', Target],
    ['analysis', 'Exercise Analysis', Trophy],
    ['routines', 'Routine Builder', NotebookPen],
    ['body', 'Body records', Scale],
    ['machines', 'Machine Library', Dumbbell],
    ['backup', 'Backup & Export', DatabaseBackup],
  ] as const;
  // #85: pages sharing the period keep a directly chosen range in the address. The journal's
  // tab (#115) belongs to the journal only.
  const rangeSearch = (() => {
    const params = new URLSearchParams(location.search);
    params.delete('tab');
    const text = params.toString();
    return text ? '?' + text : '';
  })();
  const navItems: NavItem[] = nav.map(([key, label, icon]) => ({
    to:
      pages[key] +
      (key === 'journal' ? location.search : ['overview', 'body'].includes(key) ? rangeSearch : ''),
    label,
    icon,
    end: true,
  }));
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
      {/* #71: on narrow phones the date control wraps under the period tabs. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          label="Period"
          options={periodOptions}
          value={customRange || customOpen ? 'custom' : period}
          onValueChange={(key) => {
            if (key === 'custom') {
              setCustomOpen(true);
              setCustomDraft({ from, to });
              return;
            }
            setPeriod(key);
            setCustomOpen(false);
            setCustomErrors({});
            if (customRange || badRangeAddress) setRangeAddress(null);
          }}
          // The current preset also clears an invalid range left in the address.
          onReselect={() => {
            if (badRangeAddress) setRangeAddress(null);
          }}
        />
        {!customRange && !customOpen && (
          <DateStepper
            label="Reference date"
            value={anchor}
            onValueChange={setAnchor}
            onMove={move}
          />
        )}
      </div>
      {(customOpen || customRange) && (
        <form
          className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2"
          aria-label="Custom range"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            // Invalid ranges are explained per field and never requested.
            const errors = checkRange(customDraft.from, customDraft.to);
            setCustomErrors(errors);
            if (Object.keys(errors).length) return;
            setRangeAddress({ from: customDraft.from, to: customDraft.to });
            setCustomOpen(false);
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-from" className="text-meta leading-none">
              Start date
            </Label>
            <CommonInput
              id="range-from"
              type="date"
              className="w-36 md:pointer-coarse:text-base"
              value={customOpen ? customDraft.from : from}
              onChange={(e) => {
                setCustomOpen(true);
                setCustomDraft({
                  ...(customOpen ? customDraft : { from, to }),
                  from: e.target.value,
                });
              }}
              {...invalidProps('range-from', customErrors.from)}
            />
            <FieldError name="range-from">{customErrors.from}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-to" className="text-meta leading-none">
              End date
            </Label>
            <CommonInput
              id="range-to"
              type="date"
              className="w-36 md:pointer-coarse:text-base"
              value={customOpen ? customDraft.to : to}
              onChange={(e) => {
                setCustomOpen(true);
                setCustomDraft({
                  ...(customOpen ? customDraft : { from, to }),
                  to: e.target.value,
                });
              }}
              {...invalidProps('range-to', customErrors.to)}
            />
            <FieldError name="range-to">{customErrors.to}</FieldError>
          </div>
          {/* The label row is 12px (leading-none) plus a 4px gap, so the button lines up with the inputs. */}
          <Button type="submit" variant="secondary" className="mt-4">
            Apply
          </Button>
          <p className="m-0 basis-full text-meta">
            Both end dates included · up to {maxRangeDays} days
          </p>
        </form>
      )}
      {badRangeAddress && (
        <AlertBanner className="mt-3 mb-0">
          The period in the address is not valid, so the default period is shown. Choose a period
          again.
        </AlertBanner>
      )}
      <RangeSummary from={from} to={to}>
        Records for the selected period
      </RangeSummary>
    </>
  );
  // #105: the countdown and its buttons are one bar that stays pinned while the page or the
  // workout editor scrolls; the settings below it scroll away. Sticky works only inside its
  // parent, so the bar is not nested in the settings card.
  const timerBar = (
    <section
      data-slot="rest-timer"
      aria-label="Rest timer"
      className="grid items-center gap-x-4 gap-y-2 rounded-lg border border-input bg-muted p-3.5 min-[480px]:grid-cols-[1fr_auto]"
    >
      <strong
        role="timer"
        aria-live="polite"
        className={cn('text-2xl tabular-nums', timerEnded && 'text-muted-foreground')}
      >
        {timerEnded
          ? 'Rest over'
          : timer.state === 'running'
            ? `${formatRemaining(timerLeft)} left`
            : timer.state === 'paused'
              ? `${formatRemaining(timerLeft)} paused`
              : `Rest ${formatRemaining(timerLeft)}`}
      </strong>
      <div className="flex flex-wrap gap-2 min-[480px]:justify-end">
        {(timer.state === 'idle' || timerEnded) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => updateTimer(startTimer(timer, Date.now()))}
          >
            Start rest
          </Button>
        )}
        {timer.state === 'running' && !timerEnded && (
          <Button
            type="button"
            variant="outline"
            onClick={() => updateTimer(pauseTimer(timer, Date.now()))}
          >
            Pause
          </Button>
        )}
        {timer.state === 'paused' && (
          <Button
            type="button"
            variant="outline"
            onClick={() => updateTimer(resumeTimer(timer, Date.now()))}
          >
            Resume
          </Button>
        )}
        {timer.state !== 'idle' && (
          <Button type="button" variant="ghost" onClick={() => updateTimer(cancelTimer(timer))}>
            Cancel rest
          </Button>
        )}
      </div>
    </section>
  );
  const timerSettings = (
    <section
      data-slot="rest-settings"
      aria-label="Rest settings"
      className="mb-4 grid items-center gap-x-4 gap-y-2 rounded-lg border border-input bg-muted p-3.5 md:grid-cols-[1fr_auto]"
    >
      <label
        htmlFor="rest-duration"
        className="mb-0 flex flex-col gap-1 text-meta text-muted-foreground"
      >
        Rest time (sec)
        <CommonInput
          id="rest-duration"
          type="number"
          aria-label="Rest time (sec)"
          className="max-w-30 md:pointer-coarse:text-base"
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
      <div className="flex items-center gap-2">
        <Switch
          id="rest-auto-start"
          checked={timer.autoStart}
          onCheckedChange={(autoStart) => updateTimer({ ...timer, autoStart })}
        />
        <Label htmlFor="rest-auto-start" className="mb-0 flex-row text-meta text-foreground">
          Auto-start when a set is done
        </Label>
      </div>
      <fieldset className="col-span-full m-0 flex flex-wrap gap-x-4 gap-y-2 border-0 p-0 text-meta text-muted-foreground">
        <legend>Default rest by exercise type (sec)</legend>
        {restKinds.map((kind) => (
          <label htmlFor={`rest-${kind}`} className="mb-0 flex flex-col gap-1 text-meta" key={kind}>
            {restKindLabels[kind]}
            <CommonInput
              id={`rest-${kind}`}
              type="number"
              aria-label={`${restKindLabels[kind]} rest (sec)`}
              className="max-w-30 md:pointer-coarse:text-base"
              min={minRest}
              max={maxRest}
              step="1"
              inputMode="numeric"
              value={restInputs[kind]}
              onChange={(e) => updateRestDuration(kind, e.target.value)}
            />
          </label>
        ))}
      </fieldset>
      <p className="col-span-full text-meta text-muted-foreground">
        Kept only in this browser, by end time; reopening the tab corrects the time left. No alert
        while the browser is closed. If rest ends while this screen is open (after one tap),
        supported devices such as Android vibrate; iPhone does not.
      </p>
      <p className="col-span-full text-meta text-muted-foreground">
        On set completion, rest uses the default for single-joint machines, then lower body, then
        upper body. Single-joint is set in the Machine Library; body parts come from Exercise
        Analysis, not from the exercise name. If unset, the rest time above applies.
      </p>
    </section>
  );
  const timerAlert = timerWarning && <AlertBanner className="mb-4">{timerWarning}</AlertBanner>;
  // Outside the editor a running or paused rest is pinned under the app header (h-14).
  const pageTimer = !editor && timer.state !== 'idle' && (
    <>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[var(--z-sticky)] mb-4 bg-background py-2">
        {timerBar}
      </div>
      {timerAlert}
    </>
  );
  const ownPage = ['routines', 'backup', 'body', 'analysis'].includes(page);
  return (
    <>
      <AppShell
        appName="FORM · My Workout Log"
        nav={navItems}
        footer="Today's record creates tomorrow's change."
      >
        <div className="legacy">
          {/* Pages with their own component draw everything below, so the bar goes first. */}
          {ownPage && pageTimer}
          {page === 'routines' && <Routines />}
          {page === 'backup' && <Backup onRestored={() => void refreshAll()} />}
          {page === 'body' && (
            <BodyMeasurements from={from} to={to} workouts={workouts} controls={periodControls} />
          )}
          {page === 'analysis' && <Analysis />}
          {!ownPage && (
            <PageHeader
              eyebrow="YOUR PROGRESS, IN FOCUS"
              title={
                page === 'overview'
                  ? 'A place to record consistency'
                  : page === 'journal'
                    ? 'One more step today'
                    : page === 'goals'
                      ? 'Toward the next you'
                      : 'Knowing your machine makes your records accurate'
              }
              description={
                page === 'overview'
                  ? 'See how your training flows and prepare for your next step.'
                  : page === 'journal'
                    ? 'Every set holds a better you than yesterday.'
                    : page === 'goals'
                      ? 'Set concrete growth goals with weight, reps, and cardio distance and time.'
                      : 'Save machines and base weights by brand to your own library.'
              }
              actions={
                // #115: on the Cardio tab the panel's own "Add cardio record" is the main action.
                !cardioTab && (
                  <Button
                    // A recoverable local draft must be restored or discarded first (#101).
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
                    <Plus aria-hidden />
                    {page === 'goals'
                      ? 'Add goal'
                      : page === 'machines'
                        ? 'Add machine'
                        : 'Log workout'}
                  </Button>
                )
              }
            />
          )}
          {error && (
            <AlertBanner
              action={
                <Button type="button" variant="outline" size="sm" onClick={reconnect}>
                  Reconnect
                </Button>
              }
            >
              {error}
            </AlertBanner>
          )}
          {storageWarning && !editor && <AlertBanner>{storageWarning}</AlertBanner>}
          {!editor && <Notice className="mb-5" notice={statusNotice(saveState)} />}
          {recovery && !editor && (
            <Card
              role="region"
              aria-label="Local draft"
              className="mb-6 gap-3 p-4 shadow-none md:flex-row md:items-center md:justify-between md:p-5"
            >
              <p className="text-sm text-muted-foreground">
                This browser has a local draft. It is kept separately from server records. Restore
                or discard it before entering another record.
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    updateEditor(recovery.editor);
                    setRecovery(null);
                    setSaveState('Local draft · Before server save');
                  }}
                >
                  Restore draft
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    persist(null);
                    setRecovery(null);
                    setSaveState('Discard draft');
                  }}
                >
                  Discard draft
                </Button>
              </div>
            </Card>
          )}
          {!ownPage && pageTimer}
          {page === 'journal' && (
            <SegmentedControl
              label="Record type"
              className="mb-4"
              options={journalTabs}
              value={journalTab}
              onValueChange={setJournalTab}
            />
          )}
          {cardioTab && (
            <>
              {periodControls}
              <CardioTab
                from={from}
                to={to}
                today={today()}
                workouts={workouts.map((w) => ({
                  id: w.id,
                  date: cleanDate(w.date),
                  title: w.title,
                }))}
                onChanged={() =>
                  void queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] })
                }
              />
            </>
          )}
          {(page === 'overview' || (page === 'journal' && !cardioTab)) && (
            <>
              {periodControls}
              <div
                className={`mb-6 grid grid-cols-2 gap-2.5 xl:gap-4 ${cardioSessions.length ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
              >
                <StatCard
                  label="Workout days"
                  value={String(days)}
                  unit={days === 1 ? ' day' : ' days'}
                  icon={<NotebookPen size={19} />}
                  foot="By recorded date"
                />
                <StatCard
                  label="Total volume"
                  value={fmt(total)}
                  unit="kg"
                  icon={<Dumbbell size={19} />}
                  foot="Total weight × reps"
                />
                <StatCard
                  label="Completed sets"
                  value={String(totalSets)}
                  unit={totalSets === 1 ? ' set' : ' sets'}
                  icon={<Activity size={19} />}
                  foot={plural(workouts.length, 'workout journal')}
                />
                <StatCard
                  label="Goal achieved"
                  value={String(goals.filter((g) => g.achieved).length)}
                  unit={`/ ${goals.length}`}
                  icon={<Target size={19} />}
                  foot="Based on records within the goal period"
                />
                {/* #115: the fifth card fills a row of its own on phones. */}
                {cardioSessions.length > 0 && (
                  <div className="max-lg:col-span-2 [&>*]:h-full">
                    <CardioSummaryCard sessions={cardioSessions} />
                  </div>
                )}
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
                <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_230px] xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
                  <Card className="gap-0 py-0 shadow-none">
                    <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
                      <CardTitle asHeading="h2" className="text-body font-semibold">
                        Training volume
                      </CardTitle>
                      <CardDescription className="text-caption">
                        Growth that gets clearer as your records build up
                      </CardDescription>
                      <CardAction className="flex items-center gap-1.5 text-meta whitespace-nowrap">
                        <i aria-hidden className="size-1.5 rounded-xs bg-primary" />
                        Volume (kg)
                      </CardAction>
                    </CardHeader>
                    <Chart workouts={workouts} from={from} to={to} custom={!!customRange} />
                  </Card>
                  <Card className="relative min-h-52 gap-0 overflow-hidden bg-muted p-5 shadow-none xl:p-6">
                    <div className="flex items-center justify-between text-meta tracking-widest">
                      THE NEXT CHAPTER <ArrowUpRight aria-hidden size={19} />
                    </div>
                    <h2 className="mt-4 mb-2 text-2xl leading-normal font-semibold tracking-tight md:text-xl xl:text-2xl">
                      A little heavier.
                      <br />
                      Do it once more.
                    </h2>
                    <p className="text-caption">
                      Small challenges add up
                      <br />
                      to build your own growth.
                    </p>
                    <Button
                      variant="link"
                      className="relative z-10 mt-2 self-start px-0 text-foreground has-[>svg]:px-0"
                      onClick={() => setPage('goals')}
                    >
                      See your goals <ArrowRight aria-hidden />
                    </Button>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -bottom-[75px] size-[200px]"
                    >
                      <span className="absolute inset-0 rounded-full border" />
                      <span className="absolute inset-5 rounded-full border" />
                      <span className="absolute inset-10 rounded-full border" />
                    </div>
                  </Card>
                </div>
              )}
              <Card className="gap-0 py-0 shadow-none">
                <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
                  <CardTitle
                    asHeading="h2"
                    className="flex items-center gap-2 text-body font-semibold"
                  >
                    Workout records{' '}
                    <Badge variant="secondary" className="text-xs">
                      {workouts.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-caption">
                    So today&apos;s effort becomes tomorrow&apos;s baseline
                  </CardDescription>
                  {page === 'overview' && (
                    <CardAction>
                      <Button variant="ghost" size="sm" onClick={() => setPage('journal')}>
                        All records <ArrowRight aria-hidden />
                      </Button>
                    </CardAction>
                  )}
                </CardHeader>
                {loading ? (
                  // #173: row placeholders while the list loads; the hidden line keeps the status.
                  <div aria-busy="true" aria-label="Workout record list" className="px-6 py-6">
                    <p role="status" className="sr-only">
                      Loading records…
                    </p>
                    <SkeletonList />
                  </div>
                ) : workouts.length === 0 ? (
                  <EmptyState
                    className="m-4 md:m-6"
                    headingLevel="h3"
                    icon={<NotebookPen />}
                    title="Log your first record"
                    description="Your growth story starts with today's sets."
                    action={
                      <Button variant="secondary" onClick={newWorkout}>
                        <Plus aria-hidden />
                        Log workout
                      </Button>
                    }
                  />
                ) : (
                  <List aria-label="Workout records" className="px-4 py-1 md:px-6 md:py-2.5">
                    {workouts.map((w) => (
                      <ListItem
                        data-slot="workout-row"
                        className="flex-wrap gap-2.5 py-4 md:flex-nowrap md:gap-4"
                        key={w.id}
                      >
                        <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-md bg-muted">
                          <strong className="text-lg leading-none font-medium">
                            {Number(cleanDate(w.date).slice(8))}
                          </strong>
                          <small className="mt-1 text-meta leading-none text-foreground">
                            {monthNames[Number(cleanDate(w.date).slice(5, 7)) - 1]}
                          </small>
                        </div>
                        <div className="min-w-0 flex-1 [overflow-wrap:anywhere] max-md:basis-[calc(100%-3.625rem)]">
                          <h3 className="text-body-sm font-semibold">{w.title}</h3>
                          <p className="mt-1 text-meta text-muted-foreground">
                            {dateLabel(w.date)} ·{' '}
                            {Array.from(new Set(w.sets.map((s) => s.exercise))).join(', ')}
                          </p>
                          {w.feedback && (
                            <p className="mt-1 text-meta text-muted-foreground">
                              Effort {feedbackLabels[w.feedback]}
                            </p>
                          )}
                          {w.notes && (
                            <p className="mt-1 text-meta text-muted-foreground">{w.notes}</p>
                          )}
                          <details className="mt-1 text-body-sm">
                            <summary>View set records</summary>
                            <ol>
                              {w.sets.map((s, i) => (
                                <li key={i}>
                                  {s.exercise} · {fmt(Number(s.weight))}kg × {plural(s.reps, 'rep')}{' '}
                                  ·{' '}
                                  {machines.find((m) => m.id === s.machine_id)?.name ??
                                    'No machine'}
                                  {s.rpe != null && ` · RPE ${fmt(Number(s.rpe))}`}
                                  {!done(s) && ' · Incomplete (excluded from stats)'}
                                  {s.notes && <p>{s.notes}</p>}
                                </li>
                              ))}
                            </ol>
                          </details>
                        </div>
                        <div className="text-right text-meta text-muted-foreground max-md:mr-auto max-md:ml-14.5 max-md:text-left">
                          <strong className="text-body-sm font-medium text-foreground">
                            {fmt(vol(w))}{' '}
                            <small className="text-meta text-muted-foreground">kg</small>
                          </strong>
                          <span className="mt-1 block">
                            {plural(w.sets.filter(done).length, 'set')}
                          </span>
                          {w.sets.some((s) => !done(s)) && (
                            <span className="mt-1 block">
                              Incomplete {w.sets.filter((s) => !done(s)).length}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
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
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground"
                          aria-label={`Delete ${w.title}`}
                          onClick={() => {
                            if (confirm('Delete this workout journal and its sets?'))
                              void action(() => api('/workouts/' + w.id, 'DELETE'));
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Card>
            </>
          )}
          {page === 'goals' &&
            (goals.length === 0 ? (
              <EmptyState
                icon={<Target />}
                title="Set a goal for your next workout"
                description="e.g. Leg Press total weight 100 kg, 10 reps achieved"
              />
            ) : (
              <div data-slot="goal-grid" className="grid gap-5 md:grid-cols-2">
                {goals.map((g) => {
                  const ended = !g.achieved && cleanDate(g.deadline) < today();
                  return (
                    <Card
                      key={g.id}
                      className="items-start gap-0 px-6 py-6 shadow-none md:px-7 md:py-7"
                    >
                      <Badge
                        variant={g.achieved ? 'success' : ended ? 'warning' : 'outline'}
                        className="mb-5"
                      >
                        {g.achieved ? 'Achieved' : ended ? 'Period ended' : 'In progress'}
                      </Badge>
                      <CardTitle asHeading="h2" className="text-body font-semibold">
                        {g.exercise}
                      </CardTitle>
                      <div className="mt-5 text-[32px] leading-tight">
                        {g.target_weight}
                        <small className="text-body-sm text-muted-foreground"> kg × </small>
                        {g.target_reps}
                        <small className="text-body-sm text-muted-foreground"> reps</small>
                      </div>
                      <p className="mt-3 text-body-sm text-muted-foreground">
                        {cleanDate(g.start_date)} — {cleanDate(g.deadline)}
                      </p>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {g.achieved
                          ? 'You hit both the weight and reps within the goal period.'
                          : 'Log it under the same exercise name to check whether you achieved it.'}
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-3 px-0"
                        aria-label={`Delete ${g.exercise} goal`}
                        disabled={saving}
                        onClick={() => {
                          if (confirm('Delete this goal?'))
                            void action(() => api('/goals/' + g.id, 'DELETE'));
                        }}
                      >
                        Delete goal
                      </Button>
                    </Card>
                  );
                })}
              </div>
            ))}
          {/* #116: cardio goals load and save on their own, below the strength goals. */}
          {page === 'goals' && <CardioGoals deadline={to} />}
          {page === 'machines' && (
            <>
              <SegmentedControl
                label="Brand"
                className="mb-6"
                options={[
                  { value: '0', label: 'All brands' },
                  ...brands.map((b) => ({ value: String(b.id), label: b.name })),
                ]}
                value={String(brand)}
                onValueChange={(value) => setBrand(Number(value))}
              />
              <Card className="gap-0 py-0 shadow-none">
                <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
                  <CardTitle asHeading="h2" className="text-body font-semibold">
                    Machine Library
                  </CardTitle>
                  <CardDescription className="text-caption">
                    The base weight differs by model and setting. Check the machine label and
                    manufacturer data, then enter it.
                  </CardDescription>
                </CardHeader>
                {machines.filter((m) => !brand || m.brand_id === brand).length === 0 ? (
                  <EmptyState
                    className="m-4 md:m-6"
                    headingLevel="h3"
                    icon={<Dumbbell />}
                    title="Register your own machine"
                    description="An unconfirmed base weight can be stored as not entered."
                  />
                ) : (
                  <List aria-label="Machine" className="px-4 py-1 md:px-6 md:py-2.5">
                    {machines
                      .filter((m) => !brand || m.brand_id === brand)
                      .map((m) => (
                        <ListItem
                          data-slot="machine-row"
                          className="flex-wrap gap-2.5 py-4 md:flex-nowrap md:gap-4"
                          key={m.id}
                        >
                          <div
                            aria-hidden
                            className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
                          >
                            <Dumbbell size={22} />
                          </div>
                          <div className="min-w-0 flex-1 [overflow-wrap:anywhere] max-md:basis-[calc(100%-3.625rem)]">
                            <h3 className="text-body-sm font-semibold">{m.name}</h3>
                            <p className="mt-1 text-meta text-muted-foreground">
                              {m.brand}
                              {m.single_joint ? ' · Single-joint' : ''} · {m.notes || 'No memo'}
                            </p>
                            {m.official_status && (
                              <p className="mt-1 text-meta text-muted-foreground">
                                Official reference ({m.official_model_name}
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
                                    <a
                                      className="text-foreground underline underline-offset-4"
                                      href={m.official_source_url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Source
                                    </a>
                                    {` (checked ${m.official_checked_date})`}
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                          <strong className="text-body-sm font-medium whitespace-nowrap max-md:ml-14.5">
                            {m.base_weight === null ? 'Not entered' : `${m.base_weight} kg`}
                          </strong>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="max-md:ml-auto"
                            onClick={() =>
                              setMachineEditor({
                                ...m,
                                base_weight: m.base_weight === null ? null : Number(m.base_weight),
                              })
                            }
                          >
                            Edit
                          </Button>
                        </ListItem>
                      ))}
                  </List>
                )}
              </Card>
            </>
          )}
        </div>
      </AppShell>
      {editor && (
        <Modal
          title={editor.id ? 'Edit workout journal' : 'New workout record'}
          layout="full"
          close={() => {
            setIssues({});
            setEditor(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveWorkout();
            }}
          >
            {/* #173: a spinner beside the status line while the save request is in flight. The
                wrapper stays mounted so the role="status" line is not replaced and still announces
                each change. */}
            <div className={cn('flex items-center gap-2', (saving || saveState) && 'mb-3')}>
              {saving && <Spinner size="sm" aria-hidden className="text-muted-foreground" />}
              <Notice notice={statusNotice(saveState)} />
            </div>
            {storageWarning && <AlertBanner className="mb-3">{storageWarning}</AlertBanner>}
            <p className="form-hint">
              Drafts stay in this browser&apos;s localStorage for 7 days after the last input. They
              do not sync to other devices and may vanish if you clear browser data or use private
              mode. Only records saved to the server count toward stats and goals.
            </p>
            {saveError && (
              <AlertBanner
                className="mb-3"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void saveWorkout()}
                  >
                    Retry save
                  </Button>
                }
              >
                {saveError}
              </AlertBanner>
            )}
            {/* Pinned to the top of the editor while the long form scrolls; it spans the
                modal's 24px side padding so fields scroll behind it. */}
            <div className="sticky top-0 z-10 -mx-6 mb-2 bg-background px-6 py-2">{timerBar}</div>
            {timerAlert}
            {timerSettings}
            <fieldset disabled={saving} className="workout-fields">
              <div className="form-grid">
                <label>
                  Workout date
                  <input
                    type="date"
                    required
                    value={editor.date}
                    onChange={(e) => setEditor({ ...editor, date: e.target.value })}
                    {...invalid('date')}
                  />
                </label>
                {issue('date')}
                <label>
                  Journal title
                  <input
                    required
                    maxLength={120}
                    placeholder="e.g. Legs · quad focus"
                    value={editor.title}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                    {...invalid('title')}
                  />
                </label>
                {issue('title')}
              </div>
              <div className="mb-4 flex flex-col items-start gap-2 text-caption text-muted-foreground">
                <span>Effort feedback (optional)</span>
                <ToggleChips
                  label="Effort feedback"
                  options={feedbackLevels.map((level) => feedbackLabels[level])}
                  value={editor.feedback ? [feedbackLabels[editor.feedback]] : []}
                  // At most one level: a new press replaces the old one, and pressing the
                  // selected level again clears it back to not recorded.
                  onValueChange={(next) =>
                    setEditor({
                      ...editor,
                      feedback:
                        feedbackLevels.find(
                          (level) =>
                            level !== editor.feedback && next.includes(feedbackLabels[level]),
                        ) ?? null,
                    })
                  }
                />
              </div>
              {issue('feedback')}
              {issue('sets')}
              <p className="form-hint">
                Record each set. For weight, enter the total weight (kg) including the
                machine&apos;s base weight. For equipment that moves both sides together, enter the
                sum of both sides; for one-sided exercises, enter the total weight actually moved on
                one side. If you do not know the base weight, do not guess; leave a note in the set
                memo. Selecting a machine does not add its base weight automatically.
              </p>
              <p className="form-hint">
                Mark sets you performed as done. Only completed sets count toward stats and goal
                achievement, and incomplete sets are kept as plans. Leave how the whole workout felt
                as effort feedback (hard, medium, easy); if you do not choose, it stays not entered.
                Completed {editor.sets?.filter(done).length ?? 0} / {editor.sets?.length ?? 0} sets
              </p>
              {editor.sets?.map((s, i) => (
                // #105: one card per set; weight and reps take − / + presses and a number
                // keypad, and the completion button spans the card for a one-handed tap.
                <div
                  data-slot="set-row"
                  className={cn(
                    'mb-3 grid gap-x-3 gap-y-2.5 rounded-lg border border-border bg-card p-3 md:grid-cols-2',
                    done(s) && 'border-primary/60',
                  )}
                  key={i}
                >
                  <div className="flex items-center justify-between gap-2 md:col-span-2">
                    <span
                      className={cn(
                        'text-meta text-muted-foreground',
                        done(s) && 'font-bold text-foreground',
                      )}
                    >
                      Set {i + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      disabled={editor.sets!.length === 1}
                      aria-label="Delete set"
                      onClick={() =>
                        setEditor({ ...editor, sets: editor.sets!.filter((_, j) => j !== i) })
                      }
                    >
                      <X size={15} />
                    </Button>
                  </div>
                  {/* The hint stays in the name's grid cell so Machine keeps its place beside it. */}
                  <div>
                    <label htmlFor={`set-${i}-exercise`} className="mb-0 text-meta">
                      Exercise name
                      {/* #124: suggestions from earlier journals, goals, routines and machines. */}
                      <Combobox
                        id={`set-${i}-exercise`}
                        className="md:pointer-coarse:text-base"
                        required
                        value={s.exercise}
                        options={exerciseNames}
                        listLabel="Previously used names"
                        onValueChange={(exercise) => renameSet(i, exercise)}
                        {...invalid(`sets.${i}.exercise`)}
                      />
                    </label>
                    <SimilarNameHint
                      value={s.exercise}
                      names={exerciseNames}
                      onReplace={(exercise) => renameSet(i, exercise)}
                    />
                  </div>
                  <label className="mb-0 text-meta">
                    Machine
                    <select
                      className="h-9 px-2 py-0 text-body-sm pointer-coarse:text-base"
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
                      <option value="">Free workout</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.brand} · {m.name} (base weight{' '}
                          {m.base_weight === null ? 'unconfirmed' : `${m.base_weight} kg`})
                          {m.official_status
                            ? ` · Official reference ${officialLabel({
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
                  {/* Stacked on phones: two − / + fields side by side leave no room for the digits. */}
                  <div className="grid gap-3 min-[480px]:grid-cols-2 md:col-span-2">
                    <div className="flex min-w-0 flex-col gap-2">
                      <label htmlFor={`set-${i}-weight`} className="mb-0 text-meta">
                        Total weight kg
                      </label>
                      <NumberValueInput
                        id={`set-${i}-weight`}
                        label="Total weight kg"
                        className="md:pointer-coarse:[&_input]:text-base"
                        step={weightStep}
                        // A whole-number step would pick the digits-only keypad; 0.25 kg still needs a point.
                        inputMode="decimal"
                        min={0}
                        max={99999}
                        required
                        value={s.weight}
                        onValueChange={(weight) => {
                          const sets = [...editor.sets!];
                          sets[i] = { ...s, weight };
                          setEditor({ ...editor, sets });
                        }}
                        {...invalid(`sets.${i}.weight`)}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <label htmlFor={`set-${i}-reps`} className="mb-0 text-meta">
                        Reps
                      </label>
                      <NumberValueInput
                        id={`set-${i}-reps`}
                        label="Reps"
                        className="md:pointer-coarse:[&_input]:text-base"
                        min={1}
                        max={1000}
                        required
                        value={s.reps}
                        onValueChange={(reps) => {
                          const sets = [...editor.sets!];
                          sets[i] = { ...s, reps };
                          setEditor({ ...editor, sets });
                        }}
                        {...invalid(`sets.${i}.reps`)}
                      />
                    </div>
                  </div>
                  {(['exercise', 'weight', 'reps', 'rpe'] as const).map((field) => (
                    <React.Fragment key={field}>{issue(`sets.${i}.${field}`)}</React.Fragment>
                  ))}
                  <label className="mb-0 text-meta md:col-span-2">
                    Set memo
                    <textarea
                      maxLength={4000}
                      value={s.notes}
                      placeholder="Form, machine settings, one-sided records, etc."
                      onChange={(e) => {
                        const sets = [...editor.sets!];
                        sets[i] = { ...s, notes: e.target.value };
                        setEditor({ ...editor, sets });
                      }}
                    />
                  </label>
                  {setReference(progress, s.exercise) && (
                    <p className="m-0 text-meta text-muted-foreground md:col-span-2">
                      {setReference(progress, s.exercise)}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="lg"
                    variant={done(s) ? 'default' : 'outline'}
                    className="h-auto min-h-12 w-full py-2 text-base whitespace-normal md:col-span-2"
                    aria-pressed={done(s)}
                    aria-label={`Set ${i + 1} done`}
                    onClick={() => markSet(i, !done(s))}
                  >
                    {done(s) ? 'Done · tap again to cancel' : 'Done'}
                  </Button>
                </div>
              ))}
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
                Add set
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
                Add another exercise
              </button>
              <label>
                Workout memo
                <textarea
                  maxLength={4000}
                  value={editor.notes}
                  placeholder="Condition, form, things to remember for the next workout…"
                  onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                />
              </label>
              <ModalFooter>
                <Button className="w-full" disabled={saving}>
                  {saving && <Spinner size="sm" aria-hidden />}
                  {saving ? 'Saving…' : 'Save record'}
                </Button>
              </ModalFooter>
            </fieldset>
          </form>
        </Modal>
      )}
      {goalEditor && (
        <Modal title="Progressive overload goals" close={() => setGoalEditor(false)}>
          <GoalForm
            deadline={to}
            saving={saving}
            names={exerciseNames}
            onSave={(goal) =>
              void action(
                () => api('/goals', 'POST', goal),
                () => setGoalEditor(false),
              )
            }
          />
        </Modal>
      )}
      {machineEditor && (
        <Modal
          title={machineEditor.id ? 'Edit machine details' : 'Add machine'}
          close={() => {
            setIssues({});
            setMachineEditor(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const checked = machineSchema.safeParse(machineEditor);
              setIssues(checked.success ? {} : fieldErrors(checked.error));
              if (!checked.success) return;
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
            <Label className={fieldLabel}>
              Brand
              <select
                required
                className={selectField}
                value={machineEditor.brand_id ?? ''}
                {...invalid('brand_id')}
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
                  Choose a brand
                </option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Label>
            {issue('brand_id')}
            {(() => {
              const brandName = brands.find((b) => b.id === machineEditor.brand_id)?.name;
              const refs = (officialWeights ?? []).filter((r) => r.brand === brandName);
              const selected = refs.find((r) => r.id === machineEditor.official_weight_id);
              if (officialWeights === null)
                return <p className={fieldHint}>Could not load the official reference.</p>;
              if (!refs.length)
                return <p className={fieldHint}>No official reference data for this brand.</p>;
              return (
                <>
                  <Label className={fieldLabel}>
                    Official reference (optional)
                    <select
                      className={selectField}
                      value={selected?.id ?? ''}
                      onChange={(e) =>
                        setMachineEditor({
                          ...machineEditor,
                          official_weight_id: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Not linked</option>
                      {refs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.lineup} · {r.model_name}
                          {r.setting ? ` (${r.setting})` : ''} — {officialLabel(r)}
                        </option>
                      ))}
                    </select>
                  </Label>
                  {selected && (
                    <div
                      role="note"
                      aria-label="Official reference"
                      className="mb-4 flex flex-col gap-1.5 rounded-md border bg-muted p-3 [overflow-wrap:anywhere]"
                    >
                      <strong className="text-body-sm font-medium">
                        Official reference: {officialLabel(selected)}
                      </strong>
                      <p className={noteText}>
                        {selected.brand} {selected.lineup}
                        {selected.model_number ? ` ${selected.model_number}` : ''} ·{' '}
                        {selected.official_item_name}
                        {selected.official_kg_text
                          ? ` · Manufacturer kg figure ${selected.official_kg_text}`
                          : ''}
                      </p>
                      {selected.notes && <p className={noteText}>{selected.notes}</p>}
                      <p className={noteText}>
                        {selected.source_url ? (
                          <a
                            className="text-foreground underline underline-offset-4"
                            href={selected.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Official manufacturer source
                          </a>
                        ) : (
                          'No official source'
                        )}{' '}
                        · checked {selected.checked_date}
                      </p>
                      <p className={noteText}>
                        The official reference is the starting resistance without plates and is not
                        automatically added to the base weight below. A one-side value is not the
                        sum of both sides.
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
            <Label className={fieldLabel}>
              Machine name
              <CommonInput
                required
                className={touchText}
                maxLength={120}
                value={machineEditor.name}
                onChange={(e) => setMachineEditor({ ...machineEditor, name: e.target.value })}
                {...invalid('name')}
              />
            </Label>
            {issue('name')}
            <Label className={fieldLabel}>
              Base weight (kg) · leave blank if unknown
              <CommonInput
                className={touchText}
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
                {...invalid('base_weight')}
              />
            </Label>
            {issue('base_weight')}
            <p className={fieldHint}>
              Leave the base weight blank if you could not confirm it. It is stored separately from
              a confirmed 0 kg, and changing the base weight does not change the total weight of
              past sets.
            </p>
            <Label className={fieldLabel}>
              Source / setting notes
              <textarea
                className={textareaField}
                maxLength={2000}
                value={machineEditor.notes}
                onChange={(e) => setMachineEditor({ ...machineEditor, notes: e.target.value })}
              />
            </Label>
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="machine-single-joint"
                // The legacy touch rule makes every .legacy button 44px; the box stays 16px and the
                // common Checkbox's 44px ::after area is the target (project-standards#415).
                className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
                checked={machineEditor.single_joint === true}
                onCheckedChange={(checked) =>
                  setMachineEditor({ ...machineEditor, single_joint: checked === true })
                }
              />
              <Label
                htmlFor="machine-single-joint"
                className="mb-0 flex-row text-meta font-normal text-foreground"
              >
                Single-joint exercise machine (uses the single-joint default rest when a set is
                completed)
              </Label>
            </div>
            <Button className="w-full" disabled={saving}>
              {saving && <Spinner size="sm" aria-hidden />}
              Save machine
            </Button>
          </form>
        </Modal>
      )}
      <Toaster />
    </>
  );
}
// A short explanation under a field in the goal and machine forms.
const fieldHint = cn(formHint, 'mb-4');
const noteText = 'text-meta text-muted-foreground';
// #64: React Hook Form with the shared goal schema. Messages come from the same
// contract the server uses, and each one is linked to its field for screen readers.
function GoalForm({
  deadline,
  saving,
  names,
  onSave,
}: {
  deadline: string;
  saving: boolean;
  names: readonly string[];
  onSave: (goal: GoalInput) => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<GoalInput>({
    resolver: zodResolver(goalSchema),
    defaultValues: { exercise: '', target_reps: 10, start_date: today(), deadline },
  });
  const exercise = watch('exercise') ?? '';
  // A picked suggestion or an accepted similar name, validated like typing once submitted.
  const rename = (value: string) =>
    setValue('exercise', value, { shouldDirty: true, shouldValidate: isSubmitted });
  const field = (name: keyof GoalInput) => invalidProps(name, errors[name]?.message);
  const message = (name: keyof GoalInput) => (
    <FieldError name={name}>{errors[name]?.message}</FieldError>
  );
  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSave)(event)}>
      <Label className={fieldLabel}>
        Exercise name
        {/* #124: the same suggestions as the journal; a pick sets the form value. */}
        <Combobox
          className={touchText}
          maxLength={120}
          placeholder="Enter the same exercise name as in the journal"
          {...register('exercise')}
          {...field('exercise')}
          value={exercise}
          options={names}
          listLabel="Previously used names"
          onValueChange={rename}
        />
      </Label>
      {message('exercise')}
      <SimilarNameHint value={exercise} names={names} onReplace={rename} />
      <GoalSuggestion
        exercise={exercise}
        apply={(weight) => setValue('target_weight', weight, { shouldValidate: true })}
      />
      <div className="grid grid-cols-2 gap-x-3 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1">
        <Label className={fieldLabel}>
          Goal total weight (kg)
          <CommonInput
            className={touchText}
            type="number"
            min="0"
            max="99999"
            step="0.25"
            {...register('target_weight', { valueAsNumber: true })}
            {...field('target_weight')}
          />
        </Label>
        <Label className={fieldLabel}>
          Goal reps
          <CommonInput
            className={touchText}
            type="number"
            min="1"
            max="1000"
            {...register('target_reps', { valueAsNumber: true })}
            {...field('target_reps')}
          />
        </Label>
        <Label className={fieldLabel}>
          Start date
          <CommonInput
            className={touchText}
            type="date"
            {...register('start_date')}
            {...field('start_date')}
          />
        </Label>
        <Label className={fieldLabel}>
          End date
          <CommonInput
            className={touchText}
            type="date"
            {...register('deadline')}
            {...field('deadline')}
          />
        </Label>
      </div>
      {message('target_weight')}
      {message('target_reps')}
      {message('start_date')}
      {message('deadline')}
      <p className={fieldHint}>
        It counts as achieved when you hit the goal weight or more and the goal reps or more in a
        single set within the period.
      </p>
      <Button className="w-full" disabled={saving}>
        {saving && <Spinner size="sm" aria-hidden />}
        Save goal
      </Button>
    </form>
  );
}
type Suggestion = {
  exercise: string;
  weight_step: number;
  custom: boolean;
  base: { source: 'goal' | 'record'; weight: number; reps: number } | null;
  target_weight: number | null;
};
// #86: the next goal is the latest goal or record plus the exercise's increment
// (default 5 kg). Changing the increment saves it for this exercise right away, so
// later suggestions and auto routines use it too.
function GoalSuggestion({ exercise, apply }: { exercise: string; apply: (w: number) => void }) {
  const name = exercise.trim();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [step, setStep] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (value: string, signal?: { stale: boolean }) => {
    try {
      const next = await api<Suggestion>(`/goal-suggestion?exercise=${encodeURIComponent(value)}`);
      if (signal?.stale) return;
      setSuggestion(next);
      setStep(String(next.weight_step));
    } catch (e) {
      if (!signal?.stale) setMessage((e as Error).message);
    }
  }, []);
  useEffect(() => {
    setSuggestion(null);
    setMessage('');
    if (!name) return;
    const signal = { stale: false };
    const id = setTimeout(() => void load(name, signal), 300);
    return () => {
      signal.stale = true;
      clearTimeout(id);
    };
  }, [name, load]);
  async function save(value: number | null) {
    const checked = weightStepSchema.safeParse({ exercise: name, weight_step: value });
    if (!checked.success) {
      setMessage(checked.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await api('/exercise-weight-steps', 'PUT', checked.data);
      setMessage(value === null ? 'Reset to the default increase step' : 'Increase step saved');
      await load(name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!name) return null;
  return (
    <section
      aria-label="Suggest next goal"
      className="mb-4 rounded-lg border border-input p-3 text-body-sm"
    >
      {suggestion &&
        (suggestion.base && suggestion.target_weight !== null ? (
          <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground">
            Suggestion {fmt(suggestion.target_weight)} kg ·{' '}
            {suggestion.base.source === 'goal' ? 'Recent goals' : 'Previous record'}{' '}
            {fmt(suggestion.base.weight)} kg + {fmt(suggestion.weight_step)} kg{' '}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => apply(suggestion.target_weight!)}
            >
              Apply suggestion
            </Button>
          </p>
        ) : (
          <p className="mb-2 text-body-sm text-muted-foreground">
            Cannot suggest because this exercise has no goals or completed records.
          </p>
        ))}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Label className={cn(fieldLabel, 'mb-0')}>
          Increase step for this exercise (kg)
          <CommonInput
            className={touchText}
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={step}
            onChange={(e) => setStep(e.target.value)}
          />
        </Label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void save(step === '' ? Number.NaN : Number(step))}
        >
          {busy && <Spinner size="sm" aria-hidden />}
          Save increase step
        </Button>
        {suggestion?.custom && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>
            To the default ({defaultWeightStep} kg)
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="mt-2 text-body-sm text-muted-foreground">
          {message}
        </p>
      )}
    </section>
  );
}
function Chart({
  workouts,
  from,
  to,
  custom = false,
}: {
  workouts: Workout[];
  from: string;
  to: string;
  custom?: boolean;
}) {
  const start = calendarDate(from),
    end = calendarDate(to);
  const count = Math.round((+end - +start) / 86400000) + 1;
  const buckets = count > 31 ? 12 : count > 7 ? Math.ceil(count / 7) : count;
  // #85: a directly chosen range groups by day, week or month by its length.
  const sum = (a: string, b: string) =>
    workouts
      .filter((w) => cleanDate(w.date) >= a && cleanDate(w.date) < b)
      .reduce((n, w) => n + vol(w), 0);
  const values = custom
    ? rangeBuckets(from, to).map((b) => ({ label: b.label, value: sum(b.start, b.end) }))
    : presetValues();
  // Up to 31 daily bars: only every few labels are drawn so they do not overlap.
  const labelStep = Math.ceil(values.length / 12);
  function presetValues() {
    return Array.from({ length: buckets }, (_, i) => {
      const a = new Date(start);
      a.setUTCDate(a.getUTCDate() + Math.floor((i * count) / buckets));
      const b = new Date(start);
      b.setUTCDate(b.getUTCDate() + Math.floor(((i + 1) * count) / buckets));
      return {
        label:
          count > 7
            ? `${a.getUTCMonth() + 1}/${a.getUTCDate()}`
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.getUTCDay()],
        value: workouts
          .filter((w) => cleanDate(w.date) >= iso(a) && cleanDate(w.date) < iso(b))
          .reduce((n, w) => n + vol(w), 0),
      };
    });
  }
  const max = Math.max(100, ...values.map((v) => v.value));
  // Past a week of bars the labels thin out by the plot's own width (the sidebar and the
  // side card make it independent of the screen width): every 4th, every 2nd, then all.
  const labelClass = (i: number) =>
    values.length <= 7 || i % (labelStep * 4) === 0
      ? undefined
      : i % (labelStep * 2) === 0
        ? 'hidden @min-[200px]:inline'
        : 'hidden @min-[480px]:inline';
  return (
    <div
      data-slot="volume-chart"
      className="flex h-56 gap-3 px-4 pt-6 pb-5 md:px-6 2xl:h-64"
      role="img"
      aria-label={`Volume by period: ${values.map((v) => v.label + ' ' + fmt(v.value) + 'kg').join(', ')}`}
    >
      <div className="flex shrink-0 flex-col justify-between pb-6 text-right text-meta tabular-nums">
        {[1, 0.75, 0.5, 0.25, 0].map((v) => (
          <span key={v} className="-my-2">
            {fmt(max * v)}
          </span>
        ))}
      </div>
      <div className="@container relative min-w-0 flex-1">
        <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className="border-t border-dashed" />
          ))}
        </div>
        <div className="absolute inset-0 flex justify-around gap-px @sm:gap-1 @lg:gap-2.5">
          {/* min-w-0 and absolutely placed labels keep 31 bars inside a narrow plot (#101). */}
          {values.map((v, i) => (
            <div className="flex max-w-10 min-w-0 flex-1 flex-col items-center" key={i}>
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  data-slot="volume-bar"
                  className={cn(
                    'w-3/4 min-w-0.5 rounded-t-sm',
                    i === values.length - 1 ? 'bg-primary' : 'bg-foreground/20',
                  )}
                  style={{ height: `${(v.value / max) * 100}%`, minHeight: v.value ? 3 : 0 }}
                  title={`${v.label}: ${fmt(v.value)}kg`}
                />
              </div>
              <span className="relative h-6 w-full text-meta leading-6">
                {i % labelStep === 0 && (
                  <span
                    data-slot="volume-label"
                    className={cn(
                      'absolute left-1/2 -translate-x-1/2 whitespace-nowrap',
                      labelClass(i),
                    )}
                  >
                    {v.label}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        {!workouts.length && (
          <div className="absolute inset-x-0 top-[30%] text-center text-caption">
            The chart fills in from your first record
          </div>
        )}
      </div>
    </div>
  );
}
