import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { App } from './app';
import {
  type ApiRequest,
  deferred,
  deviceNow,
  fixClock,
  flushRenders,
  json,
  mockApi,
} from './test/api';
import { getLive } from './test/live';

type Workout = {
  id: number;
  version?: number;
  date: string;
  title: string;
  notes: string;
  sets: { exercise: string; machine_id: null; weight: number | string; reps: number }[];
};
type BrokenStorage = boolean | 'write' | 'remove';

// Ported from backend/test/workout-draft-ui.test.ts (vm hook harness) to a real DOM.
// A "refresh" is an unmount followed by a new render: jsdom localStorage persists
// within a test like the legacy shared storage map and is cleared after each test.
let unmountPrevious: (() => void) | undefined;
afterEach(() => {
  unmountPrevious = undefined;
});
function mount(
  initial: Workout[] = [],
  brokenStorage: BrokenStorage = false,
  insecureOrigin = false,
) {
  unmountPrevious?.();
  fixClock();
  vi.stubGlobal('confirm', () => true);
  if (brokenStorage === true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Error('Storage unavailable');
    });
  if (brokenStorage === true || brokenStorage === 'write')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('Quota exceeded');
    });
  if (brokenStorage === true || brokenStorage === 'remove')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw Error('Storage unavailable');
    });
  if (insecureOrigin) {
    // A phone on local HTTP: no randomUUID, only getRandomValues.
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: real.getRandomValues.bind(real),
    });
  }
  const state = {
    offline: false,
    timeout: false,
    loseResponse: false,
    conflict: false,
    errorPage: 0,
  };
  let records = structuredClone(initial);
  let holdMutation: Promise<void> | undefined;
  let signal: AbortSignal | undefined;
  const api = mockApi(async ({ method, url }) => {
    const requestSignal = signal;
    if (method === 'POST' || method === 'PUT') {
      if (state.offline) throw new TypeError('Failed to fetch');
      if (state.errorPage)
        return new Response(`<html>${state.errorPage}</html>`, {
          status: state.errorPage,
          headers: { 'Content-Type': 'text/html' },
        });
      if (state.timeout) throw new DOMException('Request timed out', 'TimeoutError');
      const pending = holdMutation;
      holdMutation = undefined;
      if (pending)
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(new DOMException('Aborted', 'AbortError'));
          requestSignal?.addEventListener('abort', abort, { once: true });
          pending.then(() => {
            requestSignal?.removeEventListener('abort', abort);
            resolve();
          }, reject);
        });
      if (state.loseResponse) throw new TypeError('Response lost after server commit');
      if (state.conflict)
        return json(
          { error: 'This record was edited on another device. Check the latest record.' },
          409,
        );
      return json({ id: 42, version: 1 }, 201);
    }
    const id = Number(url.pathname.split('/').at(-1));
    if (method === 'DELETE') records = records.filter((w) => w.id !== id);
    if (url.pathname !== '/api/workouts') return [];
    return records
      .filter(
        (w) => w.date >= url.searchParams.get('from')! && w.date <= url.searchParams.get('to')!,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  });
  // The handler cannot see the AbortSignal; capture it synchronously per request so a
  // held mutation rejects as soon as the transport deadline aborts it.
  const inner = api.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return inner(input, init);
  });
  const user = userEvent.setup();
  const view = render(<App />);
  unmountPrevious = view.unmount;
  const mutations = () => api.requests.filter((r) => r.method === 'POST' || r.method === 'PUT');
  return {
    flush: () => flushRenders(api),
    user,
    mutations,
    conflict() {
      state.conflict = true;
    },
    offline() {
      state.offline = true;
    },
    errorPage(status: number) {
      state.errorPage = status;
    },
    timeout() {
      state.timeout = true;
    },
    online() {
      state.offline = false;
      state.timeout = false;
      state.loseResponse = false;
    },
    loseNextResponse() {
      state.loseResponse = true;
    },
    holdNextMutation() {
      const gate = deferred();
      holdMutation = gate.promise;
      return gate;
    },
  };
}
type UI = ReturnType<typeof mount>;

// Text is looked up the way a user reads the screen: by the element that shows it.
const shows = (text: RegExp) => screen.queryAllByText(text);
const loaded = () => waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
const dialog = () =>
  screen.getByRole('region', { name: /New workout record|Edit workout journal/ });
const titleInput = () => dialog().querySelector<HTMLInputElement>('input[maxlength="120"]')!;
const exerciseInputs = () => [
  ...dialog().querySelectorAll<HTMLInputElement>('input[role="combobox"][id$="-exercise"]'),
];
const weightInputs = () =>
  within(dialog()).getAllByRole<HTMLInputElement>('textbox', { name: 'Total weight kg' });
const key = (request: ApiRequest) => request.headers['idempotency-key'];
const storageSize = () => localStorage.length;
const storageKeys = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
const recoverButtons = () =>
  screen.queryAllByRole('button').filter((b) => /Restore/.test(b.textContent ?? ''));
function matchingButton(label: RegExp) {
  const found = screen.getAllByRole('button').find((b) => label.test(b.textContent ?? ''));
  expect(found, 'button matching ' + label).toBeTruthy();
  return found!;
}

async function fill(ui: UI) {
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  // #28: the editor starts with three sets; these scenarios save a single valid set.
  for (let i = 0; i < 2; i++)
    await ui.user.click(within(dialog()).getAllByRole('button', { name: 'Delete set' })[0]);
  expect(exerciseInputs()).toHaveLength(1);
  // #82: the title starts as today's date; these scenarios replace it.
  await ui.user.clear(titleInput());
  await ui.user.type(titleInput(), 'Recovery workout');
  await ui.user.type(exerciseInputs()[0], 'Squat');
  // Set the whole value at once, as a paste would; typing is covered by the NumberInput tests.
  fireEvent.change(weightInputs()[0], { target: { value: '100.25' } });
  await waitFor(() => expect(weightInputs()[0]).toHaveValue('100.25'));
}
function submit() {
  fireEvent.submit(dialog().querySelector('form')!);
}
const saveFailed = () => waitFor(() => expect(shows(/Save failed/).length).toBeGreaterThan(0));
const saved = () => waitFor(() => expect(shows(/Saved to server/).length).toBeGreaterThan(0));

test('refresh offers recovery and restores input without affecting server statistics', async () => {
  const first = mount();
  await fill(first);
  expect(storageSize(), 'input is persisted before submission').toBeGreaterThan(0);
  expect(shows(/Local|draft/).length).toBeGreaterThan(0);
  const second = mount();
  await loaded();
  // #222: the page header's main button waits until the draft is restored or discarded.
  const headers = document.querySelectorAll<HTMLElement>('[data-slot="page-header"]');
  expect(
    within(headers[headers.length - 1]).getByRole('button', { name: 'Log workout' }),
  ).toBeDisabled();
  await second.user.click(matchingButton(/Restore/));
  expect(titleInput()).toHaveValue('Recovery workout');
  expect(exerciseInputs()[0]).toHaveValue('Squat');
  expect(Number(weightInputs()[0].value)).toBe(100.25);
  expect(dialog().querySelector<HTMLInputElement>('input[type="date"][required]')).toHaveValue(
    '2026-10-15',
  );
  expect(second.mutations(), 'recovery never auto-syncs').toHaveLength(0);
  // The draft is no longer waiting, so the header button is enabled again (behind the dialog).
  expect(
    within(headers[headers.length - 1]).getByRole('button', {
      name: 'Log workout',
      hidden: true,
    }),
  ).toBeEnabled();
});

test('discard prevents another refresh from offering the same draft', async () => {
  await fill(mount());
  const second = mount();
  await loaded();
  await second.user.click(matchingButton(/Discard/));
  await waitFor(() => expect(recoverButtons()).toHaveLength(0));
  const third = mount();
  await loaded();
  expect(recoverButtons()).toHaveLength(0);
  expect(third.mutations()).toHaveLength(0);
});

test('pending submission cannot report success or send duplicate requests', async () => {
  const ui = mount();
  await fill(ui);
  const pending = ui.holdNextMutation();
  const form = dialog().querySelector('form')!;
  // Both events are dispatched before React commits, as rapid clicks can be.
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  try {
    await waitFor(() => expect(shows(/Saving/).length).toBeGreaterThan(0));
    await ui.flush();
    expect(ui.mutations(), 'duplicate submit sends one request').toHaveLength(1);
    expect(shows(/Saving/).length).toBeGreaterThan(0);
    expect(shows(/Saved/)).toHaveLength(0);
    expect(storageSize(), 'keep draft until acknowledgment').toBeGreaterThan(0);
  } finally {
    pending.resolve();
    await saved();
  }
});

for (const failure of ['offline', 'timeout'] as const) {
  test(`${failure} failure preserves input and explicit retry reuses its key`, async () => {
    const ui = mount();
    await fill(ui);
    ui[failure]();
    submit();
    await saveFailed();
    expect(ui.mutations()).toHaveLength(1);
    expect(storageSize(), 'offline submission keeps draft').toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Recovery workout')).toBeInTheDocument();
    expect(shows(/Saved/)).toHaveLength(0);
    ui.online();
    await ui.user.click(matchingButton(/Retry|save again/i));
    await waitFor(() => expect(ui.mutations()).toHaveLength(2));
    const [a, b] = ui.mutations();
    expect(key(a), 'mutation has retry key').toBeTruthy();
    expect(key(b)).toBe(key(a));
    expect(b.body).toEqual(a.body);
  });
}

test('editing content after an uncertain save uses a new request key', async () => {
  const ui = mount();
  await fill(ui);
  ui.loseNextResponse();
  submit();
  await saveFailed();
  await waitFor(() => expect(titleInput()).toBeEnabled());
  fireEvent.change(titleInput(), { target: { value: 'Changed workout' } });
  ui.online();
  submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(2));
  const [a, b] = ui.mutations();
  expect(key(a), 'first mutation has a retry key').toBeTruthy();
  expect(key(b), 'changed mutation has a retry key').toBeTruthy();
  expect(key(b)).not.toBe(key(a));
});

test('lost response retains retry key across refresh and acknowledgment clears draft', async () => {
  const first = mount();
  await fill(first);
  first.loseNextResponse();
  submit();
  await saveFailed();
  expect(storageSize(), 'response loss preserves draft').toBeGreaterThan(0);
  const firstKey = key(first.mutations()[0]);
  const second = mount();
  await loaded();
  await second.user.click(matchingButton(/Restore/));
  submit();
  await saved();
  expect(firstKey, 'initial request contains retry key').toBeTruthy();
  expect(key(second.mutations()[0]), 'uncertain outcome reuses persisted key').toBe(firstKey);
  mount();
  await loaded();
  expect(recoverButtons()).toHaveLength(0);
});

test('unavailable storage warns but permits editing and server saving', async () => {
  const ui = mount([], true);
  await fill(ui);
  expect(screen.getByDisplayValue('Recovery workout')).toBeInTheDocument();
  expect(shows(/local storage|draft.*failed/i).length).toBeGreaterThan(0);
  submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
});

test('corrupt draft does not prevent startup or a fresh journal', async () => {
  await fill(mount());
  expect(storageSize(), 'discover actual draft keys by editing').toBeGreaterThan(0);
  for (const k of storageKeys()) localStorage.setItem(k, '{invalid-json');
  await fill(mount());
});

test('a draft at the seven day retention boundary is not offered for recovery', async () => {
  await fill(mount());
  for (const k of storageKeys()) {
    const value = JSON.parse(localStorage.getItem(k)!);
    value.savedAt = Date.parse(deviceNow) - 7 * 86400000;
    localStorage.setItem(k, JSON.stringify(value));
  }
  mount();
  await loaded();
  expect(recoverButtons()).toHaveLength(0);
  expect(shows(/7 days/).length).toBeGreaterThan(0);
  expect(storageSize()).toBe(0);
});

test('structurally corrupt JSON draft does not break the editor', async () => {
  await fill(mount());
  for (const k of storageKeys()) {
    const value = JSON.parse(localStorage.getItem(k)!);
    value.editor.sets = [null];
    localStorage.setItem(k, JSON.stringify(value));
  }
  await fill(mount());
  expect(screen.getByDisplayValue('Recovery workout')).toBeInTheDocument();
});

test('the request deadline aborts pending transport and permits an explicit retry', async () => {
  // Track the app's transport deadline timers (set/cleared through the global timer
  // functions) and fire the outstanding one, as the legacy harness did.
  const deadlines = new Map<unknown, { callback: () => void; delay: number }>();
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    const id = realSetTimeout(callback, delay, ...args);
    if (delay === 15000) deadlines.set(id, { callback, delay });
    return id;
  }) as typeof setTimeout);
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(
    (id?: Parameters<typeof clearTimeout>[0]) => {
      deadlines.delete(id);
      realClearTimeout(id);
    },
  );
  const ui = mount();
  await fill(ui);
  const pending = ui.holdNextMutation();
  submit();
  await waitFor(() => expect(ui.mutations()).toHaveLength(1));
  await waitFor(() => expect(deadlines.size, 'request has a deadline').toBe(1));
  for (const timer of deadlines.values()) {
    expect(timer.delay, 'transport timeout is fifteen seconds').toBe(15000);
    act(() => timer.callback());
  }
  await saveFailed();
  expect(storageSize(), 'aborted request keeps draft').toBeGreaterThan(0);
  expect(shows(/The server did not answer within 15 seconds/).length).toBeGreaterThan(0);
  pending.resolve();
  await ui.user.click(matchingButton(/Retry/));
  await waitFor(() => expect(ui.mutations()).toHaveLength(2));
  const [a, b] = ui.mutations();
  expect(key(b)).toBe(key(a));
});

test('a conflicting device edit is visible and keeps the local draft', async () => {
  const ui = mount();
  await fill(ui);
  ui.conflict();
  submit();
  await waitFor(() => expect(shows(/edited on another device/).length).toBeGreaterThan(0));
  expect(shows(/Saved/)).toHaveLength(0);
  expect(storageSize(), 'conflict keeps local draft').toBeGreaterThan(0);
});

test('a phone on local HTTP can generate a UUID key without randomUUID', async () => {
  const ui = mount([], false, true);
  expect(globalThis.crypto.randomUUID).toBeUndefined();
  await fill(ui);
  submit();
  await saved();
  expect(ui.mutations()).toHaveLength(1);
  expect(key(ui.mutations()[0])).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(shows(/Saved to server/).length).toBeGreaterThan(0);
});

test('write quota failure still permits server save and reports the local persistence failure', async () => {
  const ui = mount([], 'write');
  await fill(ui);
  expect(shows(/Local storage error/).length).toBeGreaterThan(0);
  expect(storageSize()).toBe(0);
  submit();
  await saved();
  expect(ui.mutations()).toHaveLength(1);
  expect(shows(/Saved to server/).length).toBeGreaterThan(0);
});

// #223: the warning is announced at once and the save progress politely, in the common parts.
test('the storage warning is an alert banner and the save state a status line', async () => {
  const ui = mount([], 'write');
  await fill(ui);
  const warning = within(dialog())
    .getAllByRole('alert')
    .find((el) => /Local storage error/.test(el.textContent));
  expect(warning).toHaveAttribute('data-slot', 'alert-banner');
  submit();
  await saved();
  // The editor closes after the save, so the status line is the one above the page.
  const status = getLive('status').closest('[data-slot="notice"]');
  expect(status).toHaveAttribute('data-slot', 'notice');
});

test('a failed save offers Retry save inside its alert banner', async () => {
  const ui = mount();
  await fill(ui);
  ui.offline();
  submit();
  await saveFailed();
  const failure = within(dialog())
    .getAllByRole('alert')
    .find((el) => /Your input stays on screen/.test(el.textContent));
  expect(failure).toHaveAttribute('data-slot', 'alert-banner');
  const retry = within(failure!).getByRole('button', { name: 'Retry save' });
  expect(retry).toHaveAttribute('type', 'button');
  ui.online();
  await ui.user.click(retry);
  await waitFor(() => expect(ui.mutations()).toHaveLength(2));
  await saved();
});

// #109: offline, the user reads why the save failed and that the draft survives a reload.
test('an offline save explains the lost connection and the kept draft instead of "Failed to fetch"', async () => {
  const ui = mount();
  await fill(ui);
  ui.offline();
  submit();
  await saveFailed();
  expect(shows(/Cannot reach the server\. Check your connection\./).length).toBeGreaterThan(0);
  expect(shows(/kept as a draft on this device/).length).toBeGreaterThan(0);
  expect(shows(/Failed to fetch/)).toHaveLength(0);
  // The claim holds: a reload offers the same input back.
  mount();
  await loaded();
  expect(recoverButtons().length).toBeGreaterThan(0);
});

// #109: nginx answers with an HTML 502 page while the API is down or restarting.
test('a proxy error page reads as an unreachable server and keeps the draft', async () => {
  const ui = mount();
  await fill(ui);
  ui.errorPage(502);
  submit();
  await saveFailed();
  expect(shows(/The server is not answering \(HTTP 502\)\./).length).toBeGreaterThan(0);
  expect(shows(/kept as a draft on this device/).length).toBeGreaterThan(0);
  expect(shows(/Unexpected token|JSON/)).toHaveLength(0);
});

test('a non-JSON 4xx page is a request error, not an unreachable server', async () => {
  const ui = mount();
  await fill(ui);
  ui.errorPage(401);
  submit();
  await saveFailed();
  expect(shows(/The request failed \(HTTP 401\)\./).length).toBeGreaterThan(0);
  expect(shows(/not answering|kept as a draft on this device/)).toHaveLength(0);
});

test('an offline save does not promise a draft when local storage failed', async () => {
  const ui = mount([], 'write');
  await fill(ui);
  ui.offline();
  submit();
  await saveFailed();
  expect(shows(/Cannot reach the server/).length).toBeGreaterThan(0);
  expect(shows(/kept as a draft on this device/)).toHaveLength(0);
});

test('cleanup failure keeps server acknowledgment separate from the local storage warning', async () => {
  const ui = mount([], 'remove');
  await fill(ui);
  submit();
  await saved();
  expect(ui.mutations()).toHaveLength(1);
  expect(shows(/Saved to server/).length).toBeGreaterThan(0);
  expect(shows(/clearing.*failed|Local storage error/).length).toBeGreaterThan(0);
  expect(storageSize(), 'failed cleanup leaves the old draft on disk').toBeGreaterThan(0);
});

test('refreshing an edit preserves its original revision so newer device data cannot be overwritten', async () => {
  const saved: Workout = {
    id: 71,
    version: 3,
    date: '2026-10-15',
    title: 'Saved workout',
    notes: '',
    sets: [{ exercise: 'Squat', machine_id: null, weight: '100.25', reps: 10 }],
  };
  const first = mount([saved]);
  await loaded();
  await first.user.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(titleInput(), { target: { value: 'Unsaved edit' } });
  const second = mount([{ ...saved, version: 4, title: 'New device edit' }]);
  await loaded();
  await second.user.click(matchingButton(/Restore/));
  second.conflict();
  submit();
  await waitFor(() => expect(second.mutations()).toHaveLength(1));
  const [request] = second.mutations();
  expect(request.path).toBe('/api/workouts/71');
  expect((request.body as Workout).version).toBe(3);
  expect((request.body as Workout).title).toBe('Unsaved edit');
  await waitFor(() => expect(shows(/edited on another device/).length).toBeGreaterThan(0));
  expect(storageSize(), 'conflicting edit remains recoverable').toBeGreaterThan(0);
});

test('a new journal starts with three empty set rows and keeps the draft flow', async () => {
  const ui = mount();
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const names = exerciseInputs();
  // #28, #531: the editor starts with 3 sets of one exercise, so one name field.
  expect(names).toHaveLength(1);
  expect(names[0].value).toBe('');
  expect(weightInputs(), '#28: the editor starts with 3 sets').toHaveLength(3);
  expect(weightInputs().every((e) => Number(e.value) === 0)).toBe(true);
  expect(storageSize(), 'the three-row editor is a local draft').toBeGreaterThan(0);
  expect(ui.mutations()).toHaveLength(0);
});

// #105: each set is a card with − / + for weight and reps and a number keypad.
test('a set card steps weight by 5 kg and reps by one, with number keypads', async () => {
  const ui = mount();
  await fill(ui);
  const card = dialog().querySelector<HTMLElement>('[data-slot=set-row]')!;
  const weight = within(card).getByRole('textbox', { name: 'Total weight kg' });
  const reps = within(card).getByRole('textbox', { name: 'Reps' });
  expect(weight).toHaveAttribute('inputmode', 'decimal');
  expect(reps).toHaveAttribute('inputmode', 'numeric');
  await ui.user.click(within(card).getByRole('button', { name: 'Increase total weight kg' }));
  expect(weight).toHaveValue('105.25');
  const before = Number((reps as HTMLInputElement).value);
  await ui.user.click(within(card).getByRole('button', { name: 'Decrease reps' }));
  expect(reps).toHaveValue(String(before - 1));
  expect(within(card).getByText('Set 1')).toBeInTheDocument();
  // The stepped value is what the draft keeps.
  await waitFor(() =>
    expect(
      storageKeys()
        .map((k) => localStorage.getItem(k))
        .join(),
    ).toMatch(/"weight":105\.25/),
  );
});

// #105: text weight fields could hand NaN to the draft, which is saved as null and then
// discards the whole draft as corrupt on the next visit.
test('unreadable weight text never reaches the draft, so it can still be recovered', async () => {
  const first = mount();
  await fill(first);
  fireEvent.change(weightInputs()[0], { target: { value: '100.2x' } });
  expect(weightInputs()[0]).toHaveValue('100.25');
  const saved = storageKeys()
    .map((k) => localStorage.getItem(k))
    .join();
  expect(saved).toMatch(/"weight":100\.25/);
  expect(saved).not.toMatch(/"weight":null/);
});
