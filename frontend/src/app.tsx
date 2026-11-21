import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DatabaseBackup,
  Dumbbell,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Scale,
  Target,
  Trophy,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';

import { listCardioSessions } from './cardio/api';
import { AlertBanner } from './components/alert-banner';
import { AppShell, type NavItem } from './components/layout/app-shell';
import { Modal } from './components/modal';
import { PageHeader } from './components/page-header';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonCard } from './components/ui/skeleton';
import { Toaster } from './components/ui/sonner';
import { dateTitle } from './date';
import { candidateNames, type ExerciseName } from './exercise-name-match';
import {
  Analysis,
  Backup,
  BodyMeasurements,
  DashboardPage,
  GoalsPage,
  JournalPage,
  MachinesPage,
  preloadPages,
  Routines,
} from './pages';
import { routineDraft } from './progress-data';
import { restKind, startTimer } from './rest-timer';
import { type CardioPreset } from './routine-cardio';
import { AccountActions, SignInGate } from './sign-in';
import { api } from './workspace/api';
import { GoalForm } from './workspace/goal-form';
import { MachineEditor } from './workspace/machine-editor';
import {
  type Goal,
  type Machine,
  type OfficialWeight,
  type Page,
  pageOf,
  pages,
  statusNotice,
  today,
  type Workout,
} from './workspace/model';
import { PeriodControls } from './workspace/period-controls';
import { TimerAlert, TimerBar, TimerSettings } from './workspace/rest-timer-panels';
import { usePeriodRange } from './workspace/use-period-range';
import { usePush } from './workspace/use-push';
import { useRestTimer } from './workspace/use-rest-timer';
import { useRoutineProgress } from './workspace/use-routine-progress';
import { useWorkoutDraft } from './workspace/use-workout-draft';
import { WorkoutEditor } from './workspace/workout-editor';
import { type RecordsProps } from './workspace/workout-records';

const pageFallback = (
  <div role="status" aria-busy="true" aria-label="Loading page" className="mt-4">
    <SkeletonCard />
  </div>
);

export function App() {
  // One client per mounted app keeps browser tabs and tests independent. Retries and
  // focus refetches stay off: failures are shown with an explicit reconnect button.
  // Other pages load in the background once the first one is up, so later visits do not wait.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1000));
    idle(() => void preloadPages());
  }, []);
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
        <SignInGate>
          <Workspace />
        </SignInGate>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const page: Page = pageOf(location.pathname) ?? 'overview';
  const setPage = (next: Page) => void navigate(pages[next]);
  const queryClient = useQueryClient();
  const range = usePeriodRange(page);
  const { customRange, journalTab, setJournalTab, from, to } = range;
  const cardioTab = page === 'journal' && journalTab === 'cardio';
  const [brand, setBrand] = useState(0),
    [actionError, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [goalEditor, setGoalEditor] = useState(false),
    [machineEditor, setMachineEditor] = useState<Partial<Machine> | null>(null);
  // #117: "Log cardio" on today's routine card opens the Cardio tab with a filled-in record.
  const [cardioPreset, setCardioPreset] = useState<CardioPreset | null>(null);
  const clearCardioPreset = useCallback(() => setCardioPreset(null), []);
  const routine = useRoutineProgress(page);
  const { progress, loadProgress } = routine;
  const rest = useRestTimer();
  const { timer, updateTimer, restDurations } = rest;
  const pushState = usePush(timer);
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
  const restSeconds = (s: Workout['sets'][number]) => {
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
  const draft = useWorkoutDraft({
    setSaving,
    onSaved: async () => {
      void loadProgress();
      await refreshAll();
    },
    onSetCompleted: (set) => {
      if (timer.autoStart) updateTimer(startTimer(timer, Date.now(), restSeconds(set)));
    },
  });
  const {
    editor,
    updateEditor,
    setEditor,
    persist,
    recovery,
    setRecovery,
    storageWarning,
    saveState,
    setSaveState,
  } = draft;
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
  const periodControls = <PeriodControls range={range} />;
  const timerBar = <TimerBar rest={rest} />;
  const timerAlert = <TimerAlert message={rest.timerWarning || pushState.pushWarning} />;
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
  const recordsProps: RecordsProps = {
    workouts,
    loading,
    machines,
    recovery: !!recovery,
    saving,
    newWorkout,
    setEditor,
    action,
  };
  return (
    <>
      <AppShell
        appName="FORM · My Workout Log"
        nav={navItems}
        actions={<AccountActions />}
        footer="Today's record creates tomorrow's change."
      >
        <div className="legacy">
          {/* Pages with their own component draw everything below, so the bar goes first. */}
          {ownPage && pageTimer}
          <Suspense fallback={ownPage ? pageFallback : null}>
            <Routes>
              <Route path={pages.routines} element={<Routines exerciseNames={exerciseNames} />} />
              <Route
                path={pages.backup}
                element={<Backup onRestored={() => void refreshAll()} />}
              />
              <Route
                path={pages.body}
                element={
                  <BodyMeasurements
                    from={from}
                    to={to}
                    workouts={workouts}
                    controls={periodControls}
                  />
                }
              />
              <Route path={pages.analysis} element={<Analysis />} />
              <Route path="*" element={null} />
            </Routes>
          </Suspense>
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
          <Suspense fallback={ownPage ? null : pageFallback}>
            <Routes>
              {/* An unknown address falls back to the dashboard instead of an empty screen. */}
              <Route
                path={pages.overview}
                element={
                  <DashboardPage
                    periodControls={periodControls}
                    goals={goals}
                    cardioSessions={cardioSessions}
                    recordsProps={recordsProps}
                    from={from}
                    to={to}
                    custom={!!customRange}
                    setPage={setPage}
                  />
                }
              />
              <Route
                path={pages.journal}
                element={
                  <JournalPage
                    periodControls={periodControls}
                    journalTab={journalTab}
                    setJournalTab={setJournalTab}
                    from={from}
                    to={to}
                    goals={goals}
                    recordsProps={recordsProps}
                    routine={routine}
                    quickWorkout={quickWorkout}
                    cardioPreset={cardioPreset}
                    setCardioPreset={setCardioPreset}
                    clearCardioPreset={clearCardioPreset}
                  />
                }
              />
              <Route
                path={pages.goals}
                element={<GoalsPage goals={goals} saving={saving} action={action} to={to} />}
              />
              <Route
                path={pages.machines}
                element={
                  <MachinesPage
                    machines={machines}
                    brands={brands}
                    brand={brand}
                    setBrand={setBrand}
                    setMachineEditor={setMachineEditor}
                  />
                }
              />
              <Route path={pages.routines} element={null} />
              <Route path={pages.backup} element={null} />
              <Route path={pages.body} element={null} />
              <Route path={pages.analysis} element={null} />
              <Route path="*" element={<Navigate to={pages.overview} replace />} />
            </Routes>
          </Suspense>
        </div>
      </AppShell>
      {editor && (
        <WorkoutEditor
          draft={draft}
          saving={saving}
          machines={machines}
          exerciseNames={exerciseNames}
          progress={progress}
          timerBar={timerBar}
          timerAlert={timerAlert}
          timerSettings={<TimerSettings rest={rest} pushState={pushState} />}
        />
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
        <MachineEditor
          machineEditor={machineEditor}
          setMachineEditor={setMachineEditor}
          issues={draft.issues}
          setIssues={draft.setIssues}
          brands={brands}
          officialWeights={officialWeights}
          saving={saving}
          action={action}
        />
      )}
      <Toaster />
    </>
  );
}
