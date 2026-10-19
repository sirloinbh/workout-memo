import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { routineSchema, type RoutinePlan } from '../src/domain.js';
import { routineProgress } from '../src/progress.js';
import { autoRoutineInput, routineInput } from './routine-fixture.js';

// Same dependency-free rendered-element adapter as routines-ui.test.ts. The server
// is simulated with the real progress functions so previews match applied results.
// Browser layout, focus, native validation and React scheduling are not covered.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
type Request = { path: string; method: string; body?: unknown; key?: string };

const plan = routineSchema.parse(routineInput(2)) as RoutinePlan;
const today = '2024-03-04'; // Monday, the second training slot: split 2, week 1.

function mount(options: { routine?: boolean; plan?: RoutinePlan } = {}) {
  const storage = new Map<string, string>();
  let rests: string[] = [];
  const requests: Request[] = [];
  let holdRest: Promise<void> | undefined;
  const serverProgress = () =>
    options.routine === false
      ? { today, routine: null }
      : {
          routine: { id: 7, name: '수동 12주 루틴', splits: 2 },
          ...routineProgress(options.plan ?? plan, rests, today),
          previous: {
            스쿼트: {
              date: '2024-03-01',
              sets: [
                { weight: 100, reps: 10 },
                { weight: 100, reps: 9 },
              ],
            },
          },
        };
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
          const target = ['.ts', '.tsx', '']
            .map((ext) => new URL(name + ext, url))
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
      setTimeout,
      clearTimeout,
      AbortController,
      crypto: { randomUUID },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
      window: { addEventListener() {}, removeEventListener() {} },
      confirm: () => true,
      fetch: async (
        path: string,
        init: { method?: string; body?: string; headers?: Record<string, string> } = {},
      ) => {
        const method = init.method ?? 'GET';
        requests.push({
          path,
          method,
          body: init.body ? JSON.parse(init.body) : undefined,
          key: init.headers?.['Idempotency-Key'],
        });
        const pathname = new URL(path, 'http://test').pathname;
        if (pathname === '/api/routine-progress') return json(200, serverProgress());
        if (pathname === '/api/routines/7/rests' && method === 'POST') {
          const pending = holdRest;
          holdRest = undefined;
          await pending;
          if (rests.includes(today)) return json(200, { applied: false, ...serverProgress() });
          rests = [...rests, today];
          return json(201, { applied: true, ...serverProgress() });
        }
        if (pathname === `/api/routines/7/rests/${today}` && method === 'DELETE') {
          rests = rests.filter((d) => d !== today);
          return json(200, { applied: true, ...serverProgress() });
        }
        if (pathname === '/api/workouts' && method === 'POST')
          return json(201, { id: 42, version: 1 });
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
  function render() {
    tree = expand(root);
    const pending = effects;
    effects = [];
    pending.forEach((fn) => fn());
  }
  async function settle() {
    for (let i = 0; i < 6; i++) {
      render();
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
  function button(label: string) {
    const found = all(
      (e) => e.type === 'button' && (text(e).trim() === label || e.props['aria-label'] === label),
    )[0];
    assert.ok(found, `User can access ${label}`);
    return found;
  }
  async function click(label: string) {
    const found = button(label);
    assert.notEqual(found.props.disabled, true, `${label} is enabled`);
    (found.props.onClick as () => void)();
    await settle();
  }
  const setRows = () => all((e) => e.props.className === 'set-editor');
  function field(row: Element, label: string) {
    const item = all((e) => e.type === 'label' && text(e).trim().startsWith(label), row)[0];
    assert.ok(item, `set field ${label}`);
    return all((e) => e.type === 'input' || e.type === 'select', item)[0];
  }
  async function change(row: Element, label: string, value: string) {
    (field(row, label).props.onChange as (e: unknown) => void)({ target: { value } });
    await settle();
  }
  async function submit() {
    const form = all((e) => e.type === 'form')[0];
    assert.ok(form, 'journal form is open');
    (form.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await settle();
  }
  return {
    storage,
    requests,
    settle,
    all,
    text,
    button,
    click,
    setRows,
    field,
    change,
    submit,
    holdNextRest() {
      let resolve!: () => void;
      holdRest = new Promise<void>((res) => (resolve = res));
      return { resolve };
    },
  };
}
type UI = ReturnType<typeof mount>;
async function openJournal(ui: UI) {
  await ui.settle();
  await ui.click('운동 일지');
}
const posts = (ui: UI, path: string) =>
  ui.requests.filter((r) => r.method !== 'GET' && r.path === path);

test('journal shows per-exercise targets for today, this week and all 12 weeks', async () => {
  const ui = mount();
  await openJournal(ui);
  const card = ui.all((e) => e.props['aria-label'] === '루틴 목표')[0];
  assert.ok(card, 'routine goals card is on the journal page');
  const content = ui.text(card);
  assert.match(content, /오늘 목표 · 2024-03-04/);
  assert.match(content, /1주차 · 분할 2 · 총중량 2\.5 kg 증가/);
  assert.match(content, /스쿼트 3세트 · 총중량 102\.75 kg · 10회/);
  assert.match(content, /맨몸 런지 2세트 · 총중량 2\.5 kg · 12회/);
  assert.match(content, /기준 3세트 · 100\.25 kg · 10회/);
  assert.match(content, /직전 기록 2024-03-01 · 100 kg × 10회, 100 kg × 9회/);
  assert.match(content, /직전 기록 없음/, 'an exercise without history says so');
  assert.doesNotMatch(content, /105\.25|합계/, 'weights of different exercises are not summed');
  for (const date of ['2024-03-01', '2024-03-04', '2024-03-06'])
    assert.match(content, new RegExp(date));
  const rows = ui.all((e) => e.type === 'tr' && /^\d+주차/.test(ui.text(e)));
  assert.equal(rows.length, 12);
  assert.match(ui.text(rows[3]), /4주차디로딩 · 총중량 12\.5 kg 감소/);
  assert.equal(
    ui.requests.filter((r) => r.method !== 'GET').length,
    0,
    'showing goals never creates a record',
  );
});

test('returning to the journal reloads routine goals so a routine saved elsewhere appears', async () => {
  const ui = mount();
  await openJournal(ui);
  const loads = () => ui.requests.filter((r) => r.path === '/api/routine-progress').length;
  const before = loads();
  await ui.click('대시보드');
  await ui.click('운동 일지');
  assert.ok(loads() > before, 'switching pages fetches the active routine again');
});

test('without a started routine the journal shows guidance to create one', async () => {
  const ui = mount({ routine: false });
  await openJournal(ui);
  assert.match(ui.text(), /진행 중인 루틴이 없습니다\. 루틴짜기에서/);
  assert.equal(
    ui.all((e) => e.type === 'button' && ui.text(e) === '오늘 루틴으로 기록하기').length,
    0,
  );
});

test('prefilled routine draft saves unchanged values with one confirm', async () => {
  const ui = mount();
  await openJournal(ui);
  await ui.click('오늘 루틴으로 기록하기');
  const rows = ui.setRows();
  assert.equal(rows.length, 5, 'one row per planned set: 3 squat + 2 lunge');
  assert.equal(ui.field(rows[0], '운동명').props.value, '스쿼트');
  assert.equal(Number(ui.field(rows[0], '총중량').props.value), 102.75);
  assert.equal(Number(ui.field(rows[0], '횟수').props.value), 10);
  assert.equal(ui.field(rows[0], '머신').props.value, '', 'machine stays unselected');
  assert.equal(ui.field(rows[4], '운동명').props.value, '맨몸 런지');
  assert.match(ui.text(rows[0]), /오늘 목표 102\.75 kg × 10회 · 직전 기록 2024-03-01/);
  assert.equal(posts(ui, '/api/workouts').length, 0, 'the draft is not a record before saving');
  assert.ok(ui.storage.size > 0, 'the draft is kept locally like any other draft');
  await ui.submit();
  const [saved] = posts(ui, '/api/workouts');
  assert.ok(saved?.key, 'save uses the idempotent journal flow');
  const body = saved.body as {
    date: string;
    title: string;
    sets: { exercise: string; weight: number; reps: number; machine_id: null }[];
  };
  assert.equal(body.date, today);
  assert.equal(body.title, '수동 12주 루틴 · 분할 2');
  assert.deepEqual(
    body.sets.map((s) => [s.exercise, s.weight, s.reps, s.machine_id]),
    [
      ['스쿼트', 102.75, 10, null],
      ['스쿼트', 102.75, 10, null],
      ['스쿼트', 102.75, 10, null],
      ['맨몸 런지', 2.5, 12, null],
      ['맨몸 런지', 2.5, 12, null],
    ],
  );
  assert.equal(ui.storage.size, 0, 'acknowledged save clears the draft');
  assert.match(ui.text(), /서버 저장 완료/);
  assert.ok(
    ui.requests.filter((r) => r.path === '/api/routine-progress').length >= 2,
    'previous-record references reload after saving',
  );
});

test('prefilled draft lets the user edit reps and add a non-routine exercise', async () => {
  const ui = mount();
  await openJournal(ui);
  await ui.click('오늘 루틴으로 기록하기');
  await ui.change(ui.setRows()[2], '횟수', '8');
  await ui.click('다른 운동 추가');
  const added = ui.setRows()[5];
  assert.ok(added, 'a blank row is added for another exercise');
  assert.equal(ui.field(added, '운동명').props.value, '');
  await ui.change(added, '운동명', '케이블 크런치');
  await ui.change(ui.setRows()[5], '총중량', '35');
  await ui.change(ui.setRows()[5], '횟수', '15');
  assert.doesNotMatch(ui.text(ui.setRows()[5]), /오늘 목표/, 'no routine reference for others');
  await ui.submit();
  const body = posts(ui, '/api/workouts')[0].body as {
    sets: { exercise: string; weight: number; reps: number }[];
  };
  assert.equal(body.sets.length, 6);
  assert.deepEqual(
    body.sets.map((s) => s.reps),
    [10, 10, 8, 12, 12, 15],
  );
  assert.deepEqual(body.sets[5], {
    exercise: '케이블 크런치',
    machine_id: null,
    weight: 35,
    reps: 15,
    notes: '',
  });
});

test('rest shows the preview first, applies once on rapid clicks and can be cancelled today', async () => {
  const ui = mount();
  await openJournal(ui);
  await ui.click('오늘 하루 휴식하기');
  const preview = ui.all((e) => e.props['aria-label'] === '휴식 전 확인')[0];
  assert.ok(preview, 'preview is shown before any change');
  assert.match(ui.text(preview), /1주차 · 분할 2 · 2024-03-04 → 2024-03-06/);
  assert.match(ui.text(preview), /12주차 디로딩 · 분할 2 · 2024-05-22 → 제외됨/);
  assert.match(ui.text(preview), /제외될 마지막 목표: 12주차 디로딩 · 분할 2 \(36번째 목표\)/);
  assert.equal(posts(ui, '/api/routines/7/rests').length, 0, 'preview sends nothing');
  const pending = ui.holdNextRest();
  const confirm = ui.button('휴식 확정').props.onClick as () => void;
  confirm();
  confirm(); // A second click from the same render before the response.
  pending.resolve();
  await ui.settle();
  assert.equal(posts(ui, '/api/routines/7/rests').length, 1);
  assert.deepEqual(posts(ui, '/api/routines/7/rests')[0].body, { date: today });
  assert.match(ui.text(), /오늘은 휴식일로 지정했습니다/);
  assert.equal(
    ui.all((e) => e.type === 'button' && ui.text(e) === '오늘 루틴으로 기록하기').length,
    0,
  );
  const excludedRow = ui.all((e) => e.type === 'li' && e.props.className === 'excluded');
  assert.equal(excludedRow.length, 1);
  assert.match(ui.text(excludedRow[0]), /제외됨 · 분할 2/);
  await ui.click('휴식 취소');
  assert.equal(posts(ui, `/api/routines/7/rests/${today}`).length, 1);
  assert.match(ui.text(), /스쿼트 3세트 · 총중량 102\.75 kg · 10회/);
  assert.equal(ui.all((e) => e.type === 'li' && e.props.className === 'excluded').length, 0);
  assert.equal(posts(ui, '/api/workouts').length, 0, 'rest never writes journals');
});

test('auto routine targets show firm values today and label future sessions as projected', async () => {
  // Auto fixture starts Monday 2024-03-04, so today is its first session.
  const ui = mount({ plan: routineSchema.parse(autoRoutineInput()) as RoutinePlan });
  await openJournal(ui);
  const card = ui.all((e) => e.props['aria-label'] === '루틴 목표')[0];
  const content = ui.text(card);
  assert.match(content, /자동 목표/);
  assert.match(content, /벤치프레스 3세트 · 총중량 100 kg · 10회/);
  const today = ui.all((e) => e.props.className === 'target-list')[0];
  assert.doesNotMatch(ui.text(today), /예상/, "today's target is not a projection");
  const rows = ui.all((e) => e.type === 'tr' && /^\d+주차/.test(ui.text(e)));
  assert.match(ui.text(rows[1]), /예상/);
  assert.match(ui.text(rows[3]), /4주차디로딩 · 자동/);
  assert.match(ui.text(rows[4]), /벤치프레스 3세트 · 총중량 105 kg · 8회/);
  await ui.click('오늘 루틴으로 기록하기');
  assert.equal(ui.setRows().length, 9, '3 exercises × 3 sets');
  assert.equal(Number(ui.field(ui.setRows()[0], '총중량').props.value), 100);
});
