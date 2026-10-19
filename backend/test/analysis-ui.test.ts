import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { analyze, type AnalysisSet } from '../src/analysis.js';

// Same dependency-free rendered-element adapter as routines-ui.test.ts. The
// in-memory API reuses the real server-side analysis function on fixed rows.
// Browser layout, focus and React scheduling still need browser verification.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
type Row = Omit<AnalysisSet, 'id' | 'exercise_key'>;

function mount(initialRows: Row[] = []) {
  const server = {
    rows: structuredClone(initialRows),
    mappings: [] as { exercise: string; body_part: string }[],
  };
  const requests: { path: string; method: string; body?: unknown }[] = [];
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
  // A UTC device at 00:30 Seoul time on Thursday 2026-10-15.
  class FixedDate extends Date {
    constructor(...args: [] | [string | number]) {
      super(...((args.length ? args : ['2026-10-14T15:30:00Z']) as [string]));
    }
    static now() {
      return Date.parse('2026-10-14T15:30:00Z');
    }
  }
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
          return {
            createRoot: () => ({
              render: (view: View) => {
                root = view;
              },
            }),
          };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        if (name.endsWith('.css')) return {};
        if (name.startsWith('.')) {
          const target = ['.ts', '.tsx', '']
            .map((ext) => new URL(name + ext, url))
            .find(existsSync);
          assert.ok(target, `Frontend module ${name} exists`);
          return load(target);
        }
        throw Error(`Unsupported frontend import: ${name}`);
      },
      Date: FixedDate,
      Intl,
      console,
      URL,
      setTimeout,
      clearTimeout,
      AbortController,
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
      document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
      window: { addEventListener() {}, removeEventListener() {} },
      confirm: () => true,
      fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
        const method = options.method ?? 'GET';
        const body = options.body ? JSON.parse(options.body) : undefined;
        requests.push({ path, method, body });
        const url = new URL(path, 'http://test');
        let data: unknown = [];
        if (url.pathname === '/api/exercise-body-parts' && method === 'PUT') {
          const key = body.exercise.trim().toLowerCase();
          server.mappings = [
            ...server.mappings.filter((m) => m.exercise !== key),
            ...body.body_parts.map((body_part: string) => ({ exercise: key, body_part })),
          ];
          data = { exercise: key, body_parts: body.body_parts };
        } else if (url.pathname === '/api/analysis') {
          const today = '2026-10-15';
          const rows = server.rows
            .filter((r) => r.date <= today)
            .map((r, id) => ({ ...r, id, exercise_key: r.exercise.trim().toLowerCase() }));
          data = {
            ...analyze(
              rows,
              server.mappings,
              url.searchParams.get('from')!,
              url.searchParams.get('to')!,
            ),
            today,
          };
        }
        return { ok: true, status: 200, json: async () => structuredClone(data) };
      },
    });
    return exports;
  }
  load(new URL('../../frontend/src/main.tsx', import.meta.url));
  // Components that are no longer rendered lose their state, like a React unmount.
  let rendered = new Set<string>();
  function expand(view: View, path = 'root'): View {
    if (Array.isArray(view)) return view.map((child, i) => expand(child, `${path}.${i}`));
    if (!view || typeof view !== 'object') return view;
    if (typeof view.type === 'function') {
      component = `${path}:${view.type.name}`;
      rendered.add(component);
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
      rendered = new Set();
      tree = expand(root);
      for (const key of slots.keys()) if (!rendered.has(key)) slots.delete(key);
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
    // React renders the number 0, so only nullish and boolean children are empty.
    if (view === null || view === undefined || typeof view === 'boolean') return '';
    return typeof view === 'object'
      ? view.props.children === undefined
        ? ''
        : text(view.props.children)
      : String(view);
  }
  async function click(label: string) {
    const button = all(
      (element) =>
        element.type === 'button' &&
        (text(element).trim() === label || element.props['aria-label'] === label),
    )[0];
    assert.ok(button, `User can access ${label}`);
    (button.props.onClick as () => void)();
    await settle();
  }
  const analysisRequests = () =>
    requests.filter((r) => r.path.startsWith('/api/analysis')).map((r) => r.path);
  const partRow = (week: string, name: string) => {
    const article = all(
      (e) => e.props.className === 'analysis-week' && text(e).startsWith(week),
    )[0];
    assert.ok(article, `week ${week}`);
    const row = all((e) => e.type === 'tr' && text(e).startsWith(name), article)[0];
    assert.ok(row, `row ${name}`);
    return text(row);
  };
  const exercise = (name: string) => {
    const card = all(
      (e) =>
        e.props.className === 'exercise-pr' && text(all((h) => h.type === 'h3', e)[0]) === name,
    )[0];
    assert.ok(card, `exercise ${name}`);
    return card;
  };
  return { server, requests, settle, all, text, click, analysisRequests, partRow, exercise };
}

const row = (
  date: string,
  exercise: string,
  weight: number,
  reps: number,
  unknown_base = false,
) => ({
  date,
  exercise,
  weight,
  reps,
  unknown_base,
});

test('empty analysis shows Monday-start week totals, 미분류 and the 1RM policy', async () => {
  const ui = mount();
  await ui.settle();
  await ui.click('종목 분석');
  assert.deepEqual(ui.analysisRequests(), ['/api/analysis?from=2026-10-12&to=2026-10-18']);
  assert.match(ui.text(), /분석할 기록이 없습니다/);
  assert.match(ui.text(), /추정 1RM = 총중량 kg × \(1 \+ 반복 수 ÷ 30\)/);
  assert.match(ui.text(), /1~10회 세트에만 적용/);
  assert.match(ui.text(), /실측 1RM/);
  assert.match(ui.text(), /부위별 합계가 주간 전체보다 클 수 있습니다/);
  assert.match(ui.text(), /2026-10-12 — 2026-10-18 · 전체 0세트 · 0kg/);
  assert.equal(ui.partRow('2026-10-12', '미분류'), '미분류0세트0kg');
  assert.equal(ui.requests.filter((r) => r.method !== 'GET').length, 0);
});

test('4 and 12 week tabs request Monday-aligned ranges ending with the anchor week', async () => {
  const ui = mount();
  await ui.settle();
  await ui.click('종목 분석');
  await ui.click('4주');
  await ui.click('12주');
  const date = ui.all((e) => e.props['aria-label'] === '분석 기준 날짜')[0];
  (date.props.onChange as (e: unknown) => void)({ target: { value: '2025-01-05' } });
  await ui.settle();
  assert.deepEqual(ui.analysisRequests(), [
    '/api/analysis?from=2026-10-12&to=2026-10-18',
    '/api/analysis?from=2026-09-21&to=2026-10-18',
    '/api/analysis?from=2026-07-27&to=2026-10-18',
    '/api/analysis?from=2024-10-14&to=2025-01-05',
  ]);
});

test('PRs show ties, exclusions and trends; mapping and journal changes recompute on read', async () => {
  const ui = mount([
    row('2026-10-12', 'Bench Press', 100, 5),
    row('2026-10-13', 'bench press', 100, 5),
    row('2026-10-13', 'Bench Press', 0, 12),
    row('2026-10-14', 'Bench Press', 60, 1, true),
    row('2026-10-14', 'Row', 80, 8),
    row('2026-10-16', 'Bench Press', 300, 1),
  ]);
  await ui.settle();
  await ui.click('종목 분석');
  const bench = ui.exercise('Bench Press');
  const text = ui.text(bench);
  assert.match(text, /최고 중량100kg × 5회 · 2026-10-12 · 동률 2회/, 'Future 300 kg excluded');
  assert.match(text, /최다 반복12회 · 0kg · 2026-10-13/);
  assert.match(text, /실측 1RM1회 세트 기록 없음/);
  assert.match(text, /추정 1RM \(Epley\)116\.67kg 추정 \(100kg × 5회\) · 2026-10-12 · 동률 2회/);
  assert.match(text, /기본중량 미확인 머신 세트 1개는 1RM 계산에서 제외/);
  assert.match(text, /0kg 세트 1개는 반복 PR에만 포함/);
  assert.match(text, /부위: 미분류/);
  const trend = ui.all((e) => e.props.role === 'img', bench)[0].props['aria-label'] as string;
  assert.match(trend, /2026-10-12 최고 중량 100kg, 최다 5회, 추정 1RM 116\.67kg/);
  assert.match(trend, /2026-10-14 최고 중량 60kg, 최다 1회, 추정 1RM 제외/);
  assert.equal(ui.partRow('2026-10-12', '미분류'), '미분류5세트1,700kg');

  await ui.click('Bench Press 부위 지정');
  await ui.click('어깨');
  await ui.click('가슴');
  await ui.click('부위 저장');
  const put = ui.requests.find((r) => r.method === 'PUT');
  assert.deepEqual(put?.body, { exercise: 'Bench Press', body_parts: ['가슴', '어깨'] });
  assert.match(ui.text(ui.exercise('Bench Press')), /부위: 가슴, 어깨/);
  assert.equal(ui.partRow('2026-10-12', '가슴'), '가슴4세트1,060kg');
  assert.equal(ui.partRow('2026-10-12', '어깨'), '어깨4세트1,060kg');
  assert.equal(ui.partRow('2026-10-12', '미분류'), '미분류1세트640kg');
  assert.match(ui.text(), /2026-10-12 — 2026-10-18 · 전체 5세트 · 1,700kg/);

  // Journal edits/deletes happen elsewhere; returning re-reads the server records.
  ui.server.rows = ui.server.rows
    .filter((r) => r.date !== '2026-10-12')
    .map((r) => (r.exercise === 'Row' ? { ...r, weight: 90 } : r));
  await ui.click('운동 일지');
  await ui.click('종목 분석');
  const updated = ui.text(ui.exercise('Bench Press'));
  assert.match(updated, /최고 중량100kg × 5회 · 2026-10-13최다/, 'The former tie is gone');
  assert.match(ui.text(ui.exercise('Row')), /최고 중량90kg × 8회/);
  assert.equal(ui.partRow('2026-10-12', '미분류'), '미분류1세트720kg');
});
