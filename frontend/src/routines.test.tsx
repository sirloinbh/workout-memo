import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { autoRoutineInput, routineInput } from '../../backend/test/routine-fixture';
import { App } from './app';
import { bodyPartLabel } from './labels';
import { deferred, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/routines-ui.test.ts (vm hook harness) to a real DOM.
// Like the legacy harness, forms are submitted with fireEvent.submit, which skips
// native constraint validation (required fields) exactly as calling onSubmit did.
type Plan = ReturnType<typeof routineInput>;

function mount(failPost = false, failReadAfterPost = false, initialPlan: Plan = routineInput()) {
  vi.stubGlobal('confirm', () => true);
  let saved = { ...structuredClone(initialPlan), id: 27, schedule: [] };
  const api = mockApi(({ method, url, body }) => {
    const pathname = url.pathname;
    if (
      failReadAfterPost &&
      pathname === '/api/routines/27' &&
      api.requests.some((r) => r.method === 'POST')
    )
      return json({ error: 'Lookup after save failed' }, 503);
    if (pathname === '/api/routines' && method === 'POST') {
      if (failPost) return json({ error: 'Check the rest weekdays and workouts per week' }, 400);
      saved = { ...(body as Plan), id: 27, schedule: [] };
      return json({ id: 27 }, 201);
    }
    if (pathname === '/api/machines') return [{ id: 5, brand: 'Hammer', name: 'Leg Press' }];
    const data =
      pathname === '/api/routines' ? [saved] : pathname === '/api/routines/27' ? saved : [];
    return structuredClone(data);
  });
  const user = userEvent.setup();
  render(<App />);
  const requests = api.requests;
  const text = (el: Element = document.body) => el.textContent ?? '';
  const labels = (label: string) =>
    [...document.querySelectorAll('label')].filter((el) => text(el).trim().startsWith(label));
  async function click(label: string) {
    const button = (await screen.findAllByRole('button', { name: label }))[0];
    expect(button, `User can access ${label}`).toBeEnabled();
    await user.click(button);
  }
  async function change(label: string, value: string, index = 0, checked?: boolean) {
    const item = labels(label)[index];
    expect(item, `Input label ${label} #${index} exists`).toBeTruthy();
    // #102: rest days use the common Checkbox, a button with role="checkbox".
    const box = item.querySelector<HTMLElement>('[role="checkbox"]');
    if (box) {
      if ((box.getAttribute('aria-checked') === 'true') !== checked) await user.click(box);
      expect(box).toHaveAttribute('aria-checked', String(checked));
      return;
    }
    const input = item.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
    expect(input).toBeTruthy();
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      if (input.checked !== checked) await user.click(input);
      expect(input.checked).toBe(checked);
    } else fireEvent.change(input, { target: { value } });
  }
  const form = () => document.querySelectorAll('form');
  function submit() {
    expect(form()[0]).toBeTruthy();
    fireEvent.submit(form()[0]);
  }
  // #105: the form has four steps. A submit before the last one moves on.
  const heading = () => screen.getByRole('heading', { name: /^Step \d of 4/ });
  function next() {
    const before = heading().textContent;
    submit();
    expect(heading().textContent, 'Next moves to the following step').not.toBe(before);
  }
  async function toStep(n: number) {
    while (Number(/^Step (\d)/.exec(heading().textContent)![1]) < n) next();
    while (Number(/^Step (\d)/.exec(heading().textContent)![1]) > n) await click('Previous');
  }
  // Saving right after reaching the last step is ignored as a double tap on Next.
  async function save() {
    await new Promise((resolve) => setTimeout(resolve, 450));
    submit();
  }
  const nonGet = () => requests.filter((r) => r.method !== 'GET');
  return {
    requests,
    user,
    text,
    labels,
    click,
    change,
    submit,
    form,
    nonGet,
    heading,
    next,
    toStep,
    save,
  };
}
async function openRoutines() {
  await openPage('Routine Builder');
  await screen.findByRole('button', { name: 'Create new routine' });
}
// #88: new routines start in cycle mode with default body parts. Tests of the weekday
// form switch the mode (step 2) and clear the prefilled parts of split 1 (step 3).
async function clearParts() {
  while (screen.queryByRole('button', { name: 'Delete split 1 body part 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete split 1 body part 1' }));
}
async function weekdaySchedule(ui: ReturnType<typeof mount>) {
  await ui.change('Workout schedule type', 'weekday');
  await ui.change('Workouts per week', '3');
  for (const day of ['Sun', 'Tue', 'Thu', 'Sat']) await ui.change(day, '', 0, true);
}
// The UI offers 이두·삼두 instead of the legacy 팔 (#88).
const offered = (parts: string[]) => parts.map((p) => (p === '팔' ? '이두' : p));
// A save is finished once the form has left its saving state.
const saveSettled = () =>
  waitFor(() => expect(screen.getByRole('button', { name: 'Create new routine' })).toBeEnabled());

test('routine screen re-queries saved plans and displays all 12 manual weeks with distinct deloads', async () => {
  const ui = mount();
  await openRoutines();
  expect(ui.requests.some((r) => r.path === '/api/routines' && r.method === 'GET')).toBe(true);
  await waitFor(() => expect(ui.text()).toMatch(/Manual 12-week routine/));
  // The list may show the complete plan or expose a detail button.
  const detail = screen.queryAllByRole('button', { name: 'View plan' })[0];
  if (detail) {
    await ui.user.click(detail);
    await waitFor(() => expect(document.querySelector('article')).not.toBeNull());
  }
  for (let week = 1; week <= 12; week++)
    expect(ui.text()).toMatch(new RegExp(`Week ${week}(?!\\d)`));
  for (const week of [4, 8, 12]) {
    const row = [...document.querySelectorAll('tr, li, article, section')].filter(
      (el) =>
        new RegExp(`Week ${week}(?!\\d)`).test(ui.text(el)) &&
        /Deload/.test(ui.text(el)) &&
        !/(?:^|\D)Week 1(?!\d)/.test(ui.text(el)),
    );
    expect(row.length, `Week ${week} has its own deload label`).toBeGreaterThan(0);
  }
  expect(ui.text()).toMatch(/7\.25/);
  expect(ui.text()).toMatch(/100\.25/);
  for (const part of ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'])
    expect(ui.text()).toContain(bodyPartLabel(part));
  expect(
    (ui.text().match(/Chest/g) ?? []).length,
    'Repeated body parts remain visible',
  ).toBeGreaterThanOrEqual(3);
  expect(ui.nonGet(), 'Viewing a plan must not create workouts or achievement goals').toHaveLength(
    0,
  );
  // A fresh mount has no component state and must recover the same server plan.
  cleanup();
  const reopened = mount();
  await openRoutines();
  await waitFor(() => expect(reopened.text()).toMatch(/Manual 12-week routine/));
});

for (const failRead of [false, true]) {
  test(`routine form saves explicit schedule, duplicate parts, baselines and every manual week; follow-up read failure=${failRead}`, async () => {
    const ui = mount(false, failRead);
    const expected = routineInput(1);
    expected.name = 'New routine 27';
    expected.weeks[7] = { week: 8, kind: 'deload', amount: 1, deload_metric: 'sets' };
    expected.weeks[11] = { week: 12, kind: 'deload', amount: 3, deload_metric: 'reps' };
    expected.splits[0].body_parts = offered(expected.splits[0].body_parts);
    await openRoutines();
    await ui.click('Create new routine');
    // #28 rule change: new routines default to automatic targets; this test covers manual mode.
    await ui.change('Weekly goal mode', 'manual');
    await ui.change('Routine name', expected.name);
    await ui.change('Start date', expected.start_date);
    ui.next();
    await weekdaySchedule(ui);
    ui.next();
    await clearParts();
    for (const part of expected.splits[0].body_parts) await ui.click(`Add ${bodyPartLabel(part)}`);
    await ui.click('Add exercise');
    for (const [i, ex] of expected.splits[0].exercises.entries()) {
      await ui.change('Exercise name', ex.exercise, i);
      await ui.change('Reference sets', String(ex.sets), i);
      await ui.change(
        'Reference total weight (kg, including machine base weight)',
        String(ex.weight),
        i,
      );
      await ui.change('Reference reps', String(ex.reps), i);
    }
    ui.next();
    expect(ui.heading()).toHaveTextContent('Step 4 of 4 · Weekly goals');
    // Select inputs contain option text, so select the control within its week fieldset.
    for (const w of expected.weeks) {
      const field = [...document.querySelectorAll('fieldset')].filter((el) =>
        ui.text(el).startsWith(`Week ${w.week}`),
      )[0];
      expect(field).toBeTruthy();
      fireEvent.change(field.querySelector('select')!, {
        target: { value: w.deload_metric ?? w.kind },
      });
      await ui.change(
        w.kind === 'deload' ? 'Decrease amount' : 'Increase amount',
        String(w.amount),
        w.kind === 'deload' ? w.week / 4 - 1 : w.week - 1 - Math.floor(w.week / 4),
      );
    }
    await ui.save();
    await saveSettled();
    const post = ui.requests.find((r) => r.method === 'POST');
    expect(post).toBeTruthy();
    // #28: the form now states the mode explicitly; manual plans keep every manual week.
    expect(post!.body).toEqual({ ...expected, progression: 'manual', schedule_mode: 'weekday' });
    expect(ui.requests.some((r) => r.path === '/api/routines/27')).toBe(true);
    if (failRead) await waitFor(() => expect(ui.text()).toMatch(/Lookup after save failed/));
    expect(ui.text()).toMatch(/7\.25/);
    expect(ui.text()).toMatch(/100\.25/);
    expect(ui.text()).toMatch(/Week 12 · Deload/);
    expect(ui.form(), 'Successful save closes the draft').toHaveLength(0);
    expect(ui.nonGet()).toHaveLength(1);
    expect(ui.text()).toMatch(/Routine #27 saved/);
    expect(
      screen.getAllByRole('status').some((el) => /Routine #27 saved/.test(el.textContent)),
    ).toBe(true);
    if (failRead) expect(ui.text()).toMatch(/Lookup after save failed/);
    else {
      // Use the actual posted plan, not the default fixture, in a new component session.
      cleanup();
      const reopened = mount(false, false, post!.body as Plan);
      await openRoutines();
      await reopened.click('View plan');
      await waitFor(() => expect(reopened.text()).toMatch(/New routine 27/));
      expect(reopened.requests.some((r) => r.path === '/api/routines/27')).toBe(true);
      expect(reopened.text()).toMatch(/No split · Start date 2024-02-29 · 3 workouts\/week/);
      expect(reopened.text()).toContain(
        expected.splits[0].body_parts.map(bodyPartLabel).join(' → '),
      );
      expect(reopened.text()).toMatch(/Week 5 · Total weight kg \+7\.25/);
      expect(reopened.text()).toMatch(/Week 8 · Deload · Sets -1/);
      expect(reopened.text()).toMatch(/Week 12 · Deload · Reps -3/);
      expect(reopened.nonGet()).toHaveLength(0);
    }
  });
}

test('routine editor exposes all five splits and keeps a failed save available for correction', async () => {
  const ui = mount(true);
  await openRoutines();
  await ui.click('Create new routine');
  await ui.change('Routine name', 'Preserved after failure');
  ui.next();
  for (const n of [1, 2, 3, 4, 5]) {
    await ui.change('Split type', String(n));
    ui.next();
    expect(
      [...document.querySelectorAll('label')].filter((el) => ui.text(el).trim() === 'Split name'),
    ).toHaveLength(n);
    await ui.click('Previous');
  }
  ui.next();
  // #88: the 5-day split fills split 1 with Chest (가슴); the clicks add two more occurrences.
  await ui.click('Add Chest');
  await ui.click('Add Chest');
  ui.next();
  await ui.save();
  await waitFor(() => expect(ui.text()).toMatch(/Check the rest weekdays and workouts per week/));
  // #102: the failure is an AlertBanner, announced at once. #105: inside the form, on step 4.
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Check the rest weekdays and workouts per week',
  );
  expect(ui.form()[0]).toContainElement(screen.getByRole('alert'));
  await saveSettled();
  expect(ui.form()).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Save routine' })).toBeEnabled();
  const posted = ui.requests.find((r) => r.method === 'POST')!.body as Plan;
  expect(posted.split_count).toBe(5);
  expect(posted.splits[0].body_parts).toEqual(['가슴', '가슴', '가슴']);
  // #105: earlier steps keep what was entered and are one tap away.
  await ui.click('1. Basics');
  expect(ui.heading()).toHaveTextContent('Step 1 of 4 · Basics');
  expect(screen.getByRole('textbox', { name: 'Routine name' })).toHaveValue(
    'Preserved after failure',
  );
});

test('new routine requires explicit manual amounts and removes only the selected duplicate body part', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('Create new routine');
  await ui.change('Weekly goal mode', 'manual');
  await ui.toStep(4);
  for (let week = 1; week <= 12; week++) {
    const field = [...document.querySelectorAll('fieldset')].filter((el) =>
      ui.text(el).startsWith(`Week ${week}`),
    )[0];
    expect(field).toBeTruthy();
    const amount = field.querySelector('input')!;
    expect(amount.value, `Week ${week} has no automatic change amount`).toBe('');
    if (week % 4 === 0) {
      expect(ui.text(field)).toMatch(/Deload/);
      expect(field.querySelector('select')!.value).toBe('');
    }
  }
  await ui.toStep(3);
  await clearParts();
  await ui.click('Add Chest');
  await ui.click('Add Back');
  await ui.click('Add Chest');
  await ui.click('Delete split 1 body part 1');
  const partList = [...document.querySelectorAll('ol')].filter((el) =>
    ui.text(el).includes('Delete'),
  )[0];
  expect(partList).toBeTruthy();
  expect(
    [...partList.querySelectorAll('li')].map((el) => ui.text(el).replace('Delete', '').trim()),
    'Removing one occurrence preserves the other occurrence and order',
  ).toEqual(['Back', 'Chest']);
  expect(ui.nonGet()).toHaveLength(0);
});

test('new routines default to automatic double progression with a 12-week preview', async () => {
  const expected = { ...autoRoutineInput(), schedule_mode: 'weekday' as const };
  expected.splits[0].body_parts = offered(expected.splits[0].body_parts);
  const ui = mount(false, false, expected as unknown as Plan);
  await openRoutines();
  await ui.click('Create new routine');
  const mode = ui.labels('Weekly goal mode')[0];
  expect(mode, 'the form offers a target mode').toBeTruthy();
  expect(mode.querySelector('select')!.value).toBe('auto');
  expect(ui.text(), 'the rule is explained on screen').toMatch(/Reps go up by 1 each session/);
  await ui.change('Routine name', expected.name);
  await ui.change('Start date', expected.start_date);
  ui.next();
  await weekdaySchedule(ui);
  ui.next();
  await clearParts();
  await ui.change('Split name', expected.splits[0].name);
  for (const part of expected.splits[0].body_parts) await ui.click(`Add ${bodyPartLabel(part)}`);
  await ui.click('Add exercise');
  await ui.click('Add exercise');
  for (const [i, ex] of expected.splits[0].exercises.entries()) {
    const sets = ui.labels('Number of sets')[i];
    expect(sets.querySelector('input'), 'default 3 sets').toHaveValue(3);
    const range = (label: string) => ui.labels(label)[i].querySelector('input');
    expect(range('Lower reps')).toHaveValue(8);
    expect(range('Upper reps')).toHaveValue(12);
    await ui.change('Exercise name', ex.exercise, i);
    await ui.change(
      'Current total weight (kg, including machine base weight)',
      String(ex.weight),
      i,
    );
    await ui.change('Current reps', String(ex.reps), i);
  }
  ui.next();
  expect(ui.heading()).toHaveTextContent('Step 4 of 4 · 12-week preview');
  expect(
    [...document.querySelectorAll('label')].filter((el) =>
      /^(Increase amount|Decrease amount)/.test(ui.text(el).trim()),
    ),
    'no manual per-week amounts in auto mode',
  ).toHaveLength(0);
  const preview = ui.text();
  // #28: targets advance per session of the split (here 3 sessions a week), grouped by week.
  expect(preview).toMatch(
    /Week 1: Session 1 100 kg × 10 reps \(Start\), Session 2 100 kg × 11 reps \(Reps \+1\), Session 3 100 kg × 12 reps \(Reps \+1\)/,
  );
  expect(preview).toMatch(/Week 2: Session 1 105 kg × 8 reps \(Increase \+5 kg\)/);
  expect(preview).toMatch(
    /Week 4 deload: Session 1 100 kg × 8 reps \(Deload\), Session 2 100 kg × 8 reps \(Deload\)/,
  );
  // #86: light weights also go up by the 5 kg default increment.
  expect(preview).toMatch(
    /Week 1: Session 1 40 kg × 12 reps \(Start\), Session 2 45 kg × 8 reps \(Increase \+5 kg\)/,
  );
  expect(preview).toMatch(/Week 12 deload: Session 1 0 kg × 12 reps \(Deload\)/);
  expect(preview, 'the per-session rule is explained').toMatch(/each session \(workout day\)/);
  expect(ui.nonGet(), 'preview sends nothing').toHaveLength(0);
  await ui.save();
  await saveSettled();
  const post = ui.requests.find((r) => r.method === 'POST');
  expect(post).toBeTruthy();
  expect(post!.body).toEqual(expected);
  await waitFor(() => expect(ui.text()).toMatch(/Auto · double progressive overload/));
  expect(ui.text()).toMatch(/Week 5: Session 1 110 kg × 9 reps \(Reps \+1\)/);
});

test('a new routine defaults to a cycle and fills each split count with its cycle and parts (#88)', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('Create new routine');
  await ui.change('Routine name', 'Cycle routine');
  await ui.change('Start date', '2026-10-21');
  ui.next();
  const value = (label: string) =>
    ui.labels(label)[0].querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!.value;
  expect(value('Workout schedule type')).toBe('cycle');
  expect(ui.labels('Rest weekdays')).toHaveLength(0);
  const partsOf = (i: number) =>
    [...document.querySelectorAll('fieldset')]
      .filter((el) => ui.text(el).startsWith(`Split ${i + 1}`))[0]
      .querySelectorAll('ol li');
  const listed = (i: number) =>
    [...partsOf(i)].map((li) => ui.text(li).replace('Delete', '').trim());
  for (const [count, train, rest, parts] of [
    [
      2,
      '2',
      '1',
      [
        ['등', '가슴', '이두', '삼두'],
        ['하체-앞', '하체-뒤', '복근', '어깨'],
      ],
    ],
    [
      3,
      '3',
      '1',
      [
        ['등', '이두'],
        ['하체-앞', '하체-뒤', '복근'],
        ['가슴', '어깨', '삼두'],
      ],
    ],
    [4, '4', '1', [['등'], ['가슴', '이두'], ['하체-앞', '하체-뒤', '복근'], ['어깨', '삼두']]],
    [5, '5', '2', [['가슴'], ['등'], ['하체-앞', '하체-뒤'], ['어깨'], ['이두', '삼두', '복근']]],
  ] as const) {
    await ui.change('Split type', String(count));
    expect(value('Consecutive workout days')).toBe(train);
    expect(value('Consecutive rest days')).toBe(rest);
    ui.next();
    parts.forEach((expected, i) =>
      expect(listed(i), `${count}-day split ${i + 1}`).toEqual(expected.map(bodyPartLabel)),
    );
    await ui.click('Previous');
  }
  await ui.change('Split type', '1');
  ui.next();
  expect(listed(0)).toEqual(
    ['가슴', '등', '어깨', '이두', '삼두', '하체-앞', '하체-뒤', '복근'].map(bodyPartLabel),
  );
  expect(screen.queryByRole('button', { name: 'Add Arms' })).toBeNull();
  // The defaults stay editable and the plan is sent as a cycle.
  await ui.click('Previous');
  await ui.change('Split type', '3');
  await ui.change('Consecutive workout days', '2');
  await ui.toStep(4);
  await ui.save();
  await saveSettled();
  const body = ui.requests.find((r) => r.method === 'POST')!.body as Plan & {
    schedule_mode: string;
    cycle: object;
  };
  expect(body.schedule_mode).toBe('cycle');
  expect(body.cycle).toEqual({ train_days: 2, rest_days: 1 });
  expect(body.rest_days).toEqual([]);
  expect(body.weekly_workouts).toBe(2);
});

test('a routine exercise can name a machine that the plan keeps (#82)', async () => {
  const expected = autoRoutineInput();
  const ui = mount(false, false, expected as unknown as Plan);
  await openRoutines();
  await ui.click('Create new routine');
  await ui.change('Routine name', expected.name);
  await ui.change('Start date', expected.start_date);
  ui.next();
  await weekdaySchedule(ui);
  ui.next();
  await clearParts();
  await ui.change('Split name', expected.splits[0].name);
  await ui.click('Add Chest');
  await ui.click('Add exercise');
  for (const [i, ex] of expected.splits[0].exercises.slice(0, 2).entries()) {
    await ui.change('Exercise name', ex.exercise, i);
    await ui.change(
      'Current total weight (kg, including machine base weight)',
      String(ex.weight),
      i,
    );
    await ui.change('Current reps', String(ex.reps), i);
  }
  await waitFor(() =>
    expect(ui.labels('Machine')[0].querySelector('option[value="5"]')).not.toBeNull(),
  );
  await ui.change('Machine', '5', 0);
  ui.next();
  await ui.save();
  await saveSettled();
  const post = ui.requests.find((r) => r.method === 'POST');
  const exercises = (post!.body as Plan).splits[0].exercises as Record<string, unknown>[];
  expect(exercises[0].machine_id).toBe(5);
  // A free exercise omits the field, keeping the plan shape of older routines.
  expect('machine_id' in exercises[1]).toBe(false);
  await waitFor(() => expect(ui.text()).toMatch(/Benchpress \(Hammer · Leg Press\)/));
});

test('the plan view is a region named by the routine with its deload weeks marked (#102)', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('View plan');
  const view = await screen.findByRole('region', { name: 'Manual 12-week routine' });
  expect(within(view).getByRole('heading', { level: 3 }).textContent).toBe(
    'Manual 12-week routine',
  );
  const weeks = within(view)
    .getByRole('heading', { level: 4, name: 'Goals by week' })
    .closest('section')!;
  expect(
    [...weeks.querySelectorAll('li[data-deload]')].map((li) => li.textContent.split(' · ')[0]),
  ).toEqual(['Week 4', 'Week 8', 'Week 12']);
  expect(
    within(view).getByRole('heading', { level: 4, name: /Workout schedule/ }),
  ).toBeInTheDocument();
});

test('the 12-week preview heading is an h4 under the plan or the step heading (#102, #105)', async () => {
  const ui = mount(false, false, autoRoutineInput() as unknown as Plan);
  await openRoutines();
  await ui.click('View plan');
  const view = await screen.findByRole('region', { name: autoRoutineInput().name });
  const inView = within(view).getByRole('heading', { name: /12-week projected goals/ });
  expect(inView.tagName).toBe('H4');
  expect(view.querySelectorAll('li[data-deload]').length).toBeGreaterThan(0);

  await ui.click('Create new routine');
  await ui.change('Start date', '2026-10-12');
  await ui.toStep(3);
  await ui.change('Exercise name', 'Squat');
  await ui.change('Current total weight (kg, including machine base weight)', '100');
  await ui.change('Current reps', '8');
  ui.next();
  expect(ui.heading().tagName).toBe('H3');
  const inForm = await within(document.querySelector('form')!).findByRole('heading', {
    name: /12-week projected goals/,
  });
  expect(inForm.tagName).toBe('H4');
});

test('the routine form goes forward one checked step at a time and back to any earlier step (#105)', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('Create new routine');
  const steps = screen.getByRole('navigation', { name: 'Routine steps' });
  expect(ui.heading()).toHaveTextContent('Step 1 of 4 · Basics');
  expect(within(steps).getByText('1. Basics')).toHaveAttribute('aria-current', 'step');
  // Later steps are not reachable from the step list, only through Next.
  expect(within(steps).queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
  expect(screen.queryByLabelText('Split type')).toBeNull();
  // Next checks the current step's required fields in the browser first.
  await ui.click('Next');
  expect(ui.heading()).toHaveTextContent('Step 1 of 4');
  expect(screen.getByRole('textbox', { name: 'Routine name' })).toBeInvalid();
  await ui.change('Routine name', 'Steps');
  await ui.change('Start date', '2026-10-21');
  await ui.click('Next');
  expect(ui.heading()).toHaveTextContent('Step 2 of 4 · Schedule');
  // Focus moves to the new step so it is announced.
  expect(ui.heading()).toHaveFocus();
  expect(screen.getByLabelText('Split type')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Routine name' })).toBeNull();
  await ui.click('Next');
  expect(ui.heading()).toHaveTextContent('Step 3 of 4 · Splits and exercises');
  // A new routine's exercise has no name yet, so step 3 holds too.
  await ui.click('Next');
  expect(ui.heading()).toHaveTextContent('Step 3 of 4');
  expect(screen.getByRole('textbox', { name: 'Exercise name' })).toBeInvalid();
  await ui.click('2. Schedule');
  expect(ui.heading()).toHaveTextContent('Step 2 of 4');
  await ui.click('Previous');
  expect(ui.heading()).toHaveTextContent('Step 1 of 4');
  expect(screen.getByRole('textbox', { name: 'Routine name' })).toHaveValue('Steps');
  expect(ui.nonGet()).toHaveLength(0);
  // A new routine starts again at step 1.
  await ui.toStep(3);
  await ui.click('Cancel');
  await ui.click('Create new routine');
  expect(ui.heading()).toHaveTextContent('Step 1 of 4');
});

test('a double tap on Next does not save at once on the last step (#105)', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('Create new routine');
  await ui.toStep(4);
  ui.submit();
  expect(ui.nonGet(), 'a save right after reaching the last step is ignored').toHaveLength(0);
  await ui.save();
  await saveSettled();
  expect(ui.nonGet()).toHaveLength(1);
});

test('opening a saved plan shows its button waiting (#173)', async () => {
  const ui = mount();
  const read = deferred();
  const fetch = vi.mocked(globalThis.fetch);
  const real = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/api/routines/27')) await read.promise;
    return real(input, init);
  });
  await openRoutines();
  await ui.click('View plan');
  const button = screen.getByRole('button', { name: 'View plan' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  // A draft opened now would be closed by the arriving plan.
  expect(screen.getByRole('button', { name: 'Create new routine' })).toBeDisabled();
  read.resolve();
  await screen.findByRole('region', { name: 'Manual 12-week routine' });
  expect(screen.getByRole('button', { name: 'View plan' })).toBeEnabled();
});
