import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { routineSchema, type RoutinePlan } from '../../backend/src/domain';
import { routineProgress } from '../../backend/src/progress';
import { autoRoutineInput, routineInput } from '../../backend/test/routine-fixture';
import { App } from './app';
import { deferred, json, mockApi } from './test/api';

// Ported from backend/test/routine-progress-ui.test.ts (vm hook harness) to a real
// DOM. The server is simulated with the real progress functions so previews match
// applied results.
const plan = routineSchema.parse(routineInput(2)) as RoutinePlan;
const today = '2024-03-04'; // Monday, the second training slot: split 2, week 1.

function mount(options: { routine?: boolean; plan?: RoutinePlan } = {}) {
  vi.stubGlobal('confirm', () => true);
  let rests: string[] = [];
  let holdRest: Promise<void> | undefined;
  const serverProgress = () =>
    options.routine === false
      ? { today, routine: null }
      : {
          routine: { id: 7, name: '수동 12주 루틴', splits: 2 },
          ...routineProgress(options.plan ?? plan, rests, today),
          previous: {
            스쿼트: {
              date: '2024-03-01',
              sets: [
                { weight: 100, reps: 10 },
                { weight: 100, reps: 9 },
              ],
            },
          },
        };
  const api = mockApi(async ({ method, url }) => {
    const pathname = url.pathname;
    if (pathname === '/api/routine-progress') return serverProgress();
    if (pathname === '/api/routines/7/rests' && method === 'POST') {
      const pending = holdRest;
      holdRest = undefined;
      await pending;
      if (rests.includes(today)) return json({ applied: false, ...serverProgress() });
      rests = [...rests, today];
      return json({ applied: true, ...serverProgress() }, 201);
    }
    if (pathname === `/api/routines/7/rests/${today}` && method === 'DELETE') {
      rests = rests.filter((d) => d !== today);
      return json({ applied: true, ...serverProgress() });
    }
    if (pathname === '/api/workouts' && method === 'POST') return json({ id: 42, version: 1 }, 201);
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const text = (el: Element = document.body) => el.textContent ?? '';
  function button(label: string) {
    const found = screen.queryAllByRole('button', { name: label })[0];
    expect(found, `User can access ${label}`).toBeTruthy();
    return found;
  }
  async function click(label: string) {
    const found = (await screen.findAllByRole('button', { name: label }))[0];
    expect(found, `${label} is enabled`).toBeEnabled();
    await user.click(found);
  }
  const setRows = () =>
    [...document.querySelectorAll('div')].filter((e) => e.className === 'set-editor');
  function field(row: Element, label: string) {
    const item = [...row.querySelectorAll('label')].filter((e) =>
      text(e).trim().startsWith(label),
    )[0];
    expect(item, `set field ${label}`).toBeTruthy();
    return item.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
  }
  function change(row: Element, label: string, value: string) {
    fireEvent.change(field(row, label), { target: { value } });
  }
  function submit() {
    const form = document.querySelector('form');
    expect(form, 'journal form is open').toBeTruthy();
    fireEvent.submit(form!);
  }
  return {
    requests: api.requests,
    text,
    button,
    click,
    setRows,
    field,
    change,
    submit,
    holdNextRest() {
      const gate = deferred();
      holdRest = gate.promise;
      return gate;
    },
  };
}
type UI = ReturnType<typeof mount>;
const card = () => document.querySelector('[aria-label="루틴 목표"]');
const progressLoads = (ui: UI) =>
  ui.requests.filter((r) => r.path === '/api/routine-progress').length;
async function openJournal(ui: UI) {
  await ui.click('운동 일지');
  // Wait until the routine goals are loaded (no loading status inside the card).
  await waitFor(() => expect(card()?.textContent).not.toMatch(/루틴 목표를 불러오는 중/));
}
const posts = (ui: UI, path: string) =>
  ui.requests.filter((r) => r.method !== 'GET' && r.path === path);
const weekRows = () =>
  [...document.querySelectorAll('tr')].filter((e) => /^\d+주차/.test(e.textContent ?? ''));

test('journal shows per-exercise targets for today, this week and all 12 weeks', async () => {
  const ui = mount();
  await openJournal(ui);
  expect(card(), 'routine goals card is on the journal page').toBeTruthy();
  const content = ui.text(card()!);
  expect(content).toMatch(/오늘 목표 · 2024-03-04/);
  expect(content).toMatch(/1주차 · 분할 2 · 총중량 2\.5 kg 증가/);
  expect(content).toMatch(/스쿼트 3세트 · 총중량 102\.75 kg · 10회/);
  expect(content).toMatch(/맨몸 런지 2세트 · 총중량 2\.5 kg · 12회/);
  expect(content).toMatch(/기준 3세트 · 100\.25 kg · 10회/);
  expect(content).toMatch(/직전 기록 2024-03-01 · 100 kg × 10회, 100 kg × 9회/);
  expect(content, 'an exercise without history says so').toMatch(/직전 기록 없음/);
  expect(content, 'weights of different exercises are not summed').not.toMatch(/105\.25|합계/);
  for (const date of ['2024-03-01', '2024-03-04', '2024-03-06'])
    expect(content).toMatch(new RegExp(date));
  const rows = weekRows();
  expect(rows).toHaveLength(12);
  expect(ui.text(rows[3])).toMatch(/4주차디로딩 · 총중량 12\.5 kg 감소/);
  expect(
    ui.requests.filter((r) => r.method !== 'GET'),
    'showing goals never creates a record',
  ).toHaveLength(0);
});

test('returning to the journal reloads routine goals so a routine saved elsewhere appears', async () => {
  const ui = mount();
  await openJournal(ui);
  const before = progressLoads(ui);
  await ui.click('대시보드');
  await ui.click('운동 일지');
  await waitFor(() =>
    expect(progressLoads(ui), 'switching pages fetches the active routine again').toBeGreaterThan(
      before,
    ),
  );
});

test('without a started routine the journal shows guidance to create one', async () => {
  const ui = mount({ routine: false });
  await openJournal(ui);
  expect(ui.text()).toMatch(/진행 중인 루틴이 없습니다\. 루틴짜기에서/);
  expect(screen.queryAllByRole('button', { name: '오늘 루틴으로 기록하기' })).toHaveLength(0);
});

test('prefilled routine draft saves unchanged values with one confirm', async () => {
  const ui = mount();
  await openJournal(ui);
  await ui.click('오늘 루틴으로 기록하기');
  const rows = ui.setRows();
  expect(rows, 'one row per planned set: 3 squat + 2 lunge').toHaveLength(5);
  expect(ui.field(rows[0], '운동명')).toHaveValue('스쿼트');
  expect(Number(ui.field(rows[0], '총중량').value)).toBe(102.75);
  expect(Number(ui.field(rows[0], '횟수').value)).toBe(10);
  expect(ui.field(rows[0], '머신').value, 'machine stays unselected').toBe('');
  expect(ui.field(rows[4], '운동명')).toHaveValue('맨몸 런지');
  expect(ui.text(rows[0])).toMatch(/오늘 목표 102\.75 kg × 10회 · 직전 기록 2024-03-01/);
  expect(posts(ui, '/api/workouts'), 'the draft is not a record before saving').toHaveLength(0);
  expect(localStorage.length, 'the draft is kept locally like any other draft').toBeGreaterThan(0);
  ui.submit();
  await waitFor(() => expect(ui.text()).toMatch(/서버 저장 완료/));
  const [saved] = posts(ui, '/api/workouts');
  expect(saved?.headers['idempotency-key'], 'save uses the idempotent journal flow').toBeTruthy();
  const body = saved.body as {
    date: string;
    title: string;
    sets: {
      exercise: string;
      weight: number;
      reps: number;
      machine_id: null;
      completed: boolean;
      rpe: null;
    }[];
  };
  expect(body.date).toBe(today);
  expect(body.title).toBe('수동 12주 루틴 · 분할 2');
  // #31: missing `completed` means a legacy completed set, so targets must say false.
  expect(
    body.sets.every((s) => s.completed === false && s.rpe === null),
    'unmarked routine targets are saved as planned sets, not performance',
  ).toBe(true);
  expect(body.sets.map((s) => [s.exercise, s.weight, s.reps, s.machine_id])).toEqual([
    ['스쿼트', 102.75, 10, null],
    ['스쿼트', 102.75, 10, null],
    ['스쿼트', 102.75, 10, null],
    ['맨몸 런지', 2.5, 12, null],
    ['맨몸 런지', 2.5, 12, null],
  ]);
  expect(localStorage.length, 'acknowledged save clears the draft').toBe(0);
  await waitFor(() =>
    expect(
      progressLoads(ui),
      'previous-record references reload after saving',
    ).toBeGreaterThanOrEqual(2),
  );
});

test('prefilled draft lets the user edit reps and add a non-routine exercise', async () => {
  const ui = mount();
  await openJournal(ui);
  await ui.click('오늘 루틴으로 기록하기');
  ui.change(ui.setRows()[2], '횟수', '8');
  await ui.click('다른 운동 추가');
  const added = ui.setRows()[5];
  expect(added, 'a blank row is added for another exercise').toBeTruthy();
  expect(ui.field(added, '운동명')).toHaveValue('');
  ui.change(added, '운동명', '케이블 크런치');
  ui.change(ui.setRows()[5], '총중량', '35');
  ui.change(ui.setRows()[5], '횟수', '15');
  expect(ui.text(ui.setRows()[5]), 'no routine reference for others').not.toMatch(/오늘 목표/);
  ui.submit();
  await waitFor(() => expect(posts(ui, '/api/workouts')).toHaveLength(1));
  const body = posts(ui, '/api/workouts')[0].body as {
    sets: { exercise: string; weight: number; reps: number }[];
  };
  expect(body.sets).toHaveLength(6);
  expect(body.sets.map((s) => s.reps)).toEqual([10, 10, 8, 12, 12, 15]);
  expect(body.sets[5]).toEqual({
    exercise: '케이블 크런치',
    machine_id: null,
    weight: 35,
    reps: 15,
    notes: '',
    completed: false,
    rpe: null,
  });
  // Let the save flow finish before the test environment is torn down.
  await waitFor(() => expect(ui.text()).toMatch(/서버 저장 완료/));
});

test('rest shows the preview first, applies once on rapid clicks and can be cancelled today', async () => {
  const ui = mount();
  await openJournal(ui);
  await ui.click('오늘 하루 휴식하기');
  const preview = document.querySelector('[aria-label="휴식 전 확인"]');
  expect(preview, 'preview is shown before any change').toBeTruthy();
  expect(ui.text(preview!)).toMatch(/1주차 · 분할 2 · 2024-03-04 → 2024-03-06/);
  expect(ui.text(preview!)).toMatch(/12주차 디로딩 · 분할 2 · 2024-05-22 → 제외됨/);
  expect(ui.text(preview!)).toMatch(/제외될 마지막 목표: 12주차 디로딩 · 분할 2 \(36번째 목표\)/);
  expect(posts(ui, '/api/routines/7/rests'), 'preview sends nothing').toHaveLength(0);
  const pending = ui.holdNextRest();
  const confirm = ui.button('휴식 확정');
  expect(confirm).toBeEnabled();
  // Both clicks are dispatched before React re-renders, like the legacy test's two
  // calls of the same render's onClick: the disabled state cannot block the second
  // one, so only the pending-request guard can.
  act(() => {
    confirm.click();
    confirm.click(); // A second click from the same render before the response.
  });
  pending.resolve();
  await waitFor(() => expect(ui.text()).toMatch(/오늘은 휴식일로 지정했습니다/));
  expect(posts(ui, '/api/routines/7/rests')).toHaveLength(1);
  expect(posts(ui, '/api/routines/7/rests')[0].body).toEqual({ date: today });
  expect(screen.queryAllByRole('button', { name: '오늘 루틴으로 기록하기' })).toHaveLength(0);
  const excludedRow = () =>
    [...document.querySelectorAll('li')].filter((e) => e.className === 'excluded');
  expect(excludedRow()).toHaveLength(1);
  expect(ui.text(excludedRow()[0])).toMatch(/제외됨 · 분할 2/);
  await ui.click('휴식 취소');
  await waitFor(() => expect(posts(ui, `/api/routines/7/rests/${today}`)).toHaveLength(1));
  await waitFor(() => expect(ui.text()).toMatch(/스쿼트 3세트 · 총중량 102\.75 kg · 10회/));
  expect(excludedRow()).toHaveLength(0);
  expect(posts(ui, '/api/workouts'), 'rest never writes journals').toHaveLength(0);
});

test('auto routine targets show firm values today and label future sessions as projected', async () => {
  // Auto fixture starts Monday 2024-03-04, so today is its first session.
  const ui = mount({ plan: routineSchema.parse(autoRoutineInput()) as RoutinePlan });
  await openJournal(ui);
  const content = ui.text(card()!);
  expect(content).toMatch(/자동 목표/);
  expect(content, "today's session label").toMatch(/1주차 1번째 · 전신/);
  expect(content).toMatch(/벤치프레스 3세트 · 총중량 100 kg · 10회/);
  const todayList = [...document.querySelectorAll('ul')].filter(
    (e) => e.className === 'target-list',
  )[0];
  expect(ui.text(todayList), "today's target is not a projection").not.toMatch(/예상/);
  const rows = weekRows();
  expect(ui.text(rows[1])).toMatch(/예상/);
  expect(ui.text(rows[3])).toMatch(/4주차디로딩 · 자동/);
  // Per-session progression: week 5 resumes at 110 kg × 9 after the week-4 deload.
  expect(ui.text(rows[4])).toMatch(/1번째 · 전신 · 벤치프레스 3세트 · 총중량 110 kg · 9회/);
  expect(ui.text(rows[0])).toMatch(/3번째 · 전신 · 벤치프레스 3세트 · 총중량 100 kg · 12회/);
  await ui.click('오늘 루틴으로 기록하기');
  expect(ui.setRows(), '3 exercises × 3 sets').toHaveLength(9);
  expect(Number(ui.field(ui.setRows()[0], '총중량').value)).toBe(100);
});
