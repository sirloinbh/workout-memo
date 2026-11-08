import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { type AnalysisSet, analyze } from '../../backend/src/analysis';
import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/analysis-ui.test.ts (vm hook harness) to a real DOM. The
// in-memory API reuses the real server-side analysis function on fixed rows.
type Row = Omit<AnalysisSet, 'id' | 'exercise_key'>;
type Mapping = { exercise: string; body_parts: string[] };

function mount(initialRows: Row[] = []) {
  // A UTC device at 00:30 Seoul time on Thursday 2026-10-15.
  fixClock();
  const server = {
    rows: structuredClone(initialRows),
    mappings: [] as { exercise: string; body_part: string }[],
  };
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/exercise-body-parts' && method === 'PUT') {
      const mapping = body as Mapping;
      const key = mapping.exercise.trim().toLowerCase();
      server.mappings = [
        ...server.mappings.filter((m) => m.exercise !== key),
        ...mapping.body_parts.map((body_part) => ({ exercise: key, body_part })),
      ];
      return { exercise: key, body_parts: mapping.body_parts };
    }
    if (url.pathname === '/api/analysis') {
      const today = '2026-10-15';
      const rows = server.rows
        .filter((r) => r.date <= today)
        .map((r, id) => ({ ...r, id, exercise_key: r.exercise.trim().toLowerCase() }));
      return {
        ...analyze(
          rows,
          server.mappings,
          url.searchParams.get('from')!,
          url.searchParams.get('to')!,
        ),
        today,
      };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const analysisRequests = () =>
    api.requests.filter((r) => r.path.startsWith('/api/analysis')).map((r) => r.path);
  return { server, requests: api.requests, user, analysisRequests };
}

const page = () => document.body.textContent ?? '';
const loaded = () =>
  waitFor(() => {
    expect(screen.queryByText('분석 불러오는 중…')).toBeNull();
    expect(document.querySelector('[data-slot="analysis-page"] [data-slot="card"]')).not.toBeNull();
  });
const partRow = (week: string, name: string) => {
  const article = [...document.querySelectorAll('[data-slot="analysis-week"]')].find((e) =>
    e.textContent.startsWith(week),
  );
  expect(article, `week ${week}`).toBeDefined();
  const row = [...article!.querySelectorAll('tr')].find((e) => e.textContent.startsWith(name));
  expect(row, `row ${name}`).toBeDefined();
  return row!.textContent;
};
// #125: one exercise is shown in detail at a time; picking it from the list shows it.
const shownDetail = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="exercise-pr"]')].find(
    (e) => e.querySelector('h3')?.textContent === name,
  );
const exercise = (name: string) => {
  if (!shownDetail(name)) {
    const list = screen.getByRole('list', { name: '운동 목록' });
    const item = [...list.querySelectorAll('button')].find(
      (b) => b.querySelector('span')?.textContent === name,
    );
    expect(item, `list item ${name}`).toBeDefined();
    fireEvent.click(item!);
  }
  const card = shownDetail(name);
  expect(card, `exercise ${name}`).toBeDefined();
  return card!;
};
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
  await openPage('종목 분석', ui.user);
  await loaded();
  expect(ui.analysisRequests()).toEqual(['/api/analysis?from=2026-10-12&to=2026-10-18']);
  expect(page()).toMatch(/분석할 기록이 없습니다/);
  expect(page()).toMatch(/추정 1RM = 총중량 kg × \(1 \+ 반복 수 ÷ 30\)/);
  expect(page()).toMatch(/1~10회 세트에만 적용/);
  expect(page()).toMatch(/실측 1RM/);
  expect(page()).toMatch(/부위별 합계가 주간 전체보다 클 수 있습니다/);
  expect(page()).toMatch(/2026-10-12 — 2026-10-18 · 전체 0세트 · 0kg/);
  expect(partRow('2026-10-12', '미분류')).toBe('미분류0세트0kg');
  expect(ui.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
});

test('4 and 12 week tabs request Monday-aligned ranges ending with the anchor week', async () => {
  const ui = mount();
  await openPage('종목 분석', ui.user);
  await loaded();
  await ui.user.click(screen.getByRole('radio', { name: '4주' }));
  await ui.user.click(screen.getByRole('radio', { name: '12주' }));
  // jsdom date inputs do not accept typed keys; set the value as the browser would.
  fireEvent.change(screen.getByLabelText('분석 기준 날짜'), { target: { value: '2025-01-05' } });
  await waitFor(() => expect(ui.analysisRequests()).toHaveLength(4));
  expect(ui.analysisRequests()).toEqual([
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
  await openPage('종목 분석', ui.user);
  await loaded();
  const bench = exercise('Bench Press');
  const text = bench.textContent;
  // Future 300 kg excluded.
  expect(text).toMatch(/최고 중량100kg × 5회 · 2026-10-12 · 동률 2회/);
  expect(text).toMatch(/최다 반복12회 · 0kg · 2026-10-13/);
  expect(text).toMatch(/실측 1RM1회 세트 기록 없음/);
  expect(text).toMatch(/추정 1RM \(Epley\)116\.67kg 추정 \(100kg × 5회\) · 2026-10-12 · 동률 2회/);
  expect(text).toMatch(/기본중량 미확인 머신 세트 1개는 1RM 계산에서 제외/);
  expect(text).toMatch(/0kg 세트 1개는 반복 PR에만 포함/);
  expect(text).toMatch(/부위: 미분류/);
  const trend = bench.querySelector('[role="img"]')!.getAttribute('aria-label')!;
  expect(trend).toMatch(/2026-10-12 최고 중량 100kg, 최다 5회, 추정 1RM 116\.67kg/);
  expect(trend).toMatch(/2026-10-14 최고 중량 60kg, 최다 1회, 추정 1RM 제외/);
  expect(partRow('2026-10-12', '미분류')).toBe('미분류5세트1,700kg');

  await ui.user.click(screen.getByRole('button', { name: 'Bench Press 부위 지정' }));
  await ui.user.click(screen.getByRole('button', { name: '어깨' }));
  await ui.user.click(screen.getByRole('button', { name: '가슴' }));
  await ui.user.click(screen.getByRole('button', { name: '부위 저장' }));
  await waitFor(() => expect(exercise('Bench Press').textContent).toMatch(/부위: 가슴, 어깨/));
  const put = ui.requests.find((r) => r.method === 'PUT');
  expect(put?.body).toEqual({ exercise: 'Bench Press', body_parts: ['가슴', '어깨'] });
  expect(partRow('2026-10-12', '가슴')).toBe('가슴4세트1,060kg');
  expect(partRow('2026-10-12', '어깨')).toBe('어깨4세트1,060kg');
  expect(partRow('2026-10-12', '미분류')).toBe('미분류1세트640kg');
  expect(page()).toMatch(/2026-10-12 — 2026-10-18 · 전체 5세트 · 1,700kg/);

  // Journal edits/deletes happen elsewhere; returning re-reads the server records.
  ui.server.rows = ui.server.rows
    .filter((r) => r.date !== '2026-10-12')
    .map((r) => (r.exercise === 'Row' ? { ...r, weight: 90 } : r));
  await openPage('운동 일지', ui.user);
  await openPage('종목 분석', ui.user);
  await loaded();
  const updated = exercise('Bench Press').textContent;
  // The former tie is gone.
  expect(updated).toMatch(/최고 중량100kg × 5회 · 2026-10-13최다/);
  expect(exercise('Row').textContent).toMatch(/최고 중량90kg × 8회/);
  expect(partRow('2026-10-12', '미분류')).toBe('미분류1세트720kg');
});

test('the mapping editor offers 이두·삼두; a saved 팔 is shown only until it is removed (#88)', async () => {
  const ui = mount([row('2026-10-13', 'Curl', 20, 10), row('2026-10-13', 'Dip', 0, 10)]);
  ui.server.mappings = [{ exercise: 'curl', body_part: '팔' }];
  await openPage('종목 분석', ui.user);
  await loaded();
  expect(exercise('Curl').textContent).toMatch(/부위: 팔/);
  expect(partRow('2026-10-12', '팔')).toBe('팔1세트200kg');

  exercise('Dip');
  await ui.user.click(screen.getByRole('button', { name: 'Dip 부위 지정' }));
  expect(screen.getByRole('button', { name: '이두' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '삼두' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '팔' }), 'not offered for new choices').toBeNull();
  await ui.user.click(screen.getByRole('button', { name: '삼두' }));
  await ui.user.click(screen.getByRole('button', { name: '부위 저장' }));
  await waitFor(() => expect(exercise('Dip').textContent).toMatch(/부위: 삼두/));

  exercise('Curl');
  await ui.user.click(screen.getByRole('button', { name: 'Curl 부위 지정' }));
  const legacy = screen.getByRole('button', { name: '팔' });
  expect(legacy).toHaveAttribute('aria-pressed', 'true');
  await ui.user.click(screen.getByRole('button', { name: '이두' }));
  await ui.user.click(screen.getByRole('button', { name: '부위 저장' }));
  // Saving without touching 팔 keeps it; the user decides when to remove it.
  expect(ui.requests.filter((r) => r.method === 'PUT').at(-1)!.body).toEqual({
    exercise: 'Curl',
    body_parts: ['팔', '이두'],
  });
  await waitFor(() => expect(exercise('Curl').textContent).toMatch(/부위: 팔, 이두/));
});

test('cancelling the mapping editor sends nothing and the PR count badge matches (#102)', async () => {
  const ui = mount([row('2026-10-13', 'Curl', 20, 10), row('2026-10-13', 'Dip', 0, 10)]);
  await openPage('종목 분석', ui.user);
  await loaded();
  const prs = screen.getByRole('region', { name: '종목별 PR' });
  expect(prs.querySelector('[data-slot="badge"]')!.textContent).toBe('2');
  expect(within(prs).getByRole('heading', { level: 2 }).textContent).toBe('종목별 PR 2');
  expect(screen.getByRole('region', { name: '부위별 주간 운동량' })).toBeInTheDocument();

  exercise('Curl');
  await ui.user.click(screen.getByRole('button', { name: 'Curl 부위 지정' }));
  expect(screen.getByRole('group', { name: 'Curl 부위' })).toBeInTheDocument();
  await ui.user.click(screen.getByRole('button', { name: '이두' }));
  expect(screen.getByRole('button', { name: '이두' })).toHaveAttribute('aria-pressed', 'true');
  await ui.user.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.queryByRole('group', { name: 'Curl 부위' })).toBeNull();
  expect(ui.requests.some((r) => r.method === 'PUT')).toBe(false);
  expect(exercise('Curl').textContent).toMatch(/부위: 미분류/);
});

test('a failed load shows an alert whose 다시 연결 button reloads the analysis (#102)', async () => {
  fixClock();
  let fail = true;
  const api = mockApi(({ url }) => {
    if (url.pathname === '/api/analysis') {
      if (fail) return json({ error: '분석 서버에 연결할 수 없습니다' }, 503);
      return {
        ...analyze([], [], url.searchParams.get('from')!, url.searchParams.get('to')!),
        today: '2026-10-15',
      };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('종목 분석', user);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('분석 서버에 연결할 수 없습니다');
  expect(alert).toHaveAttribute('data-slot', 'alert-banner');
  // The period controls are the shared DateStepper and RangeSummary.
  expect(
    screen.getByLabelText('분석 기준 날짜').closest('[data-slot="date-stepper"]'),
  ).not.toBeNull();
  expect(document.querySelector('[data-slot="range-summary"]')!.textContent).toMatch(
    /2026-10-12 — 2026-10-18.*월요일 시작 주/,
  );

  fail = false;
  await user.click(within(alert).getByRole('button', { name: '다시 연결' }));
  await loaded();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.requests.filter((r) => r.path.startsWith('/api/analysis'))).toHaveLength(2);
});

test('the list shows one summary line per exercise and one exercise in detail at a time (#125)', async () => {
  const ui = mount([
    row('2026-10-12', 'Bench Press', 100, 5),
    row('2026-10-13', 'Row', 80, 8),
    row('2026-10-14', 'Dip', 0, 10),
  ]);
  await openPage('종목 분석', ui.user);
  await loaded();
  const list = screen.getByRole('list', { name: '운동 목록' });
  const items = within(list).getAllByRole('button');
  // The server orders exercises by their latest date.
  expect(items.map((b) => b.textContent)).toEqual([
    'Dip중량 기록 없음 · 2026-10-14',
    'Row최고 80kg · 추정 1RM 101.33kg · 2026-10-13',
    'Bench Press최고 100kg · 추정 1RM 116.67kg · 2026-10-12',
  ]);
  // The first exercise is shown until one is picked; only one detail exists.
  expect(document.querySelectorAll('[data-slot="exercise-pr"]')).toHaveLength(1);
  expect(items[0]).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('heading', { level: 3, name: 'Dip' })).toBeInTheDocument();

  await ui.user.click(items[1]);
  const heading = screen.getByRole('heading', { level: 3, name: 'Row' });
  expect(heading).toHaveFocus();
  expect(items[1]).toHaveAttribute('aria-current', 'true');
  expect(items[0]).not.toHaveAttribute('aria-current');
  expect(document.querySelectorAll('[data-slot="exercise-pr"]')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Row 부위 지정' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Dip 부위 지정' })).toBeNull();

  // "운동 목록" goes back to the list; the first exercise is shown again on wide screens.
  await ui.user.click(screen.getByRole('button', { name: '운동 목록' }));
  expect(items[0]).toHaveAttribute('aria-current', 'true');
  expect(ui.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
});

test('parts without sets fold into a closed details under the week (#125)', async () => {
  const ui = mount([row('2026-10-13', 'Curl', 20, 10)]);
  ui.server.mappings = [{ exercise: 'curl', body_part: '이두' }];
  await openPage('종목 분석', ui.user);
  await loaded();
  const week = document.querySelector<HTMLElement>('[data-slot="analysis-week"]')!;
  const folded = week.querySelector('details')!;
  expect(folded.open).toBe(false);
  expect(folded.querySelector('summary')!.textContent).toMatch(
    /^기록 없는 부위 8개 · 가슴, 등, 어깨, 삼두/,
  );
  // The visible table lists only parts with sets.
  const visible = [...week.querySelectorAll('tr')].filter((tr) => !folded.contains(tr));
  expect(visible.map((tr) => tr.textContent)).toEqual(['부위세트볼륨', '이두1세트200kg']);
  expect(partRow('2026-10-12', '가슴')).toBe('가슴0세트0kg');
});
