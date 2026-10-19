import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Same dependency-free rendered-element approach as routines-ui.test.ts. Real file
// pickers, downloads, layout and focus need separate browser verification.
type Props = Record<string, unknown> & { children?: View };
type Element = { type: string | ((props: Props) => View); props: Props };
type View = Element | View[] | string | number | boolean | null | undefined;
type Summary = {
  mode: string;
  dry_run: boolean;
  tables: Record<string, { added: number; skipped: number; conflicts: number; deleted: number }>;
  conflicts: string[];
  retry_keys_cleared: number;
};
const summary = (mode: string, dry_run: boolean): Summary => ({
  mode,
  dry_run,
  tables: {
    brands: { added: 0, skipped: 4, conflicts: 0, deleted: mode === 'replace' ? 4 : 0 },
    machines: { added: 1, skipped: 0, conflicts: 1, deleted: mode === 'replace' ? 3 : 0 },
    workouts: { added: 7, skipped: 2, conflicts: 0, deleted: mode === 'replace' ? 5 : 0 },
    sets: { added: 21, skipped: 6, conflicts: 0, deleted: mode === 'replace' ? 15 : 0 },
    goals: { added: 1, skipped: 0, conflicts: 0, deleted: 0 },
    routines: { added: 0, skipped: 1, conflicts: 0, deleted: 0 },
  },
  conflicts: mode === 'merge' ? ['Arsenal Strength / 레그 프레스: 기존 값 유지'] : [],
  retry_keys_cleared: mode === 'replace' ? 3 : 0,
});
const backup = { format: 'workout-memo-backup', version: 1, data: { marker: randomUUID() } };

function mount(previewError?: string) {
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
  const storage = new Map<string, string>();
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
      JSON,
      setTimeout,
      clearTimeout,
      AbortController,
      crypto: { randomUUID },
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      },
      document: { getElementById: () => ({}), body: { style: { overflow: '' } } },
      window: { addEventListener() {}, removeEventListener() {} },
      confirm: () => true,
      fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
        const method = options.method ?? 'GET';
        const body = options.body ? JSON.parse(options.body) : undefined;
        requests.push({ path, method, body });
        const pathname = new URL(path, 'http://test').pathname;
        if (pathname === '/api/backup/preview') {
          if (previewError)
            return { ok: false, status: 400, json: async () => ({ error: previewError }) };
          return { ok: true, status: 200, json: async () => summary(String(body.mode), true) };
        }
        if (pathname === '/api/backup/restore')
          return { ok: true, status: 200, json: async () => summary(String(body.mode), false) };
        return { ok: true, status: 200, json: async () => [] };
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
  const findButton = (label: string) =>
    all(
      (e) => e.type === 'button' && (text(e).trim() === label || e.props['aria-label'] === label),
    )[0];
  async function click(label: string) {
    const button = findButton(label);
    assert.ok(button, `User can access ${label}`);
    assert.notEqual(button.props.disabled, true, `${label} is enabled`);
    (button.props.onClick as () => void)();
    await settle();
  }
  const control = (label: string) => {
    const found = all(
      (e) => (e.type === 'input' || e.type === 'select') && e.props['aria-label'] === label,
    )[0];
    assert.ok(found, `control ${label}`);
    return found;
  };
  async function change(label: string, target: unknown) {
    (control(label).props.onChange as (e: unknown) => void)({ target });
    await settle();
  }
  const file = (content: string, size = content.length) => ({
    name: 'workout-memo-backup-2026-10-19.json',
    size,
    text: async () => content,
  });
  return { requests, settle, all, text, click, change, control, findButton, file };
}

async function openBackup(ui: ReturnType<typeof mount>) {
  await ui.settle();
  await ui.click('백업·내보내기');
}

test('backup page separates the analysis CSV from the restore backup and states the policy', async () => {
  const ui = mount();
  await openBackup(ui);
  const links = ui.all((e) => e.type === 'a' && typeof e.props.href === 'string');
  const csv = links.find((e) => e.props.href === '/api/export/workouts.csv');
  const json = links.find((e) => e.props.href === '/api/backup');
  assert.ok(csv && json, 'Both downloads are offered');
  assert.notEqual(csv.props.download, undefined);
  assert.notEqual(json.props.download, undefined);
  const page = ui.text();
  assert.match(page, /분석용 CSV/);
  assert.match(page, /복원용 백업/);
  assert.match(page, /CSV는 복원에 사용할 수 없습니다/);
  assert.match(page, /총중량/);
  assert.match(page, /=, \+, -, @/);
  assert.match(page, /추가만/);
  assert.match(page, /동일한 기록은 건너뜁니다/);
  assert.match(page, /전체 교체/);
  assert.match(page, /재시도 키/);
  assert.equal(ui.requests.filter((r) => r.method !== 'GET').length, 0);
});

test('choosing a file shows an add-only preview before anything is restored', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.change('백업 파일 선택', { files: [ui.file(JSON.stringify(backup))] });
  const preview = ui.requests.filter((r) => r.path === '/api/backup/preview');
  assert.equal(preview.length, 1);
  assert.deepEqual(preview[0].body, { mode: 'merge', backup });
  assert.equal(ui.requests.filter((r) => r.path === '/api/backup/restore').length, 0);
  const page = ui.text();
  assert.match(page, /미리보기/);
  assert.match(page, /운동 일지.*추가 7.*건너뜀 2/s);
  assert.match(page, /세트.*추가 21/s);
  assert.match(page, /Arsenal Strength \/ 레그 프레스: 기존 값 유지/);
  assert.doesNotMatch(page, /삭제 5/);
  await ui.click('복원 실행');
  const restore = ui.requests.filter((r) => r.path === '/api/backup/restore');
  assert.equal(restore.length, 1);
  assert.deepEqual(restore[0].body, { mode: 'merge', backup });
  assert.match(ui.text(), /복원을 완료했습니다/);
  assert.equal(ui.findButton('복원 실행'), undefined, 'A completed restore cannot be resent');
});

test('replace mode previews deletions and requires the typed confirmation', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.change('백업 파일 선택', { files: [ui.file(JSON.stringify(backup))] });
  await ui.change('복원 방식', { value: 'replace' });
  const previews = ui.requests.filter((r) => r.path === '/api/backup/preview');
  assert.equal(previews.length, 2, 'Changing the mode refreshes the preview');
  assert.equal(previews[1].body?.mode, 'replace');
  assert.match(ui.text(), /기존 기록이 삭제됩니다/);
  assert.match(ui.text(), /진행 중이던 저장 재시도 기록도\s*초기화됩니다\(3건\)/);
  assert.match(ui.text(), /운동 일지.*삭제 5/s);
  const run = ui.findButton('복원 실행');
  assert.equal(run.props.disabled, true, 'Replace is locked until confirmed');
  await ui.change('확인 문구', { value: '전체교체' });
  assert.equal(ui.findButton('복원 실행').props.disabled, true);
  await ui.change('확인 문구', { value: '전체 교체' });
  await ui.click('복원 실행');
  const restore = ui.requests.filter((r) => r.path === '/api/backup/restore');
  assert.equal(restore.length, 1);
  assert.deepEqual(restore[0].body, { mode: 'replace', backup, confirm: '전체 교체' });
});

test('unreadable, oversized or rejected files never reach restore', async () => {
  const ui = mount();
  await openBackup(ui);
  await ui.change('백업 파일 선택', { files: [ui.file('{"format":')] });
  assert.match(ui.text(), /백업 파일을 읽을 수 없습니다/);
  await ui.change('백업 파일 선택', { files: [ui.file('{}', 10 * 1024 * 1024 + 1)] });
  assert.match(ui.text(), /10MB/);
  assert.equal(ui.requests.filter((r) => r.method === 'POST').length, 0);
  assert.equal(ui.findButton('복원 실행'), undefined);

  const rejected = mount('지원하지 않는 백업 버전입니다 (v2). 지원 버전: v1');
  await openBackup(rejected);
  await rejected.change('백업 파일 선택', { files: [rejected.file(JSON.stringify(backup))] });
  assert.match(rejected.text(), /지원하지 않는 백업 버전입니다/);
  assert.equal(rejected.findButton('복원 실행'), undefined);
  assert.equal(rejected.requests.filter((r) => r.path === '/api/backup/restore').length, 0);
});
