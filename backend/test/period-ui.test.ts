import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  date: string;
  title: string;
  notes: string;
  sets: { exercise: string; machine_id: null; weight: number | string; reps: number }[];
};
const workout = (id: number, date: string, weight: number | string = 100): Workout => ({
  id,
  date,
  title: `기록 ${id}`,
  notes: '',
  sets: [{ exercise: 'Squat', machine_id: null, weight, reps: 10 }],
});
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

function mount(initial: Workout[] = []) {
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
      slots[index] ??= { value: initialValue };
      return [
        slots[index].value,
        (value: unknown) => {
          slots[index].value = value;
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
  const modules = new Map<string, object>();
  const sandbox: Record<string, unknown> = {
    localStorage: (() => {
      const items = new Map<string, string>();
      return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      };
    })(),
    crypto: { randomUUID },
    AbortController,
    setTimeout,
    clearTimeout,
    exports: {},
    require: (name: string) => {
      if (name === 'react') return react;
      if (name.endsWith('.css')) return {};
      if (name.startsWith('./')) {
        if (modules.has(name)) return modules.get(name);
        const target = ['.ts', '.tsx']
          .map((ext) => new URL('../../frontend/src/' + name.slice(2) + ext, import.meta.url))
          .find(existsSync);
        assert.ok(target, `Frontend module ${name} exists`);
        const moduleExports = {};
        modules.set(name, moduleExports);
        runInNewContext(
          ts.transpileModule(readFileSync(target, 'utf8'), {
            compilerOptions: {
              module: ts.ModuleKind.CommonJS,
              jsx: ts.JsxEmit.React,
              esModuleInterop: true,
            },
          }).outputText,
          { ...sandbox, exports: moduleExports },
        );
        return moduleExports;
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
      throw Error(`Unexpected import: ${name}`);
    },
    Date: DeviceDate,
    Intl,
    document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
    window: { addEventListener() {}, removeEventListener() {} },
    confirm: () => true,
    fetch: async (path: string, options: { method: string; body?: string }) => {
      requests.push(path);
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
  };
  runInNewContext(source, sandbox);
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

test('default date is today in Asia/Seoul even on a UTC device', async () => {
  const ui = mount();
  await ui.settle();
  assert.equal(ui.all((e) => e.props['aria-label'] === '기준 날짜')[0].props.value, '2026-10-15');
});

for (const outcome of ['success', 'failure'] as const) {
  test(`an older period's delayed ${outcome} cannot overwrite the latest results`, async () => {
    const ui = mount([workout(1, '2024-02-29', 100), workout(2, '2024-03-01', 200)]);
    await ui.settle();
    await ui.select('1일', '2024-02-28');
    const older = ui.holdNextWorkoutResponse();
    await ui.select('1일', '2024-02-29');
    await ui.select('1일', '2024-03-01');
    assert.equal(ui.stat('누적 볼륨'), '2,000kg');
    if (outcome === 'success') older.resolve();
    else older.reject(new Error('Old period failed'));
    await ui.settle();
    assert.equal(ui.stat('누적 볼륨'), '2,000kg');
    assert.equal(ui.stat('운동한 날'), '1일');
    assert.equal(ui.stat('완료한 세트'), '1세트');
    assert.match(ui.chart(), /2,000kg/);
    const rows = ui.all((e) => e.props.className === 'workout-row');
    assert.equal(rows.length, 1);
    assert.match(ui.text(rows[0]), /기록 2/);
    assert.equal(ui.all((e) => e.props.role === 'alert').length, 0);
  });
}

test('an older response cannot clear loading while the latest period is still pending', async () => {
  const ui = mount([workout(1, '2024-02-29', 100), workout(2, '2024-03-01', 200)]);
  await ui.settle();
  await ui.select('1일', '2024-02-28');
  const older = ui.holdNextWorkoutResponse();
  await ui.select('1일', '2024-02-29');
  const latest = ui.holdNextWorkoutResponse();
  await ui.select('1일', '2024-03-01');
  older.resolve();
  await ui.settle();
  assert.equal(
    ui.all((e) => e.props.className === 'empty' && ui.text(e) === '기록을 불러오는 중…').length,
    1,
  );
  latest.resolve();
  await ui.settle();
  assert.equal(ui.stat('누적 볼륨'), '2,000kg');
  assert.equal(ui.all((e) => e.props.className === 'workout-row').length, 1);
});

for (const mutation of ['delete', 'edit'] as const) {
  test(`a delayed ${mutation} refreshes the currently selected period`, async () => {
    const ui = mount([
      workout(1, '2024-02-29', 100),
      workout(2, '2024-03-01', 200),
      workout(3, '2024-03-02', 300),
    ]);
    await ui.settle();
    await ui.select('1일', '2024-02-29');
    const pending = ui.holdNextMutationResponse();
    if (mutation === 'delete') {
      ui.event(ui.button('기록 1 삭제'), 'onClick');
    } else {
      ui.event(ui.button('수정'), 'onClick');
      const weight = ui.all(
        (e) => e.type === 'input' && e.props.type === 'number' && e.props.step === '0.25',
      )[0];
      ui.event(weight, 'onChange', { target: { value: '150' } });
      ui.event(ui.all((e) => e.type === 'form')[0], 'onSubmit', { preventDefault() {} });
    }
    const period = mutation === 'delete' ? '1일' : '1달';
    const expectedVolume = mutation === 'delete' ? '2,000kg' : '5,000kg';
    await ui.select(period, '2024-03-01');
    assert.equal(ui.stat('누적 볼륨'), expectedVolume);
    const requestCount = ui.requests.filter((p) => p.startsWith('/api/workouts?')).length;
    pending.resolve();
    await ui.settle();
    const queries = ui.requests.filter((p) => p.startsWith('/api/workouts?'));
    assert.equal(queries.length, requestCount + 1);
    assert.equal(
      queries.at(-1),
      `/api/workouts?from=2024-03-01&to=${mutation === 'delete' ? '2024-03-01' : '2024-03-31'}`,
    );
    assert.equal(ui.stat('누적 볼륨'), expectedVolume);
    assert.equal(ui.stat('운동한 날'), mutation === 'delete' ? '1일' : '2일');
    assert.equal(ui.stat('완료한 세트'), mutation === 'delete' ? '1세트' : '2세트');
    assert.match(ui.chart(), mutation === 'delete' ? /2,000kg/ : /5,000kg/);
    const rows = ui.all((e) => e.props.className === 'workout-row');
    assert.equal(rows.length, mutation === 'delete' ? 1 : 2);
    assert.ok(rows.every((row) => !ui.text(row).includes('기록 1')));
    assert.equal(ui.all((e) => e.props.role === 'alert').length, 0);
  });
}

const ranges = [
  ['1일', '2024-02-29', '2024-02-29', '2024-02-29'],
  ['1주', '2024-12-30', '2024-12-30', '2025-01-05'],
  ['1주', '2025-01-05', '2024-12-30', '2025-01-05'],
  ['1달', '2024-02-29', '2024-02-01', '2024-02-29'],
  ['1달', '2025-12-31', '2025-12-01', '2025-12-31'],
  ['4주', '2024-03-01', '2024-02-03', '2024-03-01'],
  ['12주', '2025-01-05', '2024-10-14', '2025-01-05'],
];
for (const [period, anchor, from, to] of ranges) {
  test(`${period} at ${anchor} requests inclusive ${from} through ${to}`, async () => {
    const ui = mount();
    await ui.settle();
    await ui.select(period, anchor);
    assert.equal(
      ui.requests.filter((p) => p.startsWith('/api/workouts?')).at(-1),
      `/api/workouts?from=${from}&to=${to}`,
    );
    assert.match(ui.chart(), /0kg/);
    assert.equal(ui.stat('운동한 날'), '0일');
    assert.equal(ui.stat('완료한 세트'), '0세트');
    assert.equal(ui.stat('누적 볼륨'), '0kg');
    assert.equal(
      ui.all((e) => e.type === 'h3' && ui.text(e) === '첫 번째 기록을 남겨보세요').length,
      1,
    );
  });
  test(`${period} graph and totals include both endpoints and exclude adjacent dates`, async () => {
    const adjacent = (date: string, offset: number) => {
      const value = new Date(date + 'T00:00:00Z');
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    const ui = mount([
      workout(1, from, 100),
      workout(2, to, 200),
      workout(3, adjacent(from, -1), 900),
      workout(4, adjacent(to, 1), 900),
    ]);
    await ui.settle();
    await ui.select(period, anchor);
    assert.equal(ui.stat('운동한 날'), from === to ? '1일' : '2일');
    assert.equal(ui.stat('완료한 세트'), '2세트');
    assert.equal(ui.stat('누적 볼륨'), '3,000kg');
    const plotted = [...ui.chart().matchAll(/([\d,.]+)kg/g)].reduce(
      (sum, match) => sum + Number(match[1].replaceAll(',', '')),
      0,
    );
    assert.equal(plotted, 3000);
    assert.equal(ui.all((e) => e.props.className === 'workout-row').length, 2);
  });
}

test('period statistics and graph combine same-day sessions and refresh after edit/delete', async () => {
  const first = workout(1, '2024-02-28', '100.25');
  first.sets.push({ exercise: 'Row', machine_id: null, weight: 50, reps: 8 });
  const ui = mount([
    first,
    workout(2, '2024-02-28', 20),
    workout(3, '2024-02-29', 40),
    workout(4, '2024-03-01', 900),
  ]);
  await ui.settle();
  await ui.select('1주', '2024-02-29');
  // Move to a single month to exclude March 1 and include the leap day.
  await ui.select('1달', '2024-02-29');
  assert.equal(ui.stat('운동한 날'), '2일');
  assert.equal(ui.stat('완료한 세트'), '4세트');
  assert.equal(ui.stat('누적 볼륨'), '2,002.5kg');
  assert.match(ui.chart(), /2,002.5kg/);
  const rows = ui.all((e) => e.props.className === 'workout-row');
  assert.equal(rows.length, 3);
  assert.match(ui.text(rows[0]), /기록 3/);
  const edit = ui.all((e) => e.type === 'button' && ui.text(e) === '수정', rows[0])[0];
  ui.event(edit, 'onClick');
  assert.equal(ui.all((e) => e.props.role === 'dialog')[0].props['aria-label'], '운동 일지 수정');
  const weight = ui.all(
    (e) => e.type === 'input' && e.props.type === 'number' && e.props.step === '0.25',
  )[0];
  ui.event(weight, 'onChange', { target: { value: '60' } });
  ui.event(ui.all((e) => e.type === 'form')[0], 'onSubmit', { preventDefault() {} });
  await ui.settle();
  assert.equal(ui.stat('누적 볼륨'), '2,202.5kg');
  assert.match(ui.chart(), /2,202.5kg/);
  ui.event(ui.button('기록 3 삭제'), 'onClick');
  await ui.settle();
  assert.equal(ui.stat('운동한 날'), '1일');
  assert.equal(ui.stat('완료한 세트'), '3세트');
  assert.equal(ui.stat('누적 볼륨'), '1,602.5kg');
  assert.match(ui.chart(), /1,602.5kg/);
  assert.equal(ui.all((e) => e.props.className === 'workout-row').length, 2);
  for (const id of [1, 2]) {
    ui.event(ui.button(`기록 ${id} 삭제`), 'onClick');
    await ui.settle();
  }
  assert.equal(ui.stat('운동한 날'), '0일');
  assert.equal(ui.stat('완료한 세트'), '0세트');
  assert.equal(ui.stat('누적 볼륨'), '0kg');
  assert.doesNotMatch(ui.chart(), /[1-9][\d,.]*kg/);
});
