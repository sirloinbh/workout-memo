import { QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Scale,
  Settings as SettingsIcon,
  Target,
  Trophy,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';

import { listCardioSessions } from './cardio/api';
import { AppShell, type NavItem } from './components/layout/app-shell';
import { Modal } from './components/modal';
import { AlertBanner } from './components/ui/alert-banner';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { PageHeader } from './components/ui/page-header';
import { SkeletonCard } from './components/ui/skeleton';
import { Toaster } from './components/ui/sonner';
import { dateTitle } from './date';
import { candidateNames, type ExerciseName } from './exercise-name-match';
import { createQueryClient, useApiQuery } from './lib/query';
import { SyncBadge, SyncStatus } from './offline/sync-status';
import { useOfflineSync } from './offline/use-offline-sync';
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
  Settings,
} from './pages';
import { routineDraft } from './progress-data';
import { type CardioPreset } from './routine-cardio';
import { AccountActions, SignInGate } from './sign-in';
import { api, type Changed, changed, type WriteAction } from './workspace/api';
import { GoalForm } from './workspace/goal-form';
import { MachineEditor } from './workspace/machine-editor';
import {
  type Goal,
  isLogPage,
  type Machine,
  type OfficialWeight,
  type Page,
  pageOf,
  pages,
  statusNotice,
  today,
  withPeriod,
  type Workout,
} from './workspace/model';
import { NewRecords } from './workspace/new-records';
import { PeriodControls } from './workspace/period-controls';
import { usePeriodRange } from './workspace/use-period-range';
import { usePush } from './workspace/use-push';
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
  // The shared client (lib/query), with this app's choices kept: a failure shows at once with its own
  // reconnect button (no retry), and a window that gets focus again does not refetch.
  const [client] = useState(() =>
    createQueryClient({
      defaultOptions: {
        queries: {
          staleTime: 0,
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
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
  const page: Page = pageOf(location.pathname) ?? 'journal';
  const logPage = isLogPage(page);
  const headerActionLabel =
    page === 'goals' ? 'Add goal' : page === 'machines' ? 'Add machine' : 'Log workout';
  const setPage = (next: Page) => void navigate(pages[next]);
  const queryClient = useQueryClient();
  const range = usePeriodRange(page);
  const { customRange, journalTab, setJournalTab, from, to } = range;
  const cardioTab = logPage && journalTab === 'cardio';
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
  const pushState = usePush();
  // #62: the period is part of the query key, so a late response for an earlier
  // period can never replace the selected one's data, error or loading state.
  const workoutsQuery = useQuery({
    queryKey: ['workouts', from, to],
    queryFn: () => api<Workout[]>(`/workouts?from=${from}&to=${to}`),
  });
  const goalsQuery = useApiQuery<Goal[]>(['goals'], '/api/goals');
  // #115: the dashboard's cardio summary. Only the dashboard asks (the journal tab loads its
  // own list), and a failure only hides the card.
  const cardioQuery = useQuery({
    queryKey: ['cardio-sessions', from, to],
    queryFn: () => listCardioSessions(from, to).catch(() => []),
    enabled: page === 'overview',
  });
  const machinesQuery = useApiQuery<Machine[]>(['machines'], '/api/machines');
  // Brands change only through a machine save, which refetches them (#376).
  const brandsQuery = useApiQuery<{ id: number; name: string }[]>(['brands'], '/api/brands', {
    staleTime: Infinity,
  });
  const officialQuery = useQuery({
    queryKey: ['official-machine-weights'],
    // Reference data is optional: its failure must not block journal data.
    queryFn: () => api<OfficialWeight[]>('/official-machine-weights').catch(() => null),
    staleTime: Infinity,
  });
  // #124: exercise name candidates for the journal and goal fields. Optional: a failed load
  // keeps the names this screen already has.
  const exerciseNamesQuery = useQuery({
    queryKey: ['exercise-names'],
    queryFn: () => api<ExerciseName[]>('/exercise-names').catch(() => []),
  });
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
  // A restore replaces everything, so it alone refreshes every query; other writes name what they changed.
  const refreshAll = () => queryClient.invalidateQueries();
  const reconnect = () => {
    setError('');
    void Promise.all(journalQueries.map((q) => q.refetch()));
  };
  const offline = useOfflineSync({
    onSynced: async () => {
      void loadProgress();
      await refetchChanged(changed.workouts);
    },
  });
  const draft = useWorkoutDraft({
    setSaving,
    onQueued: () => void offline.flush(),
    onSaved: async () => {
      void loadProgress();
      await refetchChanged(changed.workouts);
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
  const refetchChanged = (keys: Changed) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const write = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown>; changes: Changed }) => fn(),
    onSuccess: (_data, { changes }) => refetchChanged(changes),
  });
  const action: WriteAction = async (fn, done, changes = changed.workouts) => {
    setSaving(true);
    try {
      await write.mutateAsync({ fn, changes });
      done?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
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
    ['journal', 'Day log', NotebookPen],
    ['goals', 'My Goals', Target],
    ['analysis', 'Exercise Analysis', Trophy],
    ['routines', 'Routine Builder', ClipboardList],
    ['body', 'Body records', Scale],
    ['overview', 'Dashboard', LayoutDashboard],
    // #504: the settings page goes last. Backup & Export and the Machine Library are reached from it (#508).
    ['settings', 'Settings', SettingsIcon],
  ] as const;
  // #85: pages sharing the period keep a directly chosen range in the address. The journal's
  // tab (#115) belongs to the journal only.
  const rangeSearch = (() => {
    const params = new URLSearchParams(location.search);
    params.delete('tab');
    params.delete('period');
    const text = params.toString();
    return text ? '?' + text : '';
  })();
  const navItems: NavItem[] = nav.map(([key, label, icon]) => ({
    to:
      pages[key] +
      (['journal'].includes(key)
        ? location.search
        : ['overview', 'body'].includes(key)
          ? rangeSearch
          : ''),
    label,
    icon,
    end: true,
  }));
  const periodControls = <PeriodControls range={range} />;
  const ownPage = ['routines', 'backup', 'body', 'analysis', 'settings'].includes(page);
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
        actions={
          <>
            <SyncBadge sync={offline} />
            <AccountActions />
          </>
        }
      >
        <div className="legacy">
          {/* #530: the workout editor opens on the page. The page below stays mounted but hidden, so its state
              (tab, loaded data) is intact when the editor closes. */}
          {editor && (
            <WorkoutEditor
              draft={draft}
              saving={saving}
              machines={machines}
              exerciseNames={exerciseNames}
              titles={[...new Set(workouts.map((w) => w.title).filter(Boolean))]}
              progress={progress}
            />
          )}
          <div hidden={!!editor}>
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
                <Route path={pages.settings} element={<Settings pushState={pushState} />} />
                <Route path="*" element={null} />
              </Routes>
            </Suspense>
            {!ownPage && (
              <PageHeader
                className="mb-6 md:mb-9"
                title={
                  page === 'overview'
                    ? 'Dashboard'
                    : logPage
                      ? dateTitle(progress?.today ?? today())
                      : page === 'goals'
                        ? 'My Goals'
                        : 'Machine Library'
                }
                description={logPage ? (progress?.routine?.name ?? 'No routine') : undefined}
                actions={
                  // #115: on the Cardio tab the panel's own "Add cardio record" is the main action.
                  !cardioTab && (
                    <Button
                      // #533: icon only; the accessible name and tooltip carry the action's text.
                      size="icon"
                      aria-label={headerActionLabel}
                      title={headerActionLabel}
                      // A recoverable local draft must be restored or discarded first (#101).
                      disabled={!!recovery && (page === 'overview' || logPage)}
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
                    </Button>
                  )
                }
              />
            )}
            {error && (
              <AlertBanner
                className="mb-5"
                action={
                  <Button type="button" variant="outline" size="sm" onClick={reconnect}>
                    Reconnect
                  </Button>
                }
              >
                {error}
              </AlertBanner>
            )}
            {storageWarning && !editor && (
              <AlertBanner className="mb-5">{storageWarning}</AlertBanner>
            )}
            {!editor && <Notice className="mb-5" notice={statusNotice(saveState)} />}
            <SyncStatus sync={offline} />
            {!editor && <NewRecords records={draft.newRecords} />}
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
                      setSaveState('Draft discarded');
                    }}
                  >
                    Discard draft
                  </Button>
                </div>
              </Card>
            )}
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
                {[pages.journal].map((path) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <JournalPage
                        periodControls={periodControls}
                        journalTab={journalTab}
                        setJournalTab={setJournalTab}
                        from={from}
                        to={to}
                        recordsProps={recordsProps}
                        routine={routine}
                        quickWorkout={quickWorkout}
                        cardioPreset={cardioPreset}
                        setCardioPreset={setCardioPreset}
                        clearCardioPreset={clearCardioPreset}
                      />
                    }
                  />
                ))}
                {/* The old Week and 12-week addresses open the dashboard (#535). */}
                <Route
                  path="/week"
                  element={
                    <Navigate to={{ pathname: pages.overview, search: location.search }} replace />
                  }
                />
                <Route
                  path="/12-weeks"
                  element={
                    <Navigate
                      to={{
                        pathname: pages.overview,
                        search: withPeriod(location.search, '12weeks'),
                      }}
                      replace
                    />
                  }
                />
                {/* The old journal address keeps working (#504). */}
                <Route
                  path="/journal"
                  element={
                    <Navigate to={{ pathname: pages.journal, search: location.search }} replace />
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
                <Route path={pages.settings} element={null} />
                <Route path="*" element={<Navigate to={pages.journal} replace />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </AppShell>
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
                changed.goals,
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
