import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { json, mockApi } from '../test/api';
import type { CardioRecords as Records, CardioSession } from './api';
import { CardioRecords } from './cardio-records';
import { CardioStats } from './cardio-stats';

const base = {
  start_time: null,
  avg_heart_rate: null,
  max_heart_rate: null,
  calories_kcal: null,
  elevation_gain_m: null,
  avg_cadence: null,
  effort: null,
  workout_id: null,
  source: 'manual',
  external_id: null,
  memo: '',
  pace_sec_per_km: null,
  speed_kmh: null,
} as const;
let id = 0;
const session = (
  date: string,
  kind: CardioSession['kind'],
  duration_sec: number,
  distance_km: number | null,
): CardioSession => ({ ...base, id: ++id, date, kind, duration_sec, distance_km });

// 11/2 is a Monday and 11/8 a Sunday; 11/9 starts the next week.
const sessions = [
  session('2026-11-09', 'running', 1500, 5),
  session('2026-11-08', 'swimming', 2400, 1.5),
  session('2026-11-08', 'running', 600, null),
  session('2026-11-03', 'running', 1830, 5.02),
];
const noRecords: Records = { longest: [], best5k: null, best10k: null };

function renderStats(list = sessions, records: Records | Response = noRecords) {
  const api = mockApi(() => records);
  render(<CardioStats from="2026-11-02" to="2026-11-15" sessions={list} />);
  return api;
}
const chart = (name: RegExp) =>
  screen.getAllByRole('img').find((el) => name.test(el.getAttribute('aria-label') ?? ''))!;

test('weekly totals split on the Monday boundary, for all kinds and per kind', async () => {
  renderStats();
  const totals = screen.getByLabelText('기간 합계');
  // 11.52 km: swimming's 1.5 km counts in km here; the session without distance adds nothing.
  expect(within(totals).getByText('11.52 km')).toBeInTheDocument();
  expect(within(totals).getByText('1:45:30')).toBeInTheDocument();
  expect(within(totals).getByText('4회')).toBeInTheDocument();

  expect(chart(/^전체 주별 거리/)).toHaveAttribute(
    'aria-label',
    '전체 주별 거리: 11/2 주 6.52 km, 11/9 주 5 km',
  );
  // Per kind: swimming stays in metres.
  expect(chart(/^러닝 주별 거리/)).toHaveAttribute(
    'aria-label',
    '러닝 주별 거리: 11/2 주 5.02 km, 11/9 주 5 km',
  );
  expect(chart(/^수영 주별 거리/)).toHaveAttribute(
    'aria-label',
    '수영 주별 거리: 11/2 주 1,500 m, 11/9 주 0 m',
  );

  await userEvent.click(screen.getByRole('radio', { name: '횟수' }));
  expect(chart(/^전체 주별 횟수/)).toHaveAttribute(
    'aria-label',
    '전체 주별 횟수: 11/2 주 3회, 11/9 주 1회',
  );
  await userEvent.click(screen.getByRole('radio', { name: '시간' }));
  expect(chart(/^러닝 주별 시간/)).toHaveAttribute(
    'aria-label',
    '러닝 주별 시간: 11/2 주 40:30, 11/9 주 25:00',
  );
});

test('monthly view and the per-kind table', async () => {
  renderStats();
  await userEvent.click(screen.getByRole('radio', { name: '월별' }));
  expect(chart(/^전체 월별 거리/)).toHaveAttribute('aria-label', '전체 월별 거리: 11월 11.52 km');

  const table = screen.getByRole('table', { name: '종류별 합계' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => r.textContent)).toEqual(['러닝3회1:05:3010.02 km', '수영1회40:001,500 m']);
});

test('running pace trend skips sessions without distance', () => {
  renderStats();
  // 1830 s / 5.02 km = 6:05/km, 1500 s / 5 km = 5:00/km; the 600 s run has no distance.
  expect(chart(/^러닝 페이스/)).toHaveAttribute(
    'aria-label',
    '러닝 페이스 추이(위가 빠름): 2026-11-03 6:05/km, 2026-11-09 5:00/km',
  );
  expect(screen.getByText('가장 빠름 5:00/km')).toBeInTheDocument();
  // The SVG stretches with the width; the dots use a non-scaling stroke so they stay round (#263).
  const dots = chart(/^러닝 페이스/).querySelectorAll('[data-slot="chart-dot"]');
  expect(dots).toHaveLength(2);
  expect(chart(/^러닝 페이스/).querySelector('circle')).toBeNull();
  for (const dot of dots) expect(dot).toHaveClass('[vector-effect:non-scaling-stroke]');
});

test('one kind only: no per-kind charts; no running distance: a pace note instead of a chart', () => {
  renderStats([session('2026-11-04', 'indoor_cycling', 3600, null)]);
  expect(screen.queryByRole('heading', { name: /종류별 주별/ })).not.toBeInTheDocument();
  expect(screen.getByText('거리를 입력한 기록이 없습니다')).toBeInTheDocument();
  expect(
    screen.getByText('거리를 입력한 러닝 기록이 없어 페이스를 계산할 수 없습니다'),
  ).toBeInTheDocument();
  expect(screen.getByRole('table', { name: '종류별 합계' })).toHaveTextContent('거리 미입력');
});

test('an empty period shows the common EmptyState', async () => {
  renderStats([]);
  expect(
    screen.getByRole('heading', { name: '선택한 기간에 통계를 낼 유산소 기록이 없습니다' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: '아직 개인 기록이 없습니다' }),
  ).toBeInTheDocument();
});

test('records: loaded from the records endpoint, swim distance in m, missing bests explained', async () => {
  const api = mockApi((): Records => ({
    longest: [
      { kind: 'running', id: 1, date: '2026-10-26', distance_km: 21.1, duration_sec: 7380 },
      { kind: 'swimming', id: 2, date: '2026-10-02', distance_km: 1.5, duration_sec: 2400 },
    ],
    best5k: { id: 3, date: '2026-11-02', distance_km: 5.02, duration_sec: 1470 },
    best10k: null,
  }));
  render(<CardioRecords />);
  const list = await screen.findByRole('list', { name: '개인 기록' });
  expect(api.requests.map((r) => r.path)).toEqual(['/api/cardio-sessions/records']);
  const items = within(list).getAllByRole('listitem');
  expect(items.map((i) => i.textContent)).toEqual([
    '5km 최고 기록24:305.02 km · 4:53/km · 12.3 km/h · 2026-11-02',
    '10km 최고 기록9.8~10.2 km 러닝 기록이 없습니다',
    '러닝 최장 거리21.1 km2:03:00 · 2026-10-26',
    '수영 최장 거리1,500 m40:00 · 2026-10-02',
  ]);
});

test('records: a failed load shows an alert with 다시 연결 and retries', async () => {
  let fail = true;
  mockApi(() => (fail ? json({ error: '서버에 연결할 수 없습니다' }, 500) : noRecords));
  render(<CardioRecords />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: '다시 연결' }));
  expect(
    await screen.findByRole('heading', { name: '아직 개인 기록이 없습니다' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('sessions outside the period never count, in totals or per kind', () => {
  // A wider list than the period (e.g. a stale one): 10/30 must not reach any figure.
  renderStats([...sessions, session('2026-10-30', 'rowing', 3600, 10)]);
  const totals = screen.getByLabelText('기간 합계');
  expect(within(totals).getByText('11.52 km')).toBeInTheDocument();
  expect(within(totals).getByText('4회')).toBeInTheDocument();
  expect(screen.queryByText('로잉')).toBeNull();
});

test('a new period starts again from its default unit; a chosen unit holds within a period', async () => {
  const user = userEvent.setup();
  mockApi(() => noRecords);
  const { rerender } = render(
    <CardioStats from="2026-11-02" to="2026-11-15" sessions={sessions} />,
  );
  expect(chart(/^전체 주별 거리/)).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: '월별' }));
  expect(chart(/^전체 월별 거리/)).toBeInTheDocument();
  // Same period again: the choice stays.
  rerender(<CardioStats from="2026-11-02" to="2026-11-15" sessions={sessions} />);
  expect(chart(/^전체 월별 거리/)).toBeInTheDocument();
  // A short new period goes back to weekly; a year-long one starts monthly.
  rerender(<CardioStats from="2026-11-09" to="2026-11-15" sessions={sessions} />);
  expect(chart(/^전체 주별 거리/)).toBeInTheDocument();
  rerender(<CardioStats from="2025-11-16" to="2026-11-15" sessions={sessions} />);
  expect(chart(/^전체 월별 거리/)).toBeInTheDocument();
});
