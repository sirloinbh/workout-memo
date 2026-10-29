import { expect, type Page } from '@playwright/test';

import { type AnalysisSet, analyze } from '../../backend/src/analysis.js';
import {
  defaultWeightStep,
  type RoutinePlan,
  routineSchedule,
  routineSchema,
} from '../../backend/src/domain.js';
import {
  routineProgress,
  withWeightSteps,
  type WorkoutRecord,
} from '../../backend/src/progress.js';
import { autoRoutineInput } from '../../backend/test/routine-fixture.js';

// #113: screen checks (visual, responsive, accessibility) use fixed data and a fixed
// clock instead of the shared test DB, which other specs fill with unique rows. Routine
// progress and analysis are computed with the real server functions.
export const today = '2026-10-15'; // Thursday
export const now = new Date('2026-10-15T10:00:00+09:00');

export const pages = [
  { path: '/', name: 'dashboard' },
  { path: '/journal', name: 'journal' },
  { path: '/goals', name: 'goals' },
  { path: '/analysis', name: 'analysis' },
  { path: '/routines', name: 'routines' },
  { path: '/body', name: 'body' },
  { path: '/machines', name: 'machines' },
  { path: '/backup', name: 'backup' },
] as const;

// Each modal opens from the page header's primary button.
export const modals = [
  { path: '/', button: '운동 기록하기', dialog: '새로운 운동 기록', name: 'workout-editor' },
  { path: '/goals', button: '목표 추가', dialog: '점진적 과부하 목표', name: 'goal-editor' },
  { path: '/machines', button: '머신 등록', dialog: '머신 등록', name: 'machine-editor' },
] as const;

export const widths = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

const brands = [
  { id: 1, name: '해머 스트렝스' },
  { id: 2, name: '라이프 피트니스' },
];
const machines = [
  {
    id: 2,
    brand_id: 1,
    brand: '해머 스트렝스',
    name: '레그프레스',
    base_weight: 50,
    notes: '시트 4칸',
    official_weight_id: null,
    official_status: null,
    single_joint: false,
  },
  {
    id: 1,
    brand_id: 2,
    brand: '라이프 피트니스',
    name: '랫풀다운',
    base_weight: null,
    notes: '',
    official_weight_id: null,
    official_status: null,
    single_joint: false,
  },
];

const set = (exercise: string, weight: number, reps: number, extra = {}) => ({
  exercise,
  machine_id: null as number | null,
  weight,
  reps,
  notes: '',
  completed: true,
  rpe: null,
  ...extra,
});
const workouts = [
  {
    id: 6,
    version: 1,
    date: '2026-10-15',
    title: '10월 15일(목)',
    notes: '',
    feedback: null,
    sets: [
      set('벤치프레스', 100, 10),
      set('벤치프레스', 100, 9),
      set('벤치프레스', 100, 8, { completed: false }),
    ],
  },
  {
    id: 5,
    version: 2,
    date: '2026-10-13',
    title: '하체',
    notes: '무릎 컨디션 좋음',
    feedback: 'medium',
    sets: [
      set('레그프레스', 180, 12, { machine_id: 2 }),
      set('레그프레스', 180, 10, { machine_id: 2 }),
      set('루마니안 데드리프트', 80, 10),
    ],
  },
  {
    id: 4,
    version: 1,
    date: '2026-10-09',
    title: '상체',
    notes: '',
    feedback: 'hard',
    sets: [
      set('벤치프레스', 97.5, 10),
      set('랫풀다운', 60, 12, { machine_id: 1 }),
      set('랫풀다운', 60, 11, { machine_id: 1, rpe: 9 }),
    ],
  },
  {
    id: 3,
    version: 1,
    date: '2026-10-06',
    title: '하체',
    notes: '',
    feedback: 'easy',
    sets: [set('레그프레스', 170, 12, { machine_id: 2 }), set('루마니안 데드리프트', 75, 10)],
  },
  {
    id: 2,
    version: 1,
    date: '2026-09-29',
    title: '상체',
    notes: '',
    feedback: null,
    sets: [set('벤치프레스', 95, 10), set('랫풀다운', 55, 12, { machine_id: 1 })],
  },
  {
    id: 1,
    version: 1,
    date: '2026-09-22',
    title: '전신',
    notes: '',
    feedback: null,
    sets: [set('벤치프레스', 92.5, 10), set('레그프레스', 160, 12, { machine_id: 2 })],
  },
];
const goals = [
  {
    id: 2,
    exercise: '벤치프레스',
    target_weight: 110,
    target_reps: 5,
    start_date: '2026-10-01',
    deadline: '2026-12-31',
    achieved: false,
  },
  {
    id: 1,
    exercise: '레그프레스',
    target_weight: 180,
    target_reps: 10,
    start_date: '2026-09-01',
    deadline: '2026-10-31',
    achieved: true,
  },
];
const bodyParts = [
  { exercise: '벤치프레스', body_parts: ['가슴', '팔'] },
  { exercise: '랫풀다운', body_parts: ['등'] },
  { exercise: '레그프레스', body_parts: ['하체-앞'] },
  { exercise: '루마니안 데드리프트', body_parts: ['하체-뒤'] },
];
const body = [
  {
    id: 1,
    date: '2026-09-17',
    body_weight_kg: 78.4,
    body_fat_percent: 19.8,
    skeletal_muscle_kg: 35.1,
  },
  {
    id: 2,
    date: '2026-09-24',
    body_weight_kg: 78.1,
    body_fat_percent: 19.5,
    skeletal_muscle_kg: 35.2,
  },
  {
    id: 3,
    date: '2026-10-01',
    body_weight_kg: 77.6,
    body_fat_percent: 19.1,
    skeletal_muscle_kg: 35.4,
  },
  {
    id: 4,
    date: '2026-10-08',
    body_weight_kg: 77.9,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
  {
    id: 5,
    date: '2026-10-14',
    body_weight_kg: 77.2,
    body_fat_percent: 18.7,
    skeletal_muscle_kg: 35.6,
  },
];

const plan = routineSchema.parse({
  ...autoRoutineInput(),
  name: '상하체 12주 루틴',
  start_date: '2026-09-28',
}) as RoutinePlan;
const routine = { ...plan, id: 1, schedule: routineSchedule(plan) };
// The server applies the user's weight steps before computing progress (#86).
const weightSteps: Record<string, number> = { 벤치프레스: 2.5 };
const records: WorkoutRecord[] = workouts.flatMap((w) =>
  [...new Set(w.sets.map((s) => s.exercise))].map((exercise) => ({
    date: w.date,
    exercise: exercise.toLowerCase(),
    feedback: w.feedback as WorkoutRecord['feedback'],
    sets: w.sets.filter((s) => s.exercise === exercise),
  })),
);
const progress = {
  routine: { id: routine.id, name: plan.name, splits: plan.splits.length },
  ...routineProgress(withWeightSteps(plan, weightSteps), [], today, records),
  previous: {
    벤치프레스: { date: '2026-10-09', sets: [{ weight: 97.5, reps: 10 }] },
  },
};
const analysisRows: AnalysisSet[] = workouts.flatMap((w) =>
  w.sets
    .filter((s) => s.completed)
    .map((s, i) => ({
      id: w.id * 100 + i,
      date: w.date,
      exercise: s.exercise,
      exercise_key: s.exercise.trim().toLowerCase(),
      weight: s.weight,
      reps: s.reps,
      unknown_base: s.machine_id === 1,
    })),
);
const mappings = bodyParts.flatMap((m) =>
  m.body_parts.map((body_part) => ({ exercise: m.exercise.toLowerCase(), body_part })),
);

const inRange = <T extends { date: string }>(rows: T[], url: URL) => {
  const from = url.searchParams.get('from') ?? '0000-00-00';
  const to = url.searchParams.get('to') ?? '9999-12-31';
  return rows.filter((r) => r.date >= from && r.date <= to);
};

function respond(url: URL): unknown {
  const path = url.pathname.replace(/^\/api/, '');
  if (path === '/workouts') return inRange(workouts, url);
  if (path === '/goals') return goals;
  if (path === '/machines') return machines;
  if (path === '/brands') return brands;
  if (path === '/official-machine-weights') return [];
  if (path === '/exercise-body-parts') return bodyParts;
  if (path === '/exercise-weight-steps')
    return Object.entries(weightSteps).map(([exercise, weight_step]) => ({
      exercise,
      weight_step,
    }));
  if (path === '/routines') return [routine];
  if (path === `/routines/${routine.id}`) return routine;
  if (path === '/routine-progress') return progress;
  if (path === '/body-measurements') return inRange(body, url);
  if (path === '/analysis')
    return {
      ...analyze(
        analysisRows,
        mappings,
        url.searchParams.get('from')!,
        url.searchParams.get('to')!,
      ),
      today,
    };
  if (path === '/goal-suggestion') return goalSuggestion(url.searchParams.get('exercise') ?? '');
  return undefined;
}

// Same rule as GET /api/goal-suggestion: the latest goal of the exercise, or else the
// heaviest completed set of its latest workout, plus the exercise's weight step.
function goalSuggestion(exercise: string) {
  const key = exercise.trim().toLowerCase();
  const step = weightSteps[key];
  const weightStep = step ?? defaultWeightStep;
  const goal = goals
    .filter((g) => g.exercise.trim().toLowerCase() === key)
    .sort((a, b) => b.id - a.id)[0];
  const record = workouts
    .flatMap((w) =>
      w.sets
        .filter((s) => s.completed && s.exercise.trim().toLowerCase() === key)
        .map((s) => ({ weight: s.weight, reps: s.reps, date: w.date, id: w.id })),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.id - a.id || b.weight - a.weight || b.reps - a.reps,
    )[0];
  const base = goal
    ? { source: 'goal' as const, weight: goal.target_weight, reps: goal.target_reps }
    : record
      ? { source: 'record' as const, weight: record.weight, reps: record.reps, date: record.date }
      : null;
  return {
    exercise: key,
    weight_step: weightStep,
    custom: step !== undefined,
    base,
    target_weight: base
      ? Math.min(99999, Math.round((base.weight + weightStep) * 100) / 100)
      : null,
  };
}

// Serves every API call from the fixtures; screen checks never write.
export async function useFixtures(page: Page) {
  await page.clock.setFixedTime(now);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().method() === 'GET' ? respond(url) : undefined;
    await route.fulfill(
      body === undefined
        ? { status: 404, json: { error: `UI 검사 고정 데이터 없음: ${url.pathname}` } }
        : { json: body },
    );
  });
}

// Waits until data and web fonts are in place so a screenshot is stable.
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText(/불러오는 중/)).toHaveCount(0);
  // #159: the common dialog fades and zooms in; checks run on the finished frame, not
  // through a half-transparent modal. Endless animations (spinners) are skipped.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished),
    ),
  );
}

export async function openPage(page: Page, path: string) {
  await useFixtures(page);
  await page.goto(path);
  await settle(page);
}

export async function openModal(page: Page, modal: (typeof modals)[number]) {
  await openPage(page, modal.path);
  await page.getByRole('main').getByRole('button', { name: modal.button }).first().click();
  const dialog = page.getByRole('dialog', { name: modal.dialog });
  await dialog.waitFor();
  await settle(page);
  return dialog;
}
