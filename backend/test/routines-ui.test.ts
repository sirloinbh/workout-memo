import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { routineInput } from './routine-fixture.js';

// Same dependency-free rendered-element approach as period-ui.test.ts.
// Real browser layout, focus, native validation and React scheduling are outside
// this adapter's scope and must be verified separately by the implementation role.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;

function mount(failPost = false, failReadAfterPost = false, initialPlan = routineInput()) {
  let saved = { ...structuredClone(initialPlan), id: 27, schedule: [] };
  const requests: { path: string; method: string; body?: unknown }[] = [];
  const slots = new Map<string, { value?: unknown; deps?: unknown[] }[]>();
  let component = '';
  let cursor = 0;
  let root: View;
  let tree: View;
  let effects: (() => unknown)[] = [];
  const slot = () => {
    if (!slots.has(component)) slots.set(component, []);
    const list = slots.get(component)!;
    const index = cursor++;
    return { list, index };
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
    useMemo(fn: () => unknown, deps: unknown[]) {
      const { list, index } = slot();
      if (changed(list[index]?.deps, deps)) list[index] = { value: fn(), deps };
      return list[index].value;
    },
    useEffect(fn: () => unknown, deps: unknown[]) {
      const { list, index } = slot();
      if (changed(list[index]?.deps, deps)) effects.push(fn);
      list[index] = { deps };
    },
  };
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
      FormData,
      setTimeout,
      clearTimeout,
      document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
      window: { addEventListener() {}, removeEventListener() {} },
      confirm: () => true,
      fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
        requests.push({
          path,
          method: options.method ?? 'GET',
          body: options.body ? JSON.parse(options.body) : undefined,
        });
        const pathname = new URL(path, 'http://test').pathname;
        if (
          failReadAfterPost &&
          pathname === '/api/routines/27' &&
          requests.some((r) => r.method === 'POST')
        )
          return { ok: false, status: 503, json: async () => ({ error: '저장 후 조회 실패' }) };
        if (pathname === '/api/routines' && options.method === 'POST') {
          if (failPost)
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: '휴식 요일과 주당 운동 횟수를 확인하세요' }),
            };
          saved = { ...JSON.parse(options.body!), id: 27, schedule: [] };
          return { ok: true, status: 201, json: async () => ({ id: 27 }) };
        }
        const data =
          pathname === '/api/routines' ? [saved] : pathname === '/api/routines/27' ? saved : [];
        return { ok: true, status: 200, json: async () => structuredClone(data) };
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
      (element) =>
        element.type === 'button' &&
        (text(element).trim() === label || element.props['aria-label'] === label),
    )[0];
    assert.ok(button, `User can access ${label}`);
    assert.equal(typeof button.props.onClick, 'function');
    (button.props.onClick as () => void)();
    await settle();
  }
  async function change(label: string, value: string, index = 0, checked?: boolean) {
    const item = all(
      (element) => element.type === 'label' && text(element).trim().startsWith(label),
    )[index];
    assert.ok(item, `Input label ${label} #${index} exists`);
    const input = all((element) => element.type === 'input' || element.type === 'select', item)[0];
    assert.ok(input);
    (input.props.onChange as (e: unknown) => void)({ target: { value, checked } });
    await settle();
  }
  async function submit() {
    const form = all((element) => element.type === 'form')[0];
    assert.ok(form);
    (form.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await settle();
  }
  return { saved, requests, settle, all, text, click, change, submit };
}

test('routine screen re-queries saved plans and displays all 12 manual weeks with distinct deloads', async () => {
  const ui = mount();
  await ui.settle();
  await ui.click('루틴짜기');
  assert.ok(
    ui.requests.some((request) => request.path === '/api/routines' && request.method === 'GET'),
  );
  assert.match(ui.text(), /수동 12주 루틴/);
  // The list may show the complete plan or expose a detail button.
  const detail = ui.all(
    (element) => element.type === 'button' && ui.text(element).includes('계획 보기'),
  )[0];
  if (detail) {
    (detail.props.onClick as () => void)();
    await ui.settle();
  }
  for (let week = 1; week <= 12; week++)
    assert.match(ui.text(), new RegExp(`(?:^|\\D)${week}주차`));
  for (const week of [4, 8, 12]) {
    const row = ui.all(
      (element) =>
        ['tr', 'li', 'article', 'section'].includes(String(element.type)) &&
        new RegExp(`(?:^|\\D)${week}주차`).test(ui.text(element)) &&
        /디로딩/.test(ui.text(element)) &&
        !/(?:^|\D)1주차/.test(ui.text(element)),
    );
    assert.ok(row.length > 0, `Week ${week} has its own deload label`);
  }
  assert.match(ui.text(), /7\.25/);
  assert.match(ui.text(), /100\.25/);
  for (const part of ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'])
    assert.ok(ui.text().includes(part));
  assert.ok((ui.text().match(/가슴/g) ?? []).length >= 3, 'Repeated body parts remain visible');
  assert.equal(
    ui.requests.filter((request) => request.method !== 'GET').length,
    0,
    'Viewing a plan must not create workouts or achievement goals',
  );
  // A fresh mount has no component state and must recover the same server plan.
  const reopened = mount();
  await reopened.settle();
  await reopened.click('루틴짜기');
  assert.match(reopened.text(), /수동 12주 루틴/);
});

for (const failRead of [false, true]) {
  test(`routine form saves explicit schedule, duplicate parts, baselines and every manual week; follow-up read failure=${failRead}`, async () => {
    const ui = mount(false, failRead);
    const expected = routineInput(1);
    expected.name = '새로 작성한 루틴 27';
    expected.weeks[7] = { week: 8, kind: 'deload', amount: 1, deload_metric: 'sets' };
    expected.weeks[11] = { week: 12, kind: 'deload', amount: 3, deload_metric: 'reps' };
    await ui.settle();
    await ui.click('루틴짜기');
    await ui.click('새 루틴 만들기');
    await ui.change('루틴 이름', expected.name);
    await ui.change('시작일', expected.start_date);
    await ui.change('주당 운동 횟수', '3');
    for (const day of ['일', '화', '목', '토']) await ui.change(day, '', 0, true);
    for (const part of expected.splits[0].body_parts) await ui.click(part + ' 추가');
    await ui.click('운동 추가');
    for (const [i, ex] of expected.splits[0].exercises.entries()) {
      await ui.change('운동명', ex.exercise, i);
      await ui.change('기준 세트 수', String(ex.sets), i);
      await ui.change('기준 총중량 (kg, 머신 기본중량 포함)', String(ex.weight), i);
      await ui.change('기준 반복 수', String(ex.reps), i);
    }
    // Select inputs contain option text, so select the control within its week fieldset.
    for (const w of expected.weeks) {
      const field = ui.all(
        (el) => el.type === 'fieldset' && ui.text(el).startsWith(`${w.week}주차`),
      )[0];
      assert.ok(field);
      const select = ui.all((el) => el.type === 'select', field)[0];
      (select.props.onChange as (e: unknown) => void)({
        target: { value: w.deload_metric ?? w.kind },
      });
      await ui.settle();
      await ui.change(
        w.kind === 'deload' ? '감소량' : '증가량',
        String(w.amount),
        w.kind === 'deload' ? w.week / 4 - 1 : w.week - 1 - Math.floor(w.week / 4),
      );
    }
    await ui.submit();
    const post = ui.requests.find((r) => r.method === 'POST');
    assert.ok(post);
    assert.deepEqual(post.body, expected);
    assert.ok(ui.requests.some((r) => r.path === '/api/routines/27'));
    assert.match(ui.text(), /7\.25/);
    assert.match(ui.text(), /100\.25/);
    assert.match(ui.text(), /12주차 · 디로딩/);
    assert.equal(ui.all((el) => el.type === 'form').length, 0, 'Successful save closes the draft');
    assert.equal(ui.requests.filter((r) => r.method !== 'GET').length, 1);
    assert.match(ui.text(), /루틴 #27을 저장했습니다/);
    if (failRead) assert.match(ui.text(), /저장 후 조회 실패/);
    else {
      // Use the actual posted plan, not the default fixture, in a new component session.
      const reopened = mount(false, false, post.body as ReturnType<typeof routineInput>);
      await reopened.settle();
      await reopened.click('루틴짜기');
      await reopened.click('계획 보기');
      assert.ok(reopened.requests.some((r) => r.path === '/api/routines/27'));
      assert.match(reopened.text(), /새로 작성한 루틴 27/);
      assert.match(reopened.text(), /무분할 · 시작일 2024-02-29 · 주 3회/);
      assert.ok(reopened.text().includes(expected.splits[0].body_parts.join(' → ')));
      assert.match(reopened.text(), /5주차 · 총중량 kg 7\.25 증가/);
      assert.match(reopened.text(), /8주차 · 디로딩 · 세트 수 1 감소/);
      assert.match(reopened.text(), /12주차 · 디로딩 · 반복 수 3 감소/);
      assert.equal(reopened.requests.filter((r) => r.method !== 'GET').length, 0);
    }
  });
}

test('routine editor exposes all five splits and keeps a failed save available for correction', async () => {
  const ui = mount(true);
  await ui.settle();
  await ui.click('루틴짜기');
  await ui.click('새 루틴 만들기');
  for (const n of [1, 2, 3, 4, 5]) {
    await ui.change('분할 방식', String(n));
    assert.equal(
      ui.all((el) => el.type === 'label' && ui.text(el).trim() === '분할 이름').length,
      n,
    );
  }
  await ui.change('루틴 이름', '실패 후 보존');
  await ui.click('가슴 추가');
  await ui.click('가슴 추가');
  await ui.submit();
  assert.match(ui.text(), /휴식 요일과 주당 운동 횟수를 확인하세요/);
  assert.equal(ui.all((el) => el.type === 'form').length, 1);
  assert.equal(ui.all((el) => el.type === 'input' && el.props.value === '실패 후 보존').length, 1);
  const posted = ui.requests.find((r) => r.method === 'POST')!.body as ReturnType<
    typeof routineInput
  >;
  assert.equal(posted.split_count, 5);
  assert.deepEqual(posted.splits[0].body_parts, ['가슴', '가슴']);
  assert.equal(
    ui.all((el) => el.type === 'button' && ui.text(el).trim() === '루틴 저장하기')[0].props
      .disabled,
    false,
  );
});

test('new routine requires explicit manual amounts and removes only the selected duplicate body part', async () => {
  const ui = mount();
  await ui.settle();
  await ui.click('루틴짜기');
  await ui.click('새 루틴 만들기');
  for (let week = 1; week <= 12; week++) {
    const field = ui.all(
      (el) => el.type === 'fieldset' && ui.text(el).startsWith(`${week}주차`),
    )[0];
    assert.ok(field);
    const amount = ui.all((el) => el.type === 'input', field)[0];
    assert.equal(amount.props.value, '', `Week ${week} has no automatic change amount`);
    if (week % 4 === 0) {
      assert.match(ui.text(field), /디로딩/);
      assert.equal(ui.all((el) => el.type === 'select', field)[0].props.value, '');
    }
  }
  await ui.click('가슴 추가');
  await ui.click('등 추가');
  await ui.click('가슴 추가');
  await ui.click('분할 1 부위 1 삭제');
  const partList = ui.all((el) => el.type === 'ol' && ui.text(el).includes('삭제'))[0];
  assert.ok(partList);
  assert.deepEqual(
    ui.all((el) => el.type === 'li', partList).map((el) => ui.text(el).replace('삭제', '').trim()),
    ['등', '가슴'],
    'Removing one occurrence preserves the other occurrence and order',
  );
  assert.equal(ui.requests.filter((r) => r.method !== 'GET').length, 0);
});
