import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { App } from './app';
import { type ApiRequest, deferred, deviceNow, fixClock, json, mockApi } from './test/api';

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
  const state = { offline: false, timeout: false, loseResponse: false, conflict: false };
  let records = structuredClone(initial);
  let holdMutation: Promise<void> | undefined;
  let signal: AbortSignal | undefined;
  const api = mockApi(async ({ method, url }) => {
    const requestSignal = signal;
    if (method === 'POST' || method === 'PUT') {
      if (state.offline) throw new TypeError('Failed to fetch');
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
        return json({ error: '다른 기기에서 수정된 기록입니다. 최신 기록을 확인하세요.' }, 409);
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
    user,
    mutations,
    conflict() {
      state.conflict = true;
    },
    offline() {
      state.offline = true;
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

const content = () => document.body.textContent ?? '';
const loaded = () => waitFor(() => expect(screen.queryByText('기록을 불러오는 중…')).toBeNull());
const stat = (label: string) => {
  const card = screen
    .getAllByText(
      (_, el) => el?.classList.contains('stat') === true && el.textContent.startsWith(label),
    )
    .at(0)!;
  return card.querySelector('.stat-value')!.textContent;
};
const dialog = () => screen.getByRole('dialog');
const titleInput = () => dialog().querySelector<HTMLInputElement>('input[maxlength="120"]')!;
const exerciseInputs = () => [
  ...dialog().querySelectorAll<HTMLInputElement>('input[list="exercise-names"]'),
];
const weightInputs = () => [...dialog().querySelectorAll<HTMLInputElement>('input[step="0.25"]')];
const key = (request: ApiRequest) => request.headers['idempotency-key'];
const storageSize = () => localStorage.length;
const storageKeys = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
const recoverButtons = () =>
  screen.queryAllByRole('button').filter((b) => /복구/.test(b.textContent ?? ''));
function matchingButton(label: RegExp) {
  const found = screen.getAllByRole('button').find((b) => label.test(b.textContent ?? ''));
  expect(found, 'button matching ' + label).toBeTruthy();
  return found!;
}

async function fill(ui: UI) {
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: '운동 기록하기' })[0]);
  // #28: the editor starts with three sets; these scenarios save a single valid set.
  for (let i = 0; i < 2; i++)
    await ui.user.click(within(dialog()).getAllByRole('button', { name: '세트 삭제' })[0]);
  expect(exerciseInputs()).toHaveLength(1);
  // #82: the title starts as today's date; these scenarios replace it.
  await ui.user.clear(titleInput());
  await ui.user.type(titleInput(), 'Recovery workout');
  await ui.user.type(exerciseInputs()[0], 'Squat');
  // Number inputs drop partial decimals ("100.") while typing in jsdom; set the value.
  fireEvent.change(weightInputs()[0], { target: { value: '100.25' } });
  await waitFor(() => expect(weightInputs()[0]).toHaveValue(100.25));
}
function submit() {
  fireEvent.submit(dialog().querySelector('form')!);
}
const saveFailed = () => waitFor(() => expect(content()).toMatch(/저장 실패/));
const saved = () => waitFor(() => expect(content()).toMatch(/서버 저장 완료/));

test('refresh offers recovery and restores input without affecting server statistics', async () => {
  const first = mount();
  await fill(first);
  expect(storageSize(), 'input is persisted before submission').toBeGreaterThan(0);
  expect(content()).toMatch(/로컬|초안/);
  expect(stat('완료한 세트')).toBe('0세트');
  const second = mount();
  await loaded();
  await second.user.click(matchingButton(/복구/));
  expect(titleInput()).toHaveValue('Recovery workout');
  expect(exerciseInputs()[0]).toHaveValue('Squat');
  expect(Number(weightInputs()[0].value)).toBe(100.25);
  expect(dialog().querySelector<HTMLInputElement>('input[type="date"][required]')).toHaveValue(
    '2026-10-15',
  );
  expect(second.mutations(), 'recovery never auto-syncs').toHaveLength(0);
});

test('discard prevents another refresh from offering the same draft', async () => {
  await fill(mount());
  const second = mount();
  await loaded();
  await second.user.click(matchingButton(/폐기|버리기/));
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
    await waitFor(() => expect(content()).toMatch(/저장 중/));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ui.mutations(), 'duplicate submit sends one request').toHaveLength(1);
    expect(content()).toMatch(/저장 중/);
    expect(content()).not.toMatch(/저장 완료|저장 성공/);
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
    expect(content()).not.toMatch(/저장 완료|저장 성공/);
    ui.online();
    await ui.user.click(matchingButton(/재시도|다시 저장/));
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
  await second.user.click(matchingButton(/복구/));
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
  expect(content()).toMatch(/저장 공간|로컬 저장|초안.*실패|보관.*실패/);
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
  expect(content()).toMatch(/7일/);
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
  pending.resolve();
  await ui.user.click(matchingButton(/재시도/));
  await waitFor(() => expect(ui.mutations()).toHaveLength(2));
  const [a, b] = ui.mutations();
  expect(key(b)).toBe(key(a));
});

test('a conflicting device edit is visible and keeps the local draft', async () => {
  const ui = mount();
  await fill(ui);
  ui.conflict();
  submit();
  await waitFor(() => expect(content()).toMatch(/다른 기기에서 수정/));
  expect(content()).not.toMatch(/저장 완료|저장 성공/);
  expect(storageSize(), 'conflict keeps local draft').toBeGreaterThan(0);
  expect(stat('완료한 세트')).toBe('0세트');
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
  expect(content()).toMatch(/서버 저장 완료/);
});

test('write quota failure still permits server save and reports the local persistence failure', async () => {
  const ui = mount([], 'write');
  await fill(ui);
  expect(content()).toMatch(/로컬 저장 공간 오류/);
  expect(storageSize()).toBe(0);
  submit();
  await saved();
  expect(ui.mutations()).toHaveLength(1);
  expect(content()).toMatch(/서버 저장 완료/);
});

test('cleanup failure keeps server acknowledgment separate from the local storage warning', async () => {
  const ui = mount([], 'remove');
  await fill(ui);
  submit();
  await saved();
  expect(ui.mutations()).toHaveLength(1);
  expect(content()).toMatch(/서버 저장 완료/);
  expect(content()).toMatch(/정리.*실패|저장 공간 오류/);
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
  await first.user.click(await screen.findByRole('button', { name: '수정' }));
  fireEvent.change(titleInput(), { target: { value: 'Unsaved edit' } });
  const second = mount([{ ...saved, version: 4, title: 'New device edit' }]);
  await loaded();
  await second.user.click(matchingButton(/복구/));
  second.conflict();
  submit();
  await waitFor(() => expect(second.mutations()).toHaveLength(1));
  const [request] = second.mutations();
  expect(request.path).toBe('/api/workouts/71');
  expect((request.body as Workout).version).toBe(3);
  expect((request.body as Workout).title).toBe('Unsaved edit');
  await waitFor(() => expect(content()).toMatch(/다른 기기에서 수정/));
  expect(storageSize(), 'conflicting edit remains recoverable').toBeGreaterThan(0);
});

test('a new journal starts with three empty set rows and keeps the draft flow', async () => {
  const ui = mount();
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: '운동 기록하기' })[0]);
  const names = exerciseInputs();
  expect(names, '#28: the editor starts with 3 sets').toHaveLength(3);
  expect(names.every((e) => e.value === '')).toBe(true);
  expect(weightInputs().every((e) => Number(e.value) === 0)).toBe(true);
  expect(storageSize(), 'the three-row editor is a local draft').toBeGreaterThan(0);
  expect(ui.mutations()).toHaveLength(0);
});
