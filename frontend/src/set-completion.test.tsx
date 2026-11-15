import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { deviceNow, fixClock, json, mockApi } from './test/api';

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
// The legacy harness moved a fake clock and re-rendered by hand; here only Date is
// faked (fixClock) and the clock is moved with vi.setSystemTime. Real layout is not
// covered, as before.
function mount(initial: Workout[] = [], now = start) {
  fixClock(new Date(now).toISOString());
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
  const user = userEvent.setup();
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
    // Returning to a background tab: no tick ran meanwhile, only the clock moved.
    returnToTab(ms: number) {
      advance(ms);
      fireEvent(window, new Event('visibilitychange'));
      fireEvent.focus(window);
    },
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
const autoStart = () => screen.getByRole('switch', { name: 'Auto-start when a set is done' });
const duration = () => screen.getByRole('spinbutton', { name: 'Rest time (sec)' });
// #83: workout feedback replaced the per-set RPE input.
const feedback = (label: string) => screen.getByRole('button', { name: label });
const timer = () => document.querySelector('[data-slot=rest-timer]')?.textContent ?? '';
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

test('auto-start is opt-in and a duplicate completion click starts one rest', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(completion());
  expect(timer()).toMatch(/1:30/);
  expect(timer(), 'auto-start is off by default').not.toMatch(/left/);
  advance(1000);
  await ui.user.click(completion());
  await ui.user.click(autoStart());
  expect(autoStart()).toBeChecked();
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
  expect(timer(), 'second click neither toggles nor restarts the rest').toMatch(/1:25 left/);
  await ui.user.click(completion());
  expect(pressed()).toBe('false');
  expect(timer(), 'undoing completion does not restart the rest').toMatch(/1:25 left/);
});

test('rest timer can be set, started, paused, resumed and cancelled', async () => {
  const ui = mount();
  await openNew(ui);
  fireEvent.change(duration(), { target: { value: '60' } });
  expect(timer()).toMatch(/1:00/);
  fireEvent.change(duration(), { target: { value: '3' } });
  expect(timer(), 'durations under 5 seconds are ignored').toMatch(/1:00/);
  // From here the app's own redraw timeout is faked too, so a foreground tick can be
  // fired deterministically (the legacy tick()) while keeping the same clock.
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: Date.now() });
  // user-event waits on setTimeout, so clicks below are dispatched with fireEvent.
  fireEvent.click(screen.getByRole('button', { name: 'Start rest' }));
  // A foreground tick: the clock moves and the due redraw timeout fires once.
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(timer()).toMatch(/0:59 left/);
  advance(9000);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(timer()).toMatch(/0:50 paused/);
  ui.returnToTab(120000);
  expect(timer(), 'paused rest does not run').toMatch(/0:50 paused/);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  advance(20000);
  ui.redraw();
  expect(timer()).toMatch(/0:30 left/);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel rest' }));
  expect(timer()).toMatch(/1:00/);
  expect(timer()).not.toMatch(/left|paused/);
});

test('returning from the background shows time left from the end timestamp', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(screen.getByRole('button', { name: 'Start rest' }));
  ui.returnToTab(30000);
  expect(timer()).toMatch(/1:00 left/);
  ui.returnToTab(59999);
  expect(timer(), 'rounds up until the real end').toMatch(/0:01 left/);
  ui.returnToTab(1);
  expect(timer()).toMatch(/Rest over/);
  ui.returnToTab(3600000);
  expect(timer()).toMatch(/Rest over/);
  expect(timer(), 'never shows negative time').not.toMatch(/-/);
});

test('refresh restores timer from its end time and set state from the draft', async () => {
  const first = mount();
  await openNew(first);
  await first.user.click(autoStart());
  await first.user.click(completion());
  await first.user.click(feedback('Hard'));
  // Reload: the same localStorage survives, the page is mounted again 45 s later.
  first.view.unmount();
  const second = mount([], start + 45000);
  await loaded();
  expect(timer()).toMatch(/0:45 left/);
  await second.user.click(screen.getByRole('button', { name: /Restore/ }));
  await loaded();
  expect(pressed()).toBe('true');
  expect(feedback('Hard')).toHaveAttribute('aria-pressed', 'true');
  expect(autoStart(), 'auto-start preference persists').toBeChecked();
  await submit(second);
  expect(second.sentFeedback()).toBe('hard');
  expect(second.sentSets().map((s) => [s.completed, s.rpe])).toEqual([
    [true, null],
    [false, null],
    [false, null],
  ]);
});

test('pressing the chosen feedback again sends null, and corrupt timer storage does not block startup', async () => {
  localStorage.setItem('workout-memo:rest-timer:v1', '{broken');
  const ui = mount();
  await openNew(ui);
  expect(timer()).toMatch(/1:30/);
  expect(document.querySelector('input[step="0.5"]'), 'no RPE input').toBeNull();
  await ui.user.click(feedback('Medium'));
  expect(feedback('Medium')).toHaveAttribute('aria-pressed', 'true');
  await ui.user.click(feedback('Medium'));
  expect(feedback('Medium')).toHaveAttribute('aria-pressed', 'false');
  await ui.user.click(feedback('Easy'));
  await ui.user.click(feedback('Hard'));
  expect(feedback('Hard')).toHaveAttribute('aria-pressed', 'true');
  expect(feedback('Easy'), 'only one level stays selected').toHaveAttribute(
    'aria-pressed',
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

test('a rapid second tap in a later render does not undo completion or touch the rest', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(autoStart());
  await ui.user.click(completion());
  advance(100);
  // Double click: the second click arrives after React re-rendered.
  await ui.user.click(completion());
  expect(pressed(), 'double click keeps completion').toBe('true');
  expect(timer(), 'rest started once and keeps running').toMatch(/1:30 left/);
  advance(1000);
  await ui.user.click(completion());
  expect(pressed(), 'deliberate undo still works').toBe('false');
  expect(timer(), 'undo does not cancel the rest').toMatch(/1:29 left/);
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
  expect(feedback('Easy')).toHaveAttribute('aria-pressed', 'true');
  await ui.user.click(feedback('Hard'));
  await submit(ui);
  expect(ui.mutations().at(-1)!.method).toBe('PUT');
  expect(ui.sentFeedback()).toBe('hard');
  expect(ui.sentSets()[0].rpe, 'existing RPE data is preserved').toBe(8);
});

// #105: one short vibration when a rest ends while the app is open, never for a rest that
// ended long ago (a reload or a long background stay), and never twice for the same end.
test('a rest that ends while the app is open vibrates once, a long-past end stays silent', async () => {
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  try {
    const ui = mount();
    await openNew(ui);
    await ui.user.click(screen.getByRole('button', { name: 'Start rest' }));
    ui.returnToTab(89000);
    expect(vibrate).not.toHaveBeenCalled();
    ui.returnToTab(2000);
    expect(timer()).toMatch(/Rest over/);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    ui.returnToTab(1000);
    expect(vibrate, 'the same end alerts once').toHaveBeenCalledTimes(1);
    // A new rest that ends while the tab sat in the background for a minute after it.
    await ui.user.click(screen.getByRole('button', { name: 'Start rest' }));
    ui.returnToTab(90000 + 60000);
    expect(timer()).toMatch(/Rest over/);
    expect(vibrate, 'an end found a minute late is silent').toHaveBeenCalledTimes(1);
  } finally {
    delete (navigator as Partial<Navigator>).vibrate;
  }
});

// #105: the countdown bar is pinned at the top of the editor; its settings scroll away.
test('the rest countdown is a pinned bar apart from the rest settings', async () => {
  const ui = mount();
  await openNew(ui);
  const bar = document.querySelector<HTMLElement>('[data-slot=rest-timer]')!;
  expect(bar.parentElement).toHaveClass('sticky', 'top-0');
  expect(bar).toContainElement(screen.getByRole('timer'));
  expect(bar).toContainElement(screen.getByRole('button', { name: 'Start rest' }));
  expect(bar).not.toContainElement(duration());
  expect(document.querySelector('[data-slot=rest-settings]')).toContainElement(duration());
});

// #105: pages with their own component (Routine Builder etc.) show the running rest first, so it
// can stick at the top instead of sitting under the whole page.
test('a running rest comes first on a page drawn by its own component', async () => {
  const ui = mount();
  await openNew(ui);
  await ui.user.click(screen.getByRole('button', { name: 'Start rest' }));
  await ui.user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await ui.user.click(screen.getAllByRole('link', { name: 'Routine Builder' })[0]);
  const page = document.querySelector('.legacy')!;
  await waitFor(() => expect(page.querySelector('[data-slot=rest-timer]')).not.toBeNull());
  expect(page.firstElementChild).toContainElement(
    page.querySelector<HTMLElement>('[data-slot=rest-timer]'),
  );
  expect(page.firstElementChild).toHaveClass('sticky');
});
