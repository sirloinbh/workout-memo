import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Same dependency-free rendered-element adapter as routines-ui.test.ts. Real browser
// layout, SVG painting, focus and native validation are verified separately.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
type Body = {
  id: number;
  date: string;
  body_weight_kg: number | null;
  body_fat_percent: number | null;
  skeletal_muscle_kg: number | null;
};

const fixture = (): Body[] => [
  {
    id: 1,
    date: '2024-03-03',
    body_weight_kg: 99,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
  {
    id: 2,
    date: '2024-03-04',
    body_weight_kg: 70.5,
    body_fat_percent: 20,
    skeletal_muscle_kg: null,
  },
  {
    id: 3,
    date: '2024-03-05',
    body_weight_kg: null,
    body_fat_percent: 19.8,
    skeletal_muscle_kg: null,
  },
  {
    id: 4,
    date: '2024-03-06',
    body_weight_kg: 70.25,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
  { id: 5, date: '2024-03-07', body_weight_kg: 70, body_fat_percent: null, skeletal_muscle_kg: 33 },
  {
    id: 6,
    date: '2024-03-18',
    body_weight_kg: 98,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  },
];

function mount() {
  let records = fixture();
  let nextId = 100;
  const workouts = [
    {
      id: 9,
      version: 1,
      date: '2024-03-06',
      title: '하체',
      notes: '',
      sets: [{ exercise: '스쿼트', machine_id: null, weight: 100.25, reps: 10, notes: '' }],
    },
  ];
  const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  const slots = new Map<string, { value?: unknown; deps?: unknown[] }[]>();
  let component = '';
  let cursor = 0;
  let root: View;
  let tree: View;
  let effects: (() => unknown)[] = [];
  const slot = () => {
    if (!slots.has(component)) slots.set(component, []);
    return { list: slots.get(component)!, index: cursor++ };
  };
  const changed = (a: unknown[] | undefined, b: unknown[]) =>
    !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const react = {
    Fragment: 'fragment',
    createElement(type: Element['type'], props: Props | null, ...children: View[]): Element {
      return { type, props: { ...props, children } };
    },
    useState(initial: unknown) {
      const { list, index } = slot();
      list[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [
        list[index].value,
        (value: unknown) => {
          list[index].value = typeof value === 'function' ? value(list[index].value) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const { list, index } = slot();
      list[index] ??= { value: { current: initial } };
      return list[index].value;
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const { list, index } = slot();
      if (changed(list[index]?.deps, deps)) list[index] = { value: fn, deps };
      return list[index].value;
    },
    useEffect(fn: () => unknown, deps: unknown[]) {
      const { list, index } = slot();
      if (changed(list[index]?.deps, deps)) effects.push(fn);
      list[index] = { deps };
    },
  };
  const json = (status: number, data: unknown) => ({
    ok: status < 400,
    status,
    json: async () => structuredClone(data),
  });
  const modules = new Map<string, object>();
  function load(url: URL): object {
    if (modules.has(url.href)) return modules.get(url.href)!;
    const exports = {};
    modules.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    runInNewContext(source, {
      exports,
      require: (name: string) => {
        if (name === 'react') return react;
        if (name === 'react-dom/client')
          return { createRoot: () => ({ render: (view: View) => (root = view) }) };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name.endsWith('.css')) return {};
        if (name.startsWith('.')) {
          const base = name.replace(/\.js$/, '');
          const target = ['.ts', '.tsx', '']
            .map((ext) => new URL(base + ext, url))
            .find(existsSync);
          assert.ok(target, `Frontend module ${name} exists`);
          return load(target);
        }
        throw Error(`Unsupported frontend import: ${name}`);
      },
      Date,
      Intl,
      console,
      URL,
      AbortController,
      crypto: { randomUUID },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      setTimeout,
      clearTimeout,
      document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
      window: { addEventListener() {}, removeEventListener() {} },
      confirm: () => true,
      fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
        const method = options.method ?? 'GET';
        const body = options.body ? JSON.parse(options.body) : undefined;
        requests.push({ path, method, body });
        const url = new URL(path, 'http://test');
        const inRange = (date: string) =>
          date >= url.searchParams.get('from')! && date <= url.searchParams.get('to')!;
        if (url.pathname === '/api/workouts')
          return json(
            200,
            workouts.filter((w) => inRange(w.date)),
          );
        if (url.pathname.startsWith('/api/body-measurements')) {
          const id = Number(url.pathname.split('/')[3]);
          if (method === 'GET')
            return json(
              200,
              records.filter((r) => inRange(r.date)).sort((a, b) => a.date.localeCompare(b.date)),
            );
          if (method === 'POST') {
            if (records.some((r) => r.date === body.date))
              return json(409, {
                error: '이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요.',
              });
            records.push({ ...body, id: nextId });
            return json(201, { ...body, id: nextId++ });
          }
          if (method === 'PUT') {
            records = records.map((r) => (r.id === id ? { ...body, id } : r));
            return json(200, { ...body, id });
          }
          if (method === 'DELETE') {
            records = records.filter((r) => r.id !== id);
            return json(200, { ok: true });
          }
        }
        return json(200, []);
      },
    });
    return exports;
  }
  load(new URL('../../frontend/src/main.tsx', import.meta.url));
  function expand(view: View, path = 'root'): View {
    if (Array.isArray(view)) return view.map((child, i) => expand(child, `${path}.${i}`));
    if (!view || typeof view !== 'object') return view;
    if (typeof view.type === 'function') {
      component = `${path}:${view.type.name}`;
      cursor = 0;
      return expand(view.type(view.props), `${path}.child`);
    }
    return {
      ...view,
      props: { ...view.props, children: expand(view.props.children, `${path}.children`) },
    };
  }
  async function settle() {
    for (let i = 0; i < 6; i++) {
      tree = expand(root);
      const pending = effects;
      effects = [];
      pending.forEach((fn) => fn());
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  function all(predicate: (element: Element) => boolean, view: View = tree): Element[] {
    if (Array.isArray(view))
      return view.flatMap((child) => (child === undefined ? [] : all(predicate, child)));
    if (!view || typeof view !== 'object') return [];
    return [
      ...(predicate(view) ? [view] : []),
      ...(view.props.children === undefined ? [] : all(predicate, view.props.children)),
    ];
  }
  function text(view: View = tree): string {
    if (Array.isArray(view))
      return view.map((child) => (child === undefined ? '' : text(child))).join('');
    if (!view || typeof view === 'boolean') return '';
    return typeof view === 'object'
      ? view.props.children === undefined
        ? ''
        : text(view.props.children)
      : String(view);
  }
  async function click(label: string) {
    const button = all(
      (e) => e.type === 'button' && (text(e).trim() === label || e.props['aria-label'] === label),
    )[0];
    assert.ok(button, `User can access ${label}`);
    assert.notEqual(button.props.disabled, true, `${label} is enabled`);
    (button.props.onClick as () => void)();
    await settle();
  }
  async function change(label: string, value: string) {
    const item = all((e) => e.type === 'label' && text(e).trim().startsWith(label))[0];
    assert.ok(item, `Input label ${label} exists`);
    const input = all((e) => e.type === 'input', item)[0];
    assert.ok(input);
    (input.props.onChange as (e: unknown) => void)({ target: { value } });
    await settle();
  }
  async function setAnchor(value: string) {
    const input = all((e) => e.type === 'input' && e.props['aria-label'] === '기준 날짜')[0];
    assert.ok(input, 'Period anchor is reused on the body page');
    (input.props.onChange as (e: unknown) => void)({ target: { value } });
    await settle();
  }
  async function submit() {
    const form = all((e) => e.type === 'form')[0];
    assert.ok(form);
    (form.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await settle();
  }
  const chart = (label: string) => {
    const found = all((e) => String(e.props['aria-label'] ?? '').startsWith(label + ' 추이'))[0];
    assert.ok(found, `${label} trend chart exists`);
    return {
      label: String(found.props['aria-label']),
      points: all((e) => e.type === 'circle', found).length,
      lines: all((e) => e.type === 'polyline', found).length,
      text: text(found),
    };
  };
  const bodyGets = () =>
    requests.filter((r) => r.method === 'GET' && r.path.startsWith('/api/body-measurements'));
  return { requests, bodyGets, settle, all, text, click, change, setAnchor, submit, chart };
}

async function openWeek() {
  const ui = mount();
  await ui.settle();
  await ui.click('신체 기록');
  await ui.setAnchor('2024-03-06');
  return ui;
}

test('body page reuses the selected period and plots only recorded values without bridging gaps', async () => {
  const ui = await openWeek();
  assert.equal(ui.bodyGets().at(-1)?.path, '/api/body-measurements?from=2024-03-04&to=2024-03-10');
  const weight = ui.chart('체중');
  // 3/4, 3/6, 3/7 have weight; 3/5 has a record without weight, so the line breaks there.
  assert.equal(weight.points, 3);
  assert.equal(weight.lines, 1, 'Only 3/6→3/7 is connected');
  assert.match(weight.label, /2024-03-04 70\.5/);
  assert.match(weight.label, /2024-03-07 70(?:\D|$)/);
  assert.doesNotMatch(weight.label, /2024-03-05/, 'Missing weight is not plotted as 0');
  assert.doesNotMatch(weight.label, /2024-03-03|99/, 'Out-of-range records are excluded');
  const fat = ui.chart('체지방률');
  assert.equal(fat.points, 2);
  assert.equal(fat.lines, 1);
  const muscle = ui.chart('골격근량');
  assert.equal(muscle.points, 1);
  assert.equal(muscle.lines, 0);
  const page = ui.text();
  assert.match(page, /미입력/);
  assert.match(page, /1,002\.5/, 'Same-day workout volume is shown side by side');
  assert.match(page, /인과/, 'Side-by-side view states it is not causation');
  assert.doesNotMatch(page, /정상|비정상|비만|과체중|저체중|위험|건강 상태/);
  assert.doesNotMatch(page, /2024-03-18/);
});

test('empty period shows an empty trend without points', async () => {
  const ui = await openWeek();
  await ui.click('다음 기간');
  assert.equal(ui.bodyGets().at(-1)?.path, '/api/body-measurements?from=2024-03-11&to=2024-03-17');
  assert.match(ui.text(), /선택한 기간에 신체 기록이 없습니다/);
  for (const label of ['체중', '체지방률', '골격근량']) {
    const c = ui.chart(label);
    assert.equal(c.points, 0);
    assert.equal(c.lines, 0);
  }
  await ui.click('1달');
  assert.equal(ui.bodyGets().at(-1)?.path, '/api/body-measurements?from=2024-03-01&to=2024-03-31');
  assert.equal(ui.chart('체중').points, 5, 'Month view includes 3/3 and 3/18 weights');
});

test('partial input is sent with nulls; blank input is blocked; duplicate date keeps the form', async () => {
  const ui = await openWeek();
  await ui.click('신체 기록 추가');
  await ui.submit();
  assert.match(ui.text(), /하나 이상을 입력하세요/);
  assert.equal(ui.requests.filter((r) => r.method === 'POST').length, 0);

  await ui.change('측정 날짜', '2024-03-08');
  await ui.change('골격근량', '33.4');
  await ui.submit();
  const post = ui.requests.filter((r) => r.method === 'POST').at(-1);
  assert.deepEqual(post?.body, {
    date: '2024-03-08',
    body_weight_kg: null,
    body_fat_percent: null,
    skeletal_muscle_kg: 33.4,
  });
  assert.equal(ui.chart('골격근량').points, 2, 'Saved record is re-queried and plotted');
  assert.equal(ui.chart('체중').points, 3, 'No weight was estimated for the new date');

  await ui.click('신체 기록 추가');
  await ui.change('측정 날짜', '2024-03-04');
  await ui.change('체중', '71');
  await ui.submit();
  assert.match(ui.text(), /이미 있습니다/);
  const weightInput = ui.all((e) => e.type === 'label' && ui.text(e).trim().startsWith('체중'))[0];
  const input = ui.all((e) => e.type === 'input', weightInput)[0];
  assert.equal(input.props.value, '71', 'Input is kept after a conflict');
});

test('edit sends a full replacement via PUT and delete removes the record', async () => {
  const ui = await openWeek();
  await ui.click('2024-03-05 신체 기록 수정');
  const fatLabel = ui.all((e) => e.type === 'label' && ui.text(e).trim().startsWith('체지방률'))[0];
  assert.equal(ui.all((e) => e.type === 'input', fatLabel)[0].props.value, '19.8');
  await ui.change('체중', '71');
  await ui.submit();
  const put = ui.requests.filter((r) => r.method === 'PUT').at(-1);
  assert.equal(put?.path, '/api/body-measurements/3');
  assert.deepEqual(put?.body, {
    date: '2024-03-05',
    body_weight_kg: 71,
    body_fat_percent: 19.8,
    skeletal_muscle_kg: null,
  });
  // 3/4..3/7 now all have weight, so the whole week is one connected line.
  assert.equal(ui.chart('체중').points, 4);
  assert.equal(ui.chart('체중').lines, 1);

  await ui.click('2024-03-06 신체 기록 삭제');
  const del = ui.requests.filter((r) => r.method === 'DELETE').at(-1);
  assert.equal(del?.path, '/api/body-measurements/4');
  assert.doesNotMatch(ui.chart('체중').label, /2024-03-06/);
  assert.equal(ui.chart('체중').points, 3);
});
