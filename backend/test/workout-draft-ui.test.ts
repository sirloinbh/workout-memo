import { test } from 'node:test';
import { randomUUID, randomFillSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the existing entry point without a DOM or new test dependencies.
// This small hook/element adapter tests rendered values and event handlers;
// browser layout, focus, and React scheduling still need browser verification.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
type Workout = {
  id: number;
  version?: number;
  date: string;
  title: string;
  notes: string;
  sets: { exercise: string; machine_id: null; weight: number | string; reps: number }[];
};
const source = ts.transpileModule(
  readFileSync(new URL('../../frontend/src/main.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  },
).outputText;

function mount(
  initial: Workout[] = [],
  storage = new Map<string, string>(),
  brokenStorage: boolean | 'write' | 'remove' = false,
  insecureOrigin = false,
) {
  let failMutation = false;
  let timeoutMutation = false;
  let loseResponse = false;
  let conflict = false;
  const timers = new Map<ReturnType<typeof setTimeout>, { callback: () => void; delay: number }>();
  const mutations: { path: string; headers?: Record<string, string>; body?: string }[] = [];
  const localStorage = {
    get length() {
      return storage.size;
    },
    key(index: number) {
      return [...storage.keys()][index] ?? null;
    },
    getItem(key: string) {
      if (brokenStorage === true) throw Error('Storage unavailable');
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (brokenStorage === true || brokenStorage === 'write') throw Error('Quota exceeded');
      storage.set(key, value);
    },
    removeItem(key: string) {
      if (brokenStorage === true || brokenStorage === 'remove') throw Error('Storage unavailable');
      storage.delete(key);
    },
  };
  let records = structuredClone(initial);
  const requests: string[] = [];
  let nextWorkoutResponse: Promise<void> | undefined;
  let nextMutationResponse: Promise<void> | undefined;
  const slots: { value?: unknown; deps?: unknown[] }[] = [];
  let cursor = 0;
  let root: Element;
  let tree: View;
  let effects: (() => unknown)[] = [];
  const changed = (a: unknown[] | undefined, b: unknown[]) =>
    !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    createElement(type: Element['type'], props: Props | null, ...children: View[]): Element {
      return { type, props: { ...props, children } };
    },
    Fragment: 'fragment',
    useRef(initialValue: unknown) {
      const index = cursor++;
      slots[index] ??= { value: { current: initialValue } };
      return slots[index].value;
    },
    useState(initialValue: unknown) {
      const index = cursor++;
      slots[index] ??= {
        value: typeof initialValue === 'function' ? initialValue() : initialValue,
      };
      return [
        slots[index].value,
        (value: unknown) => {
          slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
        },
      ];
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    useEffect(fn: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) effects.push(fn);
      slots[index] = { deps };
    },
  };
  function expand(view: View): View {
    if (Array.isArray(view)) return view.map(expand);
    if (!view || typeof view !== 'object') return view;
    if (typeof view.type === 'function') return expand(view.type(view.props));
    return { ...view, props: { ...view.props, children: expand(view.props.children) } };
  }
  // A device in UTC at 00:30 Seoul time: today must still be the Seoul date.
  class DeviceDate extends Date {
    constructor(value?: string | number, month?: number, day = 1, hours = 0) {
      const local =
        typeof value === 'string' && /T\d{2}:\d{2}:\d{2}$/.test(value) ? value + 'Z' : value;
      super(
        month === undefined
          ? (local ?? '2026-10-14T15:30:00Z')
          : Date.UTC(Number(value), month, day, hours),
      );
    }
    static now() {
      return Date.parse('2026-10-14T15:30:00Z');
    }
    getFullYear() {
      return this.getUTCFullYear();
    }
    getMonth() {
      return this.getUTCMonth();
    }
    getDate() {
      return this.getUTCDate();
    }
    getDay() {
      return this.getUTCDay();
    }
    setDate(day: number) {
      return this.setUTCDate(day);
    }
    setMonth(month: number) {
      return this.setUTCMonth(month);
    }
  }
  runInNewContext(source, {
    exports: {},
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === './date') {
        const dateExports = {};
        runInNewContext(
          ts.transpileModule(
            readFileSync(new URL('../../frontend/src/date.ts', import.meta.url), 'utf8'),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
          ).outputText,
          { exports: dateExports, Date: DeviceDate, Intl },
        );
        return dateExports;
      }
      if (name === './rest-timer') {
        // Pure timer helpers (#31); the timer stays idle in these draft scenarios.
        const timerExports = {};
        runInNewContext(
          ts.transpileModule(
            readFileSync(new URL('../../frontend/src/rest-timer.ts', import.meta.url), 'utf8'),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
          ).outputText,
          { exports: timerExports, Date: DeviceDate, JSON, Math, Number, String },
        );
        return timerExports;
      }
      if (name === 'react-dom/client')
        return {
          createRoot: () => ({
            render: (v: Element) => {
              root = v;
            },
          }),
        };
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (name.endsWith('.css')) return {};
      // The routine planner page (#27) has its own UI tests; drafts never render it.
      if (name === './routines') return { Routines: () => null };
      // The exercise analysis page (#32) is covered by analysis-ui.test.ts.
      if (name === './analysis') return { Analysis: () => null };
      // Routine goals (#28) are hook-free helpers and views; load the real module.
      if (name === './progress') {
        const progressExports = {};
        runInNewContext(
          ts.transpileModule(
            readFileSync(new URL('../../frontend/src/progress.tsx', import.meta.url), 'utf8'),
            {
              compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true,
              },
            },
          ).outputText,
          { exports: progressExports, require: () => react, Intl },
        );
        return progressExports;
      }
      throw Error(`Unexpected import: ${name}`);
    },
    Date: DeviceDate,
    Intl,
    document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
    localStorage,
    crypto: insecureOrigin
      ? { getRandomValues: (bytes: Uint8Array) => randomFillSync(bytes) }
      : { randomUUID },
    setTimeout: (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      timers.set(timer, { callback, delay });
      return timer;
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
      timers.delete(timer);
      clearTimeout(timer);
    },
    AbortController,
    navigator: { onLine: true },
    window: { localStorage, addEventListener() {}, removeEventListener() {} },
    confirm: () => true,
    fetch: async (
      path: string,
      options: {
        method: string;
        body?: string;
        headers?: Record<string, string>;
        signal?: AbortSignal;
      },
    ) => {
      requests.push(path);
      if (['POST', 'PUT'].includes(options.method)) {
        mutations.push({ path, headers: options.headers, body: options.body });
        if (failMutation) throw new TypeError('Failed to fetch');
        if (timeoutMutation) throw new DOMException('Request timed out', 'TimeoutError');
        const pending = nextMutationResponse;
        nextMutationResponse = undefined;
        if (pending)
          await new Promise<void>((resolve, reject) => {
            const abort = () => reject(new DOMException('Aborted', 'AbortError'));
            options.signal?.addEventListener('abort', abort, { once: true });
            pending.then(() => {
              options.signal?.removeEventListener('abort', abort);
              resolve();
            }, reject);
          });
        if (loseResponse) throw new TypeError('Response lost after server commit');
        if (conflict)
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: '다른 기기에서 수정된 기록입니다. 최신 기록을 확인하세요.',
            }),
          };
        return { ok: true, status: 201, json: async () => ({ id: 42, version: 1 }) };
      }
      const url = new URL(path, 'http://test');
      const id = Number(url.pathname.split('/').at(-1));
      if (options.method === 'PUT' || options.method === 'DELETE') {
        const pending = nextMutationResponse;
        nextMutationResponse = undefined;
        await pending;
      }
      if (options.method === 'PUT') {
        records = records.map((w) => (w.id === id ? { ...JSON.parse(options.body!), id } : w));
      } else if (options.method === 'DELETE') records = records.filter((w) => w.id !== id);
      const data =
        url.pathname === '/api/workouts'
          ? records
              .filter(
                (w) =>
                  w.date >= url.searchParams.get('from')! && w.date <= url.searchParams.get('to')!,
              )
              .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
          : [];
      if (url.pathname === '/api/workouts' && options.method === 'GET') {
        const pending = nextWorkoutResponse;
        nextWorkoutResponse = undefined;
        await pending;
      }
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  function render() {
    cursor = 0;
    tree = expand(root);
    const pending = effects;
    effects = [];
    pending.forEach((fn) => fn());
  }
  async function settle() {
    // Drain async actions and refresh requests before reading the next render.
    for (let i = 0; i < 4; i++) {
      render();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  function all(predicate: (e: Element) => boolean, view: View = tree): Element[] {
    if (Array.isArray(view)) return view.flatMap((v) => (v === undefined ? [] : all(predicate, v)));
    if (!view || typeof view !== 'object') return [];
    return [
      ...(predicate(view) ? [view] : []),
      ...(view.props.children === undefined ? [] : all(predicate, view.props.children)),
    ];
  }
  function text(view: View): string {
    if (Array.isArray(view)) return view.map(text).join('');
    if (!view || typeof view === 'boolean') return '';
    return typeof view === 'object' ? text(view.props.children) : String(view);
  }
  function event(element: Element, name: string, value?: unknown) {
    (element.props[name] as (event?: unknown) => unknown)(value);
    render();
  }
  function button(label: string) {
    const found = all(
      (e) => e.type === 'button' && (e.props['aria-label'] === label || text(e) === label),
    )[0];
    assert.ok(found, `button ${label}`);
    return found;
  }
  return {
    storage,
    conflict() {
      conflict = true;
    },
    expireRequests() {
      assert.ok(timers.size > 0, 'request has a deadline');
      for (const timer of timers.values()) {
        assert.equal(timer.delay, 15000, 'transport timeout is fifteen seconds');
        timer.callback();
      }
    },
    mutations,
    offline() {
      failMutation = true;
    },
    timeout() {
      timeoutMutation = true;
    },
    online() {
      failMutation = false;
      timeoutMutation = false;
      loseResponse = false;
    },
    loseNextResponse() {
      loseResponse = true;
    },
    content: () => text(tree),
    settle,
    all,
    text,
    event,
    button,
    requests,
    holdNextMutationResponse() {
      let resolve!: () => void;
      nextMutationResponse = new Promise<void>((res) => {
        resolve = res;
      });
      return { resolve };
    },
    holdNextWorkoutResponse() {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      nextWorkoutResponse = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { resolve, reject };
    },
    async select(period: string, anchor: string) {
      event(all((e) => e.props['aria-label'] === '기준 날짜')[0], 'onChange', {
        target: { value: anchor },
      });
      event(button(period), 'onClick');
      await settle();
    },
    stat(label: string) {
      const stat = all((e) => e.props.className === 'stat' && text(e).startsWith(label))[0];
      return text(all((e) => e.props.className === 'stat-value', stat)[0]);
    },
    chart: () => all((e) => e.props.role === 'img')[0]?.props['aria-label'] as string,
  };
}

type UI = ReturnType<typeof mount>;
async function fill(ui: UI) {
  await ui.settle();
  ui.event(ui.button('운동 기록하기'), 'onClick');
  // #28: the editor starts with three sets; these scenarios save a single valid set.
  for (let i = 0; i < 2; i++) ui.event(ui.button('세트 삭제'), 'onClick');
  assert.equal(ui.all((e) => e.type === 'input' && e.props.list === 'exercise-names').length, 1);
  const change = (predicate: Parameters<UI['all']>[0], value: string) =>
    ui.event(ui.all(predicate)[0], 'onChange', { target: { value } });
  change((e) => e.type === 'input' && e.props.maxLength === 120, 'Recovery workout');
  change((e) => e.type === 'input' && e.props.list === 'exercise-names', 'Squat');
  change((e) => e.type === 'input' && e.props.step === '0.25', '100.25');
  await ui.settle();
}
function submit(ui: UI) {
  ui.event(ui.all((e) => e.type === 'form')[0], 'onSubmit', { preventDefault() {} });
}
function matchingButton(ui: UI, label: RegExp) {
  const button = ui.all((e) => e.type === 'button' && label.test(ui.text(e)))[0];
  assert.ok(button, 'button matching ' + label);
  return button;
}

test('refresh offers recovery and restores input without affecting server statistics', async () => {
  const storage = new Map<string, string>();
  const first = mount([], storage);
  await fill(first);
  assert.ok(storage.size > 0, 'input is persisted before submission');
  assert.match(first.content(), /로컬|초안/);
  assert.equal(first.stat('완료한 세트'), '0세트');
  const second = mount([], storage);
  await second.settle();
  second.event(matchingButton(second, /복구/), 'onClick');
  await second.settle();
  assert.equal(
    second.all((e) => e.type === 'input' && e.props.maxLength === 120)[0].props.value,
    'Recovery workout',
  );
  assert.equal(
    second.all((e) => e.type === 'input' && e.props.list === 'exercise-names')[0].props.value,
    'Squat',
  );
  assert.equal(
    Number(second.all((e) => e.type === 'input' && e.props.step === '0.25')[0].props.value),
    100.25,
  );
  assert.equal(
    second.all((e) => e.type === 'input' && e.props.type === 'date' && !!e.props.required)[0].props
      .value,
    '2026-10-15',
  );
  assert.equal(second.mutations.length, 0, 'recovery never auto-syncs');
});

test('discard prevents another refresh from offering the same draft', async () => {
  const storage = new Map<string, string>();
  await fill(mount([], storage));
  const second = mount([], storage);
  await second.settle();
  second.event(matchingButton(second, /폐기|버리기/), 'onClick');
  await second.settle();
  const third = mount([], storage);
  await third.settle();
  assert.equal(third.all((e) => e.type === 'button' && /복구/.test(third.text(e))).length, 0);
  assert.equal(third.mutations.length, 0);
});

test('pending submission cannot report success or send duplicate requests', async () => {
  const ui = mount();
  await fill(ui);
  const pending = ui.holdNextMutationResponse();
  const onSubmit = ui.all((e) => e.type === 'form')[0].props.onSubmit as (event: {
    preventDefault(): void;
  }) => void;
  // Both events see the same render, as rapid clicks can before React commits.
  onSubmit({ preventDefault() {} });
  onSubmit({ preventDefault() {} });
  await ui.settle();
  try {
    assert.equal(ui.mutations.length, 1, 'duplicate submit sends one request');
    assert.match(ui.content(), /저장 중/);
    assert.doesNotMatch(ui.content(), /저장 완료|저장 성공/);
    assert.ok(ui.storage.size > 0, 'keep draft until acknowledgment');
  } finally {
    pending.resolve();
    await ui.settle();
  }
});

for (const failure of ['offline', 'timeout'] as const) {
  test(`${failure} failure preserves input and explicit retry reuses its key`, async () => {
    const ui = mount();
    await fill(ui);
    ui[failure]();
    submit(ui);
    await ui.settle();
    assert.equal(ui.mutations.length, 1);
    assert.ok(ui.storage.size > 0, 'offline submission keeps draft');
    assert.ok(ui.all((e) => e.type === 'input' && e.props.value === 'Recovery workout').length);
    assert.doesNotMatch(ui.content(), /저장 완료|저장 성공/);
    ui.online();
    ui.event(matchingButton(ui, /재시도|다시 저장/), 'onClick');
    await ui.settle();
    assert.equal(ui.mutations.length, 2);
    const key = (i: number) => new Headers(ui.mutations[i].headers).get('Idempotency-Key');
    assert.ok(key(0), 'mutation has retry key');
    assert.equal(key(1), key(0));
    assert.equal(ui.mutations[1].body, ui.mutations[0].body);
  });
}

test('editing content after an uncertain save uses a new request key', async () => {
  const ui = mount();
  await fill(ui);
  ui.loseNextResponse();
  submit(ui);
  await ui.settle();
  ui.event(ui.all((e) => e.type === 'input' && e.props.maxLength === 120)[0], 'onChange', {
    target: { value: 'Changed workout' },
  });
  ui.online();
  submit(ui);
  await ui.settle();
  assert.equal(ui.mutations.length, 2);
  const key = (i: number) => new Headers(ui.mutations[i].headers).get('Idempotency-Key');
  assert.ok(key(0), 'first mutation has a retry key');
  assert.ok(key(1), 'changed mutation has a retry key');
  assert.notEqual(key(0), key(1));
});

test('lost response retains retry key across refresh and acknowledgment clears draft', async () => {
  const storage = new Map<string, string>();
  const first = mount([], storage);
  await fill(first);
  first.loseNextResponse();
  submit(first);
  await first.settle();
  assert.ok(storage.size > 0, 'response loss preserves draft');
  const second = mount([], storage);
  await second.settle();
  second.event(matchingButton(second, /복구/), 'onClick');
  await second.settle();
  submit(second);
  await second.settle();
  const key = (ui: UI) => new Headers(ui.mutations[0].headers).get('Idempotency-Key');
  assert.ok(key(first), 'initial request contains retry key');
  assert.equal(key(second), key(first), 'uncertain outcome reuses persisted key');
  const third = mount([], storage);
  await third.settle();
  assert.equal(third.all((e) => e.type === 'button' && /복구/.test(third.text(e))).length, 0);
});

test('unavailable storage warns but permits editing and server saving', async () => {
  const ui = mount([], new Map(), true);
  await fill(ui);
  assert.ok(ui.all((e) => e.type === 'input' && e.props.value === 'Recovery workout').length);
  assert.match(ui.content(), /저장 공간|로컬 저장|초안.*실패|보관.*실패/);
  submit(ui);
  await ui.settle();
  assert.equal(ui.mutations.length, 1);
});

test('corrupt draft does not prevent startup or a fresh journal', async () => {
  const storage = new Map<string, string>();
  await fill(mount([], storage));
  assert.ok(storage.size > 0, 'discover actual draft keys by editing');
  for (const key of storage.keys()) storage.set(key, '{invalid-json');
  await fill(mount([], storage));
});

test('a draft at the seven day retention boundary is not offered for recovery', async () => {
  const storage = new Map<string, string>();
  await fill(mount([], storage));
  for (const [key, raw] of storage) {
    const value = JSON.parse(raw);
    value.savedAt = Date.parse('2026-10-14T15:30:00Z') - 7 * 86400000;
    storage.set(key, JSON.stringify(value));
  }
  const ui = mount([], storage);
  await ui.settle();
  assert.equal(ui.all((e) => e.type === 'button' && /복구/.test(ui.text(e))).length, 0);
  assert.match(ui.content(), /7일/);
  assert.equal(storage.size, 0);
});

test('structurally corrupt JSON draft does not break the editor', async () => {
  const storage = new Map<string, string>();
  await fill(mount([], storage));
  for (const [key, raw] of storage) {
    const value = JSON.parse(raw);
    value.editor.sets = [null];
    storage.set(key, JSON.stringify(value));
  }
  const ui = mount([], storage);
  await fill(ui);
  assert.ok(ui.all((e) => e.type === 'input' && e.props.value === 'Recovery workout').length);
});

test('the request deadline aborts pending transport and permits an explicit retry', async () => {
  const ui = mount();
  await fill(ui);
  const pending = ui.holdNextMutationResponse();
  submit(ui);
  await ui.settle();
  ui.expireRequests();
  await ui.settle();
  assert.match(ui.content(), /저장 실패/);
  assert.ok(ui.storage.size > 0, 'aborted request keeps draft');
  pending.resolve();
  ui.event(matchingButton(ui, /재시도/), 'onClick');
  await ui.settle();
  assert.equal(ui.mutations.length, 2);
  assert.equal(
    new Headers(ui.mutations[0].headers).get('Idempotency-Key'),
    new Headers(ui.mutations[1].headers).get('Idempotency-Key'),
  );
});

test('a conflicting device edit is visible and keeps the local draft', async () => {
  const ui = mount();
  await fill(ui);
  ui.conflict();
  submit(ui);
  await ui.settle();
  assert.match(ui.content(), /다른 기기에서 수정/);
  assert.doesNotMatch(ui.content(), /저장 완료|저장 성공/);
  assert.ok(ui.storage.size > 0, 'conflict keeps local draft');
  assert.equal(ui.stat('완료한 세트'), '0세트');
});

test('a phone on local HTTP can generate a UUID key without randomUUID', async () => {
  const ui = mount([], new Map(), false, true);
  await fill(ui);
  submit(ui);
  await ui.settle();
  assert.equal(ui.mutations.length, 1);
  assert.match(
    new Headers(ui.mutations[0].headers).get('Idempotency-Key')!,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.match(ui.content(), /서버 저장 완료/);
});

test('write quota failure still permits server save and reports the local persistence failure', async () => {
  const ui = mount([], new Map(), 'write');
  await fill(ui);
  assert.match(ui.content(), /로컬 저장 공간 오류/);
  assert.equal(ui.storage.size, 0);
  submit(ui);
  await ui.settle();
  assert.equal(ui.mutations.length, 1);
  assert.match(ui.content(), /서버 저장 완료/);
});

test('cleanup failure keeps server acknowledgment separate from the local storage warning', async () => {
  const ui = mount([], new Map(), 'remove');
  await fill(ui);
  submit(ui);
  await ui.settle();
  assert.equal(ui.mutations.length, 1);
  assert.match(ui.content(), /서버 저장 완료/);
  assert.match(ui.content(), /정리.*실패|저장 공간 오류/);
  assert.ok(ui.storage.size > 0, 'failed cleanup leaves the old draft on disk');
});

test('refreshing an edit preserves its original revision so newer device data cannot be overwritten', async () => {
  const storage = new Map<string, string>();
  const saved: Workout = {
    id: 71,
    version: 3,
    date: '2026-10-15',
    title: 'Saved workout',
    notes: '',
    sets: [{ exercise: 'Squat', machine_id: null, weight: '100.25', reps: 10 }],
  };
  const first = mount([saved], storage);
  await first.settle();
  first.event(first.button('수정'), 'onClick');
  first.event(first.all((e) => e.type === 'input' && e.props.maxLength === 120)[0], 'onChange', {
    target: { value: 'Unsaved edit' },
  });
  const second = mount([{ ...saved, version: 4, title: 'New device edit' }], storage);
  await second.settle();
  second.event(matchingButton(second, /복구/), 'onClick');
  await second.settle();
  second.conflict();
  submit(second);
  await second.settle();
  assert.equal(second.mutations[0].path, '/api/workouts/71');
  assert.equal(JSON.parse(second.mutations[0].body!).version, 3);
  assert.equal(JSON.parse(second.mutations[0].body!).title, 'Unsaved edit');
  assert.match(second.content(), /다른 기기에서 수정/);
  assert.ok(storage.size > 0, 'conflicting edit remains recoverable');
});

test('a new journal starts with three empty set rows and keeps the draft flow', async () => {
  const storage = new Map<string, string>();
  const ui = mount([], storage);
  await ui.settle();
  ui.event(ui.button('운동 기록하기'), 'onClick');
  await ui.settle();
  const names = ui.all((e) => e.type === 'input' && e.props.list === 'exercise-names');
  assert.equal(names.length, 3, '#28: the editor starts with 3 sets');
  assert.ok(names.every((e) => e.props.value === ''));
  assert.ok(
    ui
      .all((e) => e.type === 'input' && e.props.step === '0.25')
      .every((e) => Number(e.props.value) === 0),
  );
  assert.ok(storage.size > 0, 'the three-row editor is a local draft');
  assert.equal(ui.mutations.length, 0);
});
