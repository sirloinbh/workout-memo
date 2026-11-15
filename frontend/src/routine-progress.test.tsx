import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { type RoutinePlan, routineSchema } from '../../backend/src/domain';
import { routineProgress } from '../../backend/src/progress';
import { autoRoutineInput, routineInput } from '../../backend/test/routine-fixture';
import { App } from './app';
import { deferred, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/routine-progress-ui.test.ts (vm hook harness) to a real
// DOM. The server is simulated with the real progress functions so previews match
// applied results.
const plan = routineSchema.parse(routineInput(2));
const today = '2024-03-04'; // Monday, the second training slot: split 2, week 1.

function mount(options: { routine?: boolean; plan?: RoutinePlan; failProgress?: boolean } = {}) {
  let progressFails = options.failProgress ?? false;
  vi.stubGlobal('confirm', () => true);
  let rests: string[] = [];
  let holdRest: Promise<void> | undefined;
  const serverProgress = () =>
    options.routine === false
      ? { today, routine: null }
      : {
          routine: { id: 7, name: 'Manual 12-week routine', splits: 2 },
          ...routineProgress(options.plan ?? plan, rests, today),
          previous: {
            squat: {
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
    if (pathname === '/api/routine-progress') {
      if (progressFails) {
        return json({ error: 'Could not load routine goals' }, 500);
      }
      return serverProgress();
    }
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
  const setRows = () => [...document.querySelectorAll('[data-slot=set-row]')];
  function field(row: Element, label: string) {
    const item = [...row.querySelectorAll('label')].filter((e) =>
      text(e).trim().startsWith(label),
    )[0];
    expect(item, `set field ${label}`).toBeTruthy();
    // #105: weight and reps sit beside their label (with − / + buttons), linked by htmlFor.
    return (item.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ??
      document.getElementById(item.htmlFor)) as HTMLInputElement;
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
    recoverProgress() {
      progressFails = false;
    },
    holdNextRest() {
      const gate = deferred();
      holdRest = gate.promise;
      return gate;
    },
  };
}
type UI = ReturnType<typeof mount>;
const card = () => document.querySelector('[aria-label="Routine goals"]');
const progressLoads = (ui: UI) =>
  ui.requests.filter((r) => r.path === '/api/routine-progress').length;
async function openJournal() {
  await openPage('Workout journal');
  // Wait until the routine goals are loaded (no loading status inside the card).
  await waitFor(() => expect(card()?.textContent).not.toMatch(/Loading routine goals/));
}
const posts = (ui: UI, path: string) =>
  ui.requests.filter((r) => r.method !== 'GET' && r.path === path);
const weekRows = () =>
  [...document.querySelectorAll('tr')].filter((e) => /^Week \d+/.test(e.textContent ?? ''));

test('journal shows per-exercise targets for today, this week and all 12 weeks', async () => {
  const ui = mount();
  await openJournal();
  expect(card(), 'routine goals card is on the journal page').toBeTruthy();
  const content = ui.text(card()!);
  expect(content).toMatch(/Today's goal · 2024-03-04/);
  expect(content).toMatch(/Week 1 · Split 2 · Total weight \+2\.5 kg/);
  expect(content).toMatch(/Squat 3 sets · total weight 102\.75 kg · 10 reps/);
  expect(content).toMatch(/Bodyweight Lunge 2 sets · total weight 2\.5 kg · 12 reps/);
  expect(content).toMatch(/base 3 sets · 100\.25 kg · 10 reps/);
  expect(content).toMatch(/Previous 2024-03-01 · 100 kg × 10 reps, 100 kg × 9 reps/);
  expect(content, 'an exercise without history says so').toMatch(/No previous record/);
  expect(content, 'weights of different exercises are not summed').not.toMatch(/105\.25|\bsum\b/i);
  for (const date of ['2024-03-01', '2024-03-04', '2024-03-06'])
    expect(content).toMatch(new RegExp(date));
  const rows = weekRows();
  expect(rows).toHaveLength(12);
  expect(ui.text(rows[3])).toMatch(/Week 4Deload · Total weight -12\.5 kg/);
  expect(
    ui.requests.filter((r) => r.method !== 'GET'),
    'showing goals never creates a record',
  ).toHaveLength(0);
});

test('returning to the journal reloads routine goals so a routine saved elsewhere appears', async () => {
  const ui = mount();
  await openJournal();
  const before = progressLoads(ui);
  await openPage('Dashboard');
  await openPage('Workout journal');
  await waitFor(() =>
    expect(progressLoads(ui), 'switching pages fetches the active routine again').toBeGreaterThan(
      before,
    ),
  );
});

test('without a started routine the journal shows guidance to create one', async () => {
  const ui = mount({ routine: false });
  await openJournal();
  expect(ui.text()).toMatch(
    /There is no routine in progress\. Create a 12-week routine in Routine Builder/,
  );
  expect(screen.queryAllByRole('button', { name: "Log with today's routine" })).toHaveLength(0);
});

test('prefilled routine draft saves unchanged values with one confirm', async () => {
  const ui = mount();
  await openJournal();
  await ui.click("Log with today's routine");
  const rows = ui.setRows();
  expect(rows, 'one row per planned set: 3 squat + 2 lunge').toHaveLength(5);
  expect(ui.field(rows[0], 'Exercise name')).toHaveValue('Squat');
  expect(Number(ui.field(rows[0], 'Total weight').value)).toBe(102.75);
  expect(Number(ui.field(rows[0], 'Reps').value)).toBe(10);
  expect(ui.field(rows[0], 'Machine').value, 'machine stays unselected').toBe('');
  expect(ui.field(rows[4], 'Exercise name')).toHaveValue('Bodyweight Lunge');
  expect(ui.text(rows[0])).toMatch(/Today's goal 102\.75 kg × 10 reps · Previous 2024-03-01/);
  expect(posts(ui, '/api/workouts'), 'the draft is not a record before saving').toHaveLength(0);
  expect(localStorage.length, 'the draft is kept locally like any other draft').toBeGreaterThan(0);
  ui.submit();
  await waitFor(() => expect(ui.text()).toMatch(/Saved to server/));
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
  expect(body.title).toBe('Manual 12-week routine · Split 2');
  // #31: missing `completed` means a legacy completed set, so targets must say false.
  expect(
    body.sets.every((s) => s.completed === false && s.rpe === null),
    'unmarked routine targets are saved as planned sets, not performance',
  ).toBe(true);
  expect(body.sets.map((s) => [s.exercise, s.weight, s.reps, s.machine_id])).toEqual([
    ['Squat', 102.75, 10, null],
    ['Squat', 102.75, 10, null],
    ['Squat', 102.75, 10, null],
    ['Bodyweight Lunge', 2.5, 12, null],
    ['Bodyweight Lunge', 2.5, 12, null],
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
  await openJournal();
  await ui.click("Log with today's routine");
  ui.change(ui.setRows()[2], 'Reps', '8');
  await ui.click('Add another exercise');
  const added = ui.setRows()[5];
  expect(added, 'a blank row is added for another exercise').toBeTruthy();
  expect(ui.field(added, 'Exercise name')).toHaveValue('');
  ui.change(added, 'Exercise name', 'Cable Crunch');
  ui.change(ui.setRows()[5], 'Total weight', '35');
  ui.change(ui.setRows()[5], 'Reps', '15');
  expect(ui.text(ui.setRows()[5]), 'no routine reference for others').not.toMatch(/Today's goal/);
  ui.submit();
  await waitFor(() => expect(posts(ui, '/api/workouts')).toHaveLength(1));
  const body = posts(ui, '/api/workouts')[0].body as {
    sets: { exercise: string; weight: number; reps: number }[];
  };
  expect(body.sets).toHaveLength(6);
  expect(body.sets.map((s) => s.reps)).toEqual([10, 10, 8, 12, 12, 15]);
  expect(body.sets[5]).toEqual({
    exercise: 'Cable Crunch',
    machine_id: null,
    weight: 35,
    reps: 15,
    notes: '',
    completed: false,
    rpe: null,
  });
  // Let the save flow finish before the test environment is torn down.
  await waitFor(() => expect(ui.text()).toMatch(/Saved to server/));
});

test('rest shows the preview first, applies once on rapid clicks and can be cancelled today', async () => {
  const ui = mount();
  await openJournal();
  await ui.click('Rest today');
  const preview = document.querySelector('[aria-label="Confirm before rest"]');
  expect(preview, 'preview is shown before any change').toBeTruthy();
  expect(ui.text(preview!)).toMatch(/Week 1 · Split 2 · 2024-03-04 → 2024-03-06/);
  expect(ui.text(preview!)).toMatch(/Week 12 deload · Split 2 · 2024-05-22 → Excluded/);
  expect(ui.text(preview!)).toMatch(
    /Last goal to be excluded: Week 12 deload · Split 2 \(goal #36\)/,
  );
  expect(posts(ui, '/api/routines/7/rests'), 'preview sends nothing').toHaveLength(0);
  const pending = ui.holdNextRest();
  const confirm = ui.button('Confirm rest');
  expect(confirm).toBeEnabled();
  // Both clicks are dispatched before React re-renders, like the legacy test's two
  // calls of the same render's onClick: the disabled state cannot block the second
  // one, so only the pending-request guard can.
  act(() => {
    confirm.click();
    confirm.click(); // A second click from the same render before the response.
  });
  // #173: the waiting button is disabled and shows a small spinner.
  const busy = await screen.findByRole('button', { name: 'Processing…' });
  expect(busy).toBeDisabled();
  expect(busy.querySelector('[data-slot="spinner"]')).toHaveAttribute('aria-hidden', 'true');
  pending.resolve();
  await waitFor(() => expect(ui.text()).toMatch(/Today is set as a rest day/));
  expect(posts(ui, '/api/routines/7/rests')).toHaveLength(1);
  expect(posts(ui, '/api/routines/7/rests')[0].body).toEqual({ date: today });
  expect(screen.queryAllByRole('button', { name: "Log with today's routine" })).toHaveLength(0);
  const excludedRow = () => [...document.querySelectorAll('li[data-excluded]')];
  expect(excludedRow()).toHaveLength(1);
  expect(ui.text(excludedRow()[0])).toMatch(/Excluded · Split 2/);
  await ui.click('Cancel rest');
  await waitFor(() => expect(posts(ui, `/api/routines/7/rests/${today}`)).toHaveLength(1));
  await waitFor(() =>
    expect(ui.text()).toMatch(/Squat 3 sets · total weight 102\.75 kg · 10 reps/),
  );
  expect(excludedRow()).toHaveLength(0);
  expect(posts(ui, '/api/workouts'), 'rest never writes journals').toHaveLength(0);
});

test('auto routine targets show firm values today and label future sessions as projected', async () => {
  // Auto fixture starts Monday 2024-03-04, so today is its first session.
  const ui = mount({ plan: routineSchema.parse(autoRoutineInput()) });
  await openJournal();
  const content = ui.text(card()!);
  expect(content).toMatch(/Auto goals/);
  expect(content, "today's session label").toMatch(/Week 1 session 1 · Full body/);
  expect(content).toMatch(/Benchpress 3 sets · total weight 100 kg · 10 reps/);
  const todayList = document.querySelector<HTMLElement>('ul[data-slot=target-list]')!;
  expect(ui.text(todayList), "today's target is not a projection").not.toMatch(/Projected/);
  const rows = weekRows();
  expect(ui.text(rows[1])).toMatch(/Projected/);
  expect(ui.text(rows[3])).toMatch(/Week 4Deload · auto/);
  // Per-session progression: week 5 resumes at 110 kg × 9 after the week-4 deload.
  expect(ui.text(rows[4])).toMatch(
    /Session 1 · Full body · Benchpress 3 sets · total weight 110 kg · 9 reps/,
  );
  expect(ui.text(rows[0])).toMatch(
    /Session 3 · Full body · Benchpress 3 sets · total weight 100 kg · 12 reps/,
  );
  await ui.click("Log with today's routine");
  expect(ui.setRows(), '3 exercises × 3 sets').toHaveLength(9);
  expect(Number(ui.field(ui.setRows()[0], 'Total weight').value)).toBe(100);
});

// #101: the card's buttons moved to the common Button; their behaviour stays the same.
test('a failed load shows the error with a reload button that recovers the card', async () => {
  // The server fails until it recovers, however many times the app asks.
  const ui = mount({ failProgress: true });
  await openPage('Workout journal');
  const alert = await screen.findByRole('alert');
  expect(card()!.contains(alert), 'error is inside the routine card').toBe(true);
  expect(ui.text(alert)).toMatch(/Could not load routine goals/);
  // #173: a failed load leaves no endless placeholder beside the error.
  expect(card()!.querySelector('[aria-busy="true"]')).toBeNull();
  const loads = progressLoads(ui);
  ui.recoverProgress();
  await ui.click('Reload routine goals');
  await waitFor(() => expect(progressLoads(ui)).toBe(loads + 1));
  await waitFor(() => expect(ui.text(card()!)).toMatch(/Today's goal · 2024-03-04/));
  expect(card()!.querySelector('[role=alert]')).toBeNull();
  // The 12-week table scrolls sideways on phones, so its box takes keyboard focus.
  const table = card()!.querySelector('[aria-label="12-week goals table"]')!;
  expect(table).toHaveAttribute('tabindex', '0');
  expect(table.querySelectorAll('tbody tr')).toHaveLength(12);
});

test('going back from the rest preview sends nothing and offers rest again', async () => {
  const ui = mount();
  await openJournal();
  await ui.click('Rest today');
  expect(screen.queryByRole('button', { name: 'Rest today' })).toBeNull();
  await ui.click('Go back');
  expect(document.querySelector('[aria-label="Confirm before rest"]')).toBeNull();
  expect(ui.button('Rest today')).toBeEnabled();
  expect(posts(ui, '/api/routines/7/rests')).toHaveLength(0);
});
