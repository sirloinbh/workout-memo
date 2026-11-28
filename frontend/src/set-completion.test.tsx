import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { deviceNow, json, mockApi } from './test/api';
import { fakeClock, installFakeTimerHarness, waitForFake as waitFor } from './test/fake-timers';

installFakeTimerHarness();

type SetInput = {
  exercise: string;
  machine_id: null;
  weight: number;
  reps: number;
  notes?: string;
  completed?: boolean;
  rpe?: number | null;
};
type Workout = {
  id: number;
  version?: number;
  date: string;
  title: string;
  notes: string;
  feedback?: string | null;
  sets: SetInput[];
};
const start = Date.parse(deviceNow);

// Ported from backend/test/set-completion-ui.test.ts (vm hook harness) to a real DOM.
// The legacy harness moved a fake clock and re-rendered by hand; here Date and the app's timeouts are
// faked from the first line (test/fake-timers.ts) and the clock is moved with vi.setSystemTime. Real layout is not
// covered, as before.
function mount(initial: Workout[] = [], now = start) {
  // Date and the app's timeouts are faked from the start; every tick is fired by the test.
  fakeClock(now);
  vi.stubGlobal('confirm', () => true);
  const api = mockApi(({ method, url }) => {
    if (method === 'POST' || method === 'PUT') return json({ id: 42, version: 1 }, 201);
    if (url.pathname !== '/api/workouts') return [];
    return structuredClone(
      initial.filter(
        (w) => w.date >= url.searchParams.get('from')! && w.date <= url.searchParams.get('to')!,
      ),
    );
  });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(<App />);
  const mutations = () => api.requests.filter((r) => r.method === 'POST' || r.method === 'PUT');
  return {
    user,
    view,
    mutations,
    sentSets: () => (mutations().at(-1)!.body as { sets: SetInput[] }).sets,
    sentFeedback: () => (mutations().at(-1)!.body as { feedback: string | null }).feedback,
    // Equivalent of the legacy render(): redraw at the current clock without any event.
    redraw: () => view.rerender(<App />),
  };
}
type UI = ReturnType<typeof mount>;
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const loaded = () => waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
async function openNew(ui: UI) {
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  fireEvent.change(document.querySelector('input[maxlength="120"]')!, {
    target: { value: 'Lower body' },
  });
  // Every one of the three starting sets needs a name: the shared contract (#64) checks
  // the whole journal before anything is sent, exactly as the server would.
  for (const name of document.querySelectorAll('input[role="combobox"][id$="-exercise"]'))
    fireEvent.change(name, { target: { value: 'Squat' } });
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Total weight kg' })[0], {
    target: { value: '100' },
  });
  await loaded();
}
const completion = (i = 0) => screen.getAllByRole('button', { name: /Set \d+ done/ })[i];
const pressed = (i = 0) => completion(i).getAttribute('aria-pressed');
// #83: workout feedback replaced the per-set RPE input.
const feedback = (label: string) => screen.getByRole('radio', { name: label });
const content = () => document.body.textContent ?? '';
const stat = (label: string) => {
  const card = screen
    .getAllByText(
      (_, el) => el?.getAttribute('data-slot') === 'stat' && el.textContent.startsWith(label),
    )
    .at(0)!;
  return card.querySelector('[data-slot=stat-value]')!.textContent;
};
async function submit(ui: UI) {
  const before = ui.mutations().length;
  // Like the legacy onSubmit call, this bypasses native constraint validation.
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(() => expect(ui.mutations()).toHaveLength(before + 1));
  await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
}

test('new sets start not completed; completion and undo are sent explicitly', async () => {
  const ui = mount();
  await openNew(ui);
  expect(pressed()).toBe('false');
  await ui.user.click(completion());
  expect(pressed()).toBe('true');
  expect(completion()).toHaveTextContent(/Done/);
  advance(1000);
  await ui.user.click(completion());
  expect(pressed(), 'completion can be undone').toBe('false');
  await ui.user.click(screen.getByRole('button', { name: 'Add set' }));
  await ui.user.click(completion(1));
  advance(1000);
  await submit(ui);
  // A new journal starts with three sets (#28); the added fourth one is planned too.
  expect(
    ui.sentSets().map((s) => [s.completed, s.rpe]),
    'missing RPE is sent as null, never 0',
  ).toEqual([
    [false, null],
    [true, null],
    [false, null],
    [false, null],
  ]);
});

test('a duplicate completion click marks the set done once', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(completion());
  advance(1000);
  await ui.user.click(completion());
  // The same render's handler fires again, as a double tap can before React commits:
  // both clicks are dispatched inside one act(), so React re-renders only afterwards.
  const stale = completion();
  act(() => {
    stale.click();
    // Harness guard: React has not committed yet, so the second click hits the same render.
    expect(stale.getAttribute('aria-pressed')).toBe('false');
    advance(5000);
    stale.click();
  });
  ui.redraw();
  expect(pressed()).toBe('true');
  await ui.user.click(completion());
  expect(pressed()).toBe('false');
});

test('refresh restores the set state from the draft', async () => {
  const first = mount();
  await loaded();
  await openNew(first);
  await first.user.click(completion());
  await first.user.click(feedback('Hard'));
  // Reload: the same localStorage survives, the page is mounted again 45 s later.
  first.view.unmount();
  const second = mount([], start + 45000);
  await loaded();
  await second.user.click(screen.getByRole('button', { name: /Restore/ }));
  await loaded();
  expect(pressed()).toBe('true');
  expect(feedback('Hard')).toHaveAttribute('aria-checked', 'true');
  await submit(second);
  expect(second.sentFeedback()).toBe('hard');
  expect(second.sentSets().map((s) => [s.completed, s.rpe])).toEqual([
    [true, null],
    [false, null],
    [false, null],
  ]);
});

test('pressing the chosen feedback again sends null', async () => {
  const ui = mount();
  await openNew(ui);
  expect(document.querySelector('input[step="0.5"]'), 'no RPE input').toBeNull();
  await ui.user.click(feedback('Medium'));
  expect(feedback('Medium')).toHaveAttribute('aria-checked', 'true');
  await ui.user.click(feedback('Medium'));
  expect(feedback('Medium')).toHaveAttribute('aria-checked', 'false');
  await ui.user.click(feedback('Easy'));
  await ui.user.click(feedback('Hard'));
  expect(feedback('Hard')).toHaveAttribute('aria-checked', 'true');
  expect(feedback('Easy'), 'only one level stays selected').toHaveAttribute(
    'aria-checked',
    'false',
  );
  await ui.user.click(feedback('Hard'));
  await submit(ui);
  expect(ui.sentFeedback(), 'not recorded is null, never a default level').toBeNull();
});

test('not-completed sets are excluded from volume, set count and workout days', async () => {
  mount([
    {
      id: 1,
      date: '2026-10-15',
      title: 'Plan only',
      notes: '',
      sets: [{ exercise: 'Squat', machine_id: null, weight: 200, reps: 10, completed: false }],
    },
    {
      id: 2,
      date: '2026-10-14',
      title: 'Performed',
      notes: '',
      sets: [
        { exercise: 'Squat', machine_id: null, weight: 100, reps: 10, completed: true, rpe: 8 },
        { exercise: 'Squat', machine_id: null, weight: 300, reps: 10, completed: false },
        // Rows saved before completion tracking count as completed.
        { exercise: 'Squat', machine_id: null, weight: 50, reps: 10 },
      ],
    },
  ]);
  await loaded();
  await waitFor(() => expect(stat('Completed sets')).toBe('2 sets'));
  expect(stat('Total volume')).toBe('1,500kg');
  expect(stat('Workout days')).toBe('1 day');
  expect(content()).toMatch(/Incomplete 1/);
});

test('a rapid second tap in a later render does not undo completion', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(completion());
  advance(100);
  // Double click: the second click arrives after React re-rendered.
  await ui.user.click(completion());
  expect(pressed(), 'double click keeps completion').toBe('true');
  advance(1000);
  await ui.user.click(completion());
  expect(pressed(), 'deliberate undo still works').toBe('false');
  await submit(ui);
  expect(ui.sentSets()[0].completed).toBe(false);
});

test('editing a workout saved with RPE keeps its RPE and shows its feedback (#83)', async () => {
  const ui = mount([
    {
      id: 3,
      version: 2,
      date: '2026-10-14',
      title: 'Previous record',
      notes: '',
      feedback: 'easy',
      sets: [
        { exercise: 'Squat', machine_id: null, weight: 100, reps: 10, completed: true, rpe: 8 },
      ],
    },
  ]);
  await loaded();
  await waitFor(() => expect(content()).toMatch(/Effort Easy/));
  await ui.user.click(screen.getByRole('button', { name: 'Edit' }));
  expect(feedback('Easy')).toHaveAttribute('aria-checked', 'true');
  await ui.user.click(feedback('Hard'));
  await submit(ui);
  expect(ui.mutations().at(-1)!.method).toBe('PUT');
  expect(ui.sentFeedback()).toBe('hard');
  expect(ui.sentSets()[0].rpe, 'existing RPE data is preserved').toBe(8);
});

// #382: rows are keyed by a client id, so removing a middle set leaves the others' state with their own set.
test('deleting the second of three sets keeps the third set completed and its undo guard', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(completion(2));
  expect(pressed(2)).toBe('true');
  await ui.user.click(screen.getAllByRole('button', { name: 'Delete set' })[1]);
  expect(screen.getAllByRole('button', { name: /Set \d+ done/ })).toHaveLength(2);
  expect(pressed(0)).toBe('false');
  expect(pressed(1), 'the former third set is still completed').toBe('true');
  // The quick second tap right after completing is a double tap: the guard follows the set, not the index.
  await ui.user.click(completion(1));
  expect(pressed(1), 'a repeat tap does not undo it').toBe('true');
});
