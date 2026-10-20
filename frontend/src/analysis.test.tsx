import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { analyze, type AnalysisSet } from '../../backend/src/analysis';
import { App } from './app';
import { fixClock, mockApi } from './test/api';

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
    expect(document.querySelector('.analysis-page .card')).not.toBeNull();
  });
const partRow = (week: string, name: string) => {
  const article = [...document.querySelectorAll('.analysis-week')].find((e) =>
    e.textContent!.startsWith(week),
  );
  expect(article, `week ${week}`).toBeDefined();
  const row = [...article!.querySelectorAll('tr')].find((e) => e.textContent!.startsWith(name));
  expect(row, `row ${name}`).toBeDefined();
  return row!.textContent;
};
const exercise = (name: string) => {
  const card = [...document.querySelectorAll<HTMLElement>('.exercise-pr')].find(
    (e) => e.querySelector('h3')?.textContent === name,
  );
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
  await ui.user.click(screen.getByRole('button', { name: '종목 분석' }));
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
  await ui.user.click(screen.getByRole('button', { name: '종목 분석' }));
  await loaded();
  await ui.user.click(screen.getByRole('button', { name: '4주' }));
  await ui.user.click(screen.getByRole('button', { name: '12주' }));
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
  await ui.user.click(screen.getByRole('button', { name: '종목 분석' }));
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
  await ui.user.click(screen.getByRole('button', { name: '운동 일지' }));
  await ui.user.click(screen.getByRole('button', { name: '종목 분석' }));
  await loaded();
  const updated = exercise('Bench Press').textContent;
  // The former tie is gone.
  expect(updated).toMatch(/최고 중량100kg × 5회 · 2026-10-13최다/);
  expect(exercise('Row').textContent).toMatch(/최고 중량90kg × 8회/);
  expect(partRow('2026-10-12', '미분류')).toBe('미분류1세트720kg');
});
