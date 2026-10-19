import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Same dependency-free rendered-element adapter as workout-draft-ui.test.ts, with a
// controllable clock and timers. Background tabs are simulated by moving the clock
// without firing any timer callback. Real layout and React scheduling are not covered.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
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
  sets: SetInput[];
};
const compile = (file: string) =>
  ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
const source = compile('../../frontend/src/main.tsx');
const start = Date.parse('2026-10-14T15:30:00Z');

function mount(
  initial: Workout[] = [],
  storage = new Map<string, string>(),
  clock = { now: start },
) {
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const listeners = new Map<string, (() => void)[]>();
  const mutations: { path: string; method: string; body: string }[] = [];
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
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
  class DeviceDate extends Date {
    constructor(...args: [] | [string | number]) {
      super(...((args.length ? args : [clock.now]) as [number]));
    }
    static now() {
      return clock.now;
    }
  }
  const sandbox: Record<string, unknown> = {
    Date: DeviceDate,
    Intl,
    localStorage,
    crypto: { randomUUID },
    AbortController,
    setTimeout: (callback: () => void, delay: number) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id: number) => void timers.delete(id),
    document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
    window: {
      addEventListener: (name: string, fn: () => void) =>
        listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      removeEventListener: (name: string, fn: () => void) =>
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((f) => f !== fn),
        ),
    },
    confirm: () => true,
    fetch: async (path: string, options: { method: string; body?: string }) => {
      if (options.method === 'POST' || options.method === 'PUT') {
        mutations.push({ path, method: options.method, body: options.body! });
        return { ok: true, status: 201, json: async () => ({ id: 42, version: 1 }) };
      }
      const url = new URL(path, 'http://test');
      const data =
        url.pathname === '/api/workouts'
          ? initial.filter(
              (w) =>
                w.date >= url.searchParams.get('from')! && w.date <= url.searchParams.get('to')!,
            )
          : [];
      return { ok: true, json: async () => structuredClone(data) };
    },
  };
  const modules = new Map<string, object>();
  sandbox.require = (name: string) => {
    if (name === 'react') return react;
    if (name === 'react-dom/client')
      return { createRoot: () => ({ render: (v: Element) => void (root = v) }) };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name.endsWith('.css')) return {};
    if (name === './routines') return { Routines: () => null };
    if (name === './date' || name === './rest-timer') {
      if (!modules.has(name)) {
        const exports = {};
        modules.set(name, exports);
        runInNewContext(compile(`../../frontend/src/${name.slice(2)}.ts`), { ...sandbox, exports });
      }
      return modules.get(name);
    }
    throw Error(`Unexpected import: ${name}`);
  };
  runInNewContext(source, { ...sandbox, exports: {} });
  function render() {
    cursor = 0;
    tree = expand(root);
    const pending = effects;
    effects = [];
    pending.forEach((fn) => fn());
  }
  async function settle() {
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
  function button(label: string | RegExp) {
    const found = all(
      (e) =>
        e.type === 'button' &&
        (typeof label === 'string'
          ? e.props['aria-label'] === label || text(e) === label
          : label.test(String(e.props['aria-label'] ?? '')) || label.test(text(e))),
    )[0];
    assert.ok(found, `button ${String(label)}`);
    return found;
  }
  return {
    storage,
    clock,
    mutations,
    settle,
    render,
    all,
    text,
    event,
    button,
    content: () => text(tree),
    // Returning to a background tab: no tick ran meanwhile, only the clock moved.
    returnToTab(ms: number) {
      clock.now += ms;
      for (const name of ['visibilitychange', 'focus'])
        for (const fn of listeners.get(name) ?? []) fn();
      render();
    },
    // A foreground tick: fire due timers once.
    tick(ms: number) {
      clock.now += ms;
      const due = [...timers].filter(([, t]) => t.delay <= ms && t.delay !== 15000);
      for (const [id, t] of due) {
        timers.delete(id);
        t.callback();
      }
      render();
    },
    timer: () => text(all((e) => e.props.className === 'rest-timer')[0]),
    stat(label: string) {
      const stat = all((e) => e.props.className === 'stat' && text(e).startsWith(label))[0];
      return text(all((e) => e.props.className === 'stat-value', stat)[0]);
    },
  };
}
type UI = ReturnType<typeof mount>;
async function openNew(ui: UI) {
  await ui.settle();
  ui.event(ui.button('운동 기록하기'), 'onClick');
  const change = (predicate: Parameters<UI['all']>[0], value: string) =>
    ui.event(ui.all(predicate)[0], 'onChange', { target: { value } });
  change((e) => e.type === 'input' && e.props.maxLength === 120, '하체');
  change((e) => e.type === 'input' && e.props.list === 'exercise-names', 'Squat');
  change((e) => e.type === 'input' && e.props.step === '0.25', '100');
  await ui.settle();
}
const completion = (ui: UI, i = 0) =>
  ui.all((e) => e.type === 'button' && /세트 완료/.test(String(e.props['aria-label'] ?? '')))[i];
const autoStart = (ui: UI) => ui.all((e) => e.type === 'input' && e.props.type === 'checkbox')[0];
const duration = (ui: UI) =>
  ui.all((e) => e.type === 'input' && e.props['aria-label'] === '휴식 시간(초)')[0];
const rpe = (ui: UI, i = 0) => ui.all((e) => e.type === 'input' && e.props.step === '0.5')[i];
function submit(ui: UI) {
  ui.event(ui.all((e) => e.type === 'form')[0], 'onSubmit', { preventDefault() {} });
}
const sentSets = (ui: UI) => JSON.parse(ui.mutations.at(-1)!.body).sets as SetInput[];

test('new sets start not completed; completion and undo are sent explicitly', async () => {
  const ui = mount();
  await openNew(ui);
  assert.equal(completion(ui).props['aria-pressed'], false);
  ui.event(completion(ui), 'onClick');
  assert.equal(completion(ui).props['aria-pressed'], true);
  assert.match(ui.text(completion(ui)), /완료됨/);
  ui.clock.now += 1000;
  ui.event(completion(ui), 'onClick');
  assert.equal(completion(ui).props['aria-pressed'], false, 'completion can be undone');
  ui.event(ui.button('세트 추가'), 'onClick');
  ui.event(completion(ui, 1), 'onClick');
  ui.clock.now += 1000;
  submit(ui);
  await ui.settle();
  assert.deepEqual(
    sentSets(ui).map((s) => [s.completed, s.rpe]),
    [
      [false, null],
      [true, null],
    ],
    'missing RPE is sent as null, never 0',
  );
});

test('auto-start is opt-in and a duplicate completion click starts one rest', async () => {
  const ui = mount();
  await openNew(ui);
  ui.event(completion(ui), 'onClick');
  assert.match(ui.timer(), /1:30/);
  assert.doesNotMatch(ui.timer(), /남음/, 'auto-start is off by default');
  ui.clock.now += 1000;
  ui.event(completion(ui), 'onClick');
  ui.event(autoStart(ui), 'onChange', { target: { checked: true } });
  const stale = completion(ui).props.onClick as () => void;
  stale();
  ui.clock.now += 5000;
  // The same render's handler fires again, as a double tap can before React commits.
  stale();
  ui.render();
  assert.equal(completion(ui).props['aria-pressed'], true);
  assert.match(ui.timer(), /1:25 남음/, 'second click neither toggles nor restarts the rest');
  ui.event(completion(ui), 'onClick');
  assert.equal(completion(ui).props['aria-pressed'], false);
  assert.match(ui.timer(), /1:25 남음/, 'undoing completion does not restart the rest');
});

test('rest timer can be set, started, paused, resumed and cancelled', async () => {
  const ui = mount();
  await openNew(ui);
  ui.event(duration(ui), 'onChange', { target: { value: '60' } });
  assert.match(ui.timer(), /1:00/);
  ui.event(duration(ui), 'onChange', { target: { value: '3' } });
  assert.match(ui.timer(), /1:00/, 'durations under 5 seconds are ignored');
  ui.event(ui.button('휴식 시작'), 'onClick');
  ui.tick(1000);
  assert.match(ui.timer(), /0:59 남음/);
  ui.clock.now += 9000;
  ui.event(ui.button('일시정지'), 'onClick');
  assert.match(ui.timer(), /0:50 일시정지/);
  ui.returnToTab(120000);
  assert.match(ui.timer(), /0:50 일시정지/, 'paused rest does not run');
  ui.event(ui.button('재개'), 'onClick');
  ui.clock.now += 20000;
  ui.render();
  assert.match(ui.timer(), /0:30 남음/);
  ui.event(ui.button('휴식 취소'), 'onClick');
  assert.match(ui.timer(), /1:00/);
  assert.doesNotMatch(ui.timer(), /남음|일시정지/);
});

test('returning from the background shows time left from the end timestamp', async () => {
  const ui = mount();
  await openNew(ui);
  ui.event(ui.button('휴식 시작'), 'onClick');
  ui.returnToTab(30000);
  assert.match(ui.timer(), /1:00 남음/);
  ui.returnToTab(59999);
  assert.match(ui.timer(), /0:01 남음/, 'rounds up until the real end');
  ui.returnToTab(1);
  assert.match(ui.timer(), /휴식 종료/);
  ui.returnToTab(3600000);
  assert.match(ui.timer(), /휴식 종료/);
  assert.doesNotMatch(ui.timer(), /-/, 'never shows negative time');
});

test('refresh restores timer from its end time and set state from the draft', async () => {
  const storage = new Map<string, string>();
  const clock = { now: start };
  const first = mount([], storage, clock);
  await openNew(first);
  first.event(autoStart(first), 'onChange', { target: { checked: true } });
  first.event(completion(first), 'onClick');
  first.event(rpe(first), 'onChange', { target: { value: '8.5' } });
  clock.now += 45000;
  const second = mount([], storage, clock);
  await second.settle();
  assert.match(second.timer(), /0:45 남음/);
  second.event(second.button(/복구/), 'onClick');
  await second.settle();
  assert.equal(completion(second).props['aria-pressed'], true);
  assert.equal(Number(rpe(second).props.value), 8.5);
  assert.equal(autoStart(second).props.checked, true, 'auto-start preference persists');
  submit(second);
  await second.settle();
  assert.deepEqual(
    sentSets(second).map((s) => [s.completed, s.rpe]),
    [[true, 8.5]],
  );
});

test('clearing RPE sends null, and corrupt timer storage does not block startup', async () => {
  const storage = new Map([['workout-memo:rest-timer:v1', '{broken']]);
  const ui = mount([], storage);
  await openNew(ui);
  assert.match(ui.timer(), /1:30/);
  ui.event(rpe(ui), 'onChange', { target: { value: '7' } });
  ui.event(rpe(ui), 'onChange', { target: { value: '' } });
  submit(ui);
  await ui.settle();
  assert.equal(sentSets(ui)[0].rpe, null);
});

test('not-completed sets are excluded from volume, set count and workout days', async () => {
  const ui = mount([
    {
      id: 1,
      date: '2026-10-15',
      title: '계획만 입력',
      notes: '',
      sets: [{ exercise: 'Squat', machine_id: null, weight: 200, reps: 10, completed: false }],
    },
    {
      id: 2,
      date: '2026-10-14',
      title: '수행',
      notes: '',
      sets: [
        { exercise: 'Squat', machine_id: null, weight: 100, reps: 10, completed: true, rpe: 8 },
        { exercise: 'Squat', machine_id: null, weight: 300, reps: 10, completed: false },
        // Rows saved before completion tracking count as completed.
        { exercise: 'Squat', machine_id: null, weight: 50, reps: 10 },
      ],
    },
  ]);
  await ui.settle();
  assert.equal(ui.stat('완료한 세트'), '2세트');
  assert.equal(ui.stat('누적 볼륨'), '1,500kg');
  assert.equal(ui.stat('운동한 날'), '1일');
  assert.match(ui.content(), /미완료 1/);
});

test('a rapid second tap in a later render does not undo completion or touch the rest', async () => {
  const ui = mount();
  await openNew(ui);
  ui.event(autoStart(ui), 'onChange', { target: { checked: true } });
  ui.event(completion(ui), 'onClick');
  ui.clock.now += 100;
  // Double click: the second click arrives after React re-rendered.
  ui.event(completion(ui), 'onClick');
  assert.equal(completion(ui).props['aria-pressed'], true, 'double click keeps completion');
  assert.match(ui.timer(), /1:30 남음/, 'rest started once and keeps running');
  ui.clock.now += 1000;
  ui.event(completion(ui), 'onClick');
  assert.equal(completion(ui).props['aria-pressed'], false, 'deliberate undo still works');
  assert.match(ui.timer(), /1:29 남음/, 'undo does not cancel the rest');
  submit(ui);
  await ui.settle();
  assert.equal(sentSets(ui)[0].completed, false);
});
