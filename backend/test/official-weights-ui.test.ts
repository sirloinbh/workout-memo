import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Same dependency-free rendered-element adapter as period-ui.test.ts. It checks rendered
// text and handlers; browser layout and link opening still need browser verification.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
const compile = (url: URL) =>
  ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
const source = compile(new URL('../../frontend/src/main.tsx', import.meta.url));
const brands = [
  { id: 1, name: 'Arsenal Strength' },
  { id: 2, name: 'Hammer Strength' },
  { id: 3, name: '기타' },
];
const bench = {
  id: 11,
  brand: 'Hammer Strength',
  lineup: 'Plate-Loaded',
  model_number: 'IL-BP',
  model_name: 'Iso-Lateral Bench Press',
  official_item_name: 'Starting Resistance (per arm)',
  setting: '',
  status: 'verified',
  raw_value: '7.00',
  raw_unit: 'lb',
  official_kg_text: '3.2 kg',
  weight_kg: '3.18',
  basis: 'per_arm',
  source_url:
    'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-bench-press',
  checked_date: '2026-10-19',
  notes: '',
};
const unknown = {
  ...bench,
  id: 12,
  brand: 'Arsenal Strength',
  lineup: 'Reloaded',
  model_number: '',
  model_name: 'Reloaded Multi-Flex',
  official_item_name: 'Starting Resistance',
  status: 'unverified',
  raw_value: null,
  raw_unit: null,
  official_kg_text: null,
  weight_kg: null,
  basis: null,
  source_url: null,
  notes: '제조사 공식 자료를 찾지 못했다.',
};
const linkedMachine = {
  id: 5,
  brand_id: 2,
  brand: 'Hammer Strength',
  name: '내 체스트 프레스',
  base_weight: null,
  notes: '',
  official_weight_id: 11,
  official_status: 'verified',
  official_model_name: bench.model_name,
  official_setting: '',
  official_raw_value: '7.00',
  official_raw_unit: 'lb',
  official_weight_kg: '3.18',
  official_basis: 'per_arm',
  official_source_url: bench.source_url,
  official_checked_date: '2026-10-19',
};

function mount(failReferences = false) {
  const mutations: { path: string; method: string; body: Record<string, unknown> }[] = [];
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
    useMemo(fn: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: fn(), deps };
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
  const modules = new Map<string, object>();
  const items = new Map<string, string>();
  const sandbox: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    },
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
        runInNewContext(compile(target), { ...sandbox, exports: moduleExports });
        return moduleExports;
      }
      if (name === 'react-dom/client')
        return { createRoot: () => ({ render: (v: Element) => void (root = v) }) };
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      throw Error(`Unexpected import: ${name}`);
    },
    Date,
    Intl,
    document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
    window: { addEventListener() {}, removeEventListener() {} },
    confirm: () => true,
    fetch: async (path: string, options: { method: string; body?: string }) => {
      const url = new URL(path, 'http://test');
      if (options.method !== 'GET') {
        mutations.push({ path, method: options.method, body: JSON.parse(options.body!) });
        return { ok: true, json: async () => ({ id: 99 }) };
      }
      if (url.pathname === '/api/official-machine-weights' && failReferences)
        return { ok: false, json: async () => ({ error: 'relation does not exist' }) };
      const data =
        url.pathname === '/api/machines'
          ? [linkedMachine]
          : url.pathname === '/api/brands'
            ? brands
            : url.pathname === '/api/official-machine-weights'
              ? [bench, unknown]
              : [];
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
  const button = (label: string) => {
    const found = all((e) => e.type === 'button' && text(e).trim() === label)[0];
    assert.ok(found, `button ${label}`);
    return found;
  };
  const labelled = (label: string, type: string) => {
    const found = all((e) => e.type === 'label' && text(e).startsWith(label)).flatMap((l) =>
      all((e) => e.type === type, l),
    )[0];
    assert.ok(found, `${type} ${label}`);
    return found;
  };
  return { settle, all, text, event, button, labelled, mutations, tree: () => tree };
}

test('machine library shows the linked official reference with basis and source, not as base weight', async () => {
  const ui = mount();
  await ui.settle();
  ui.event(ui.button('머신 라이브러리'), 'onClick');
  const row = ui.all((e) => e.props.className === 'workout-row')[0];
  const rowText = ui.text(row);
  assert.match(rowText, /공식 참고값\(Iso-Lateral Bench Press\): 7 lb = 3\.18 kg · 편측/);
  assert.match(rowText, /2026-10-19 확인/);
  assert.equal(ui.text(ui.all((e) => e.type === 'strong', row)[0]), '미입력');
  const link = ui.all((e) => e.type === 'a', row)[0];
  assert.equal(link.props.href, bench.source_url);
  assert.equal(link.props.rel, 'noreferrer');
});

test('journal machine select shows the official reference next to the user base weight', async () => {
  const ui = mount();
  await ui.settle();
  ui.event(ui.button('운동 기록하기'), 'onClick');
  const option = ui.all((e) => e.type === 'option' && e.props.value === 5)[0];
  assert.equal(
    ui.text(option),
    'Hammer Strength · 내 체스트 프레스 (기본중량 미확인) · 공식 참고값 7 lb = 3.18 kg · 편측',
  );
});

test('registering a machine links a reference without filling or changing base weight', async () => {
  const ui = mount();
  await ui.settle();
  ui.event(ui.button('머신 라이브러리'), 'onClick');
  ui.event(ui.button('머신 등록'), 'onClick');
  ui.event(ui.labelled('브랜드', 'select'), 'onChange', { target: { value: '2' } });
  const select = ui.labelled('공식 참고값', 'select');
  const options = ui.all((e) => e.type === 'option', select).map(ui.text);
  assert.deepEqual(options, [
    '연결 안 함',
    'Plate-Loaded · Iso-Lateral Bench Press — 7 lb = 3.18 kg · 편측',
  ]);
  ui.event(select, 'onChange', { target: { value: '11' } });
  const note = ui.all((e) => e.props.role === 'note')[0];
  assert.ok(note, 'Selected reference details are shown');
  const noteText = ui.text(note);
  assert.match(noteText, /공식 참고값: 7 lb = 3\.18 kg · 편측/);
  assert.match(noteText, /IL-BP · Starting Resistance \(per arm\) · 제조사 kg 표기 3\.2 kg/);
  assert.match(noteText, /2026-10-19 확인/);
  assert.match(noteText, /자동 반영되지 않습니다/);
  assert.equal(ui.all((e) => e.type === 'a', note)[0].props.href, bench.source_url);
  assert.equal(ui.labelled('기본중량', 'input').props.value, '', 'Base weight stays empty');
  ui.event(ui.labelled('머신 이름', 'input'), 'onChange', { target: { value: '벤치' } });
  ui.event(ui.all((e) => e.type === 'form')[0], 'onSubmit', { preventDefault() {} });
  await ui.settle();
  assert.equal(ui.mutations.length, 1);
  assert.equal(ui.mutations[0].path, '/api/machines');
  assert.equal(ui.mutations[0].body.official_weight_id, 11);
  assert.equal(ui.mutations[0].body.base_weight, null);
});

test('unverified references read 공식값 미확인 and changing brand clears a mismatched link', async () => {
  const ui = mount();
  await ui.settle();
  ui.event(ui.button('머신 라이브러리'), 'onClick');
  ui.event(ui.button('머신 등록'), 'onClick');
  ui.event(ui.labelled('브랜드', 'select'), 'onChange', { target: { value: '1' } });
  ui.event(ui.labelled('공식 참고값', 'select'), 'onChange', { target: { value: '12' } });
  const noteText = ui.text(ui.all((e) => e.props.role === 'note')[0]);
  assert.match(noteText, /공식 참고값: 공식값 미확인/);
  assert.match(noteText, /제조사 공식 자료를 찾지 못했다/);
  assert.match(noteText, /공식 출처 없음/);
  assert.doesNotMatch(noteText, /0 kg/);
  ui.event(ui.labelled('브랜드', 'select'), 'onChange', { target: { value: '3' } });
  assert.equal(ui.all((e) => e.props.role === 'note').length, 0);
  assert.ok(ui.all((e) => ui.text(e) === '이 브랜드의 공식 참고값 자료가 없습니다.').length > 0);
  ui.event(ui.labelled('머신 이름', 'input'), 'onChange', { target: { value: '기타 머신' } });
  ui.event(ui.all((e) => e.type === 'form')[0], 'onSubmit', { preventDefault() {} });
  await ui.settle();
  assert.equal(ui.mutations[0].body.official_weight_id, null);
});

test('a reference load failure does not block machines and is reported in the form', async () => {
  const ui = mount(true);
  await ui.settle();
  assert.equal(ui.all((e) => e.props.role === 'alert').length, 0);
  ui.event(ui.button('머신 라이브러리'), 'onClick');
  assert.equal(ui.all((e) => e.props.className === 'workout-row').length, 1);
  ui.event(ui.button('머신 등록'), 'onClick');
  assert.ok(ui.all((e) => ui.text(e) === '공식 참고값을 불러오지 못했습니다.').length > 0);
});
