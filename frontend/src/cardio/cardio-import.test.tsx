import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { type ApiRequest, json, mockApi } from '../test/api';
import type { CardioSession } from './api';
import { CardioPanel } from './cardio-panel';
import broken from './fixtures/broken.tcx?raw';
import ride from './fixtures/garmin-ride.gpx?raw';
import run from './fixtures/garmin-run.tcx?raw';

// #119: the activity file import inside the cardio panel.
const today = '2026-11-08';
const stored = (session: Partial<CardioSession>): CardioSession => ({
  id: 1,
  date: '2026-11-02',
  start_time: null,
  kind: 'running',
  duration_sec: 1200,
  distance_km: 4,
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
  pace_sec_per_km: 300,
  speed_kmh: 12,
  ...session,
});
const files = () => [
  new File([run], 'run.tcx', { type: 'application/xml' }),
  new File([ride], 'ride.gpx', { type: 'application/gpx+xml' }),
  new File([broken], 'broken.tcx'),
];

function setup(existing: CardioSession[], answer?: (request: ApiRequest) => unknown) {
  const api = mockApi((request) => {
    if (request.method === 'POST' && request.url.pathname === '/api/cardio-sessions/import')
      return answer?.(request) ?? json({ sessions: [{ id: 9 }, { id: 10 }] }, 201);
    // The panel's period (from 11-01) is empty; the import's duplicate range gets `existing`.
    return request.url.searchParams.get('to') === '2026-11-08' ? [] : existing;
  });
  render(<CardioPanel from="2026-11-01" to="2026-11-08" today={today} workouts={[]} />);
  return api;
}
async function choose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '파일 가져오기' }));
  const card = screen.getByRole('region', { name: '활동 파일 가져오기' });
  await user.upload(within(card).getByLabelText('활동 파일 (TCX·GPX)'), files());
  await within(card).findByRole('region', { name: '가져올 활동 미리보기' });
  return card;
}
const imports = (requests: ApiRequest[]) =>
  requests.filter((r) => r.url.pathname === '/api/cardio-sessions/import');

test('previews the files in start order, names an unreadable one and leaves a look-alike unchecked', async () => {
  const user = userEvent.setup();
  // Typed by hand the same morning: 4.0 km against the file's 4.006 km, no start time.
  const api = setup([stored({})]);
  const card = await choose(user);
  expect(within(card).getByText(/broken\.tcx: 파일을 읽지 못했습니다/)).toBeInTheDocument();
  expect(within(card).getByText(/GPX 파일은 일시정지를 기록하지 않아/)).toBeInTheDocument();

  const first = within(card).getByRole('checkbox', { name: '1행 저장' });
  expect(first).not.toBeChecked();
  expect(first).toBeEnabled();
  expect(within(card).getByText('중복 후보: 기존 기록 2026-11-02 러닝 20:00')).toBeInTheDocument();
  expect(within(card).getByRole('checkbox', { name: '2행 저장' })).toBeChecked();
  expect(within(card).getByLabelText('1행 날짜')).toHaveValue('2026-11-02');
  expect(within(card).getByLabelText('1행 시작 시각')).toHaveValue('07:10');
  expect(within(card).getByLabelText('2행 종류')).toHaveValue('outdoor_cycling');
  expect(within(card).getByText('20:10 · 4.006 km · 평균 심박 145')).toBeInTheDocument();
  // The duplicate check read a day around the files' dates.
  expect(
    api.requests.some(
      (r) =>
        r.url.searchParams.get('from') === '2026-11-01' &&
        r.url.searchParams.get('to') === '2026-11-05',
    ),
  ).toBe(true);

  // Only the checked ride is sent.
  await user.click(within(card).getByRole('button', { name: '선택한 1건 저장' }));
  await waitFor(() => expect(imports(api.requests)).toHaveLength(1));
  expect(imports(api.requests)[0].body).toEqual({
    sessions: [
      expect.objectContaining({
        kind: 'outdoor_cycling',
        date: '2026-11-04',
        start_time: '06:30',
        duration_sec: 150,
        distance_km: 0.334,
        source: 'file',
        external_id: '2026-11-03T21:30:00Z',
      }),
    ],
  });
});

test('an activity imported before cannot be checked', async () => {
  const user = userEvent.setup();
  setup([stored({ source: 'file', external_id: '2026-11-01T22:10:05Z', start_time: '07:10' })]);
  const card = await choose(user);
  expect(within(card).getByRole('checkbox', { name: '1행 저장' })).toBeDisabled();
  expect(
    within(card).getByText('이미 가져온 기록입니다 (2026-11-02 07:10 러닝)'),
  ).toBeInTheDocument();
});

test('edits a row in the form without saving it, then saves the edited values', async () => {
  const user = userEvent.setup();
  const api = setup([]);
  const card = await choose(user);
  await user.selectOptions(within(card).getByLabelText('2행 종류'), 'indoor_cycling');
  await user.click(within(card).getByRole('button', { name: '1행 수정' }));
  const dialog = await screen.findByRole('dialog', { name: '가져올 기록 수정' });
  const memo = within(dialog).getByLabelText('메모 (선택)');
  expect(memo).toHaveValue('아침 한강');
  await user.clear(memo);
  await user.type(memo, '대회');
  await user.click(within(dialog).getByRole('button', { name: '미리보기에 반영' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  // The form sent nothing on its own.
  expect(api.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);

  await user.click(within(card).getByRole('button', { name: '선택한 2건 저장' }));
  await waitFor(() => expect(imports(api.requests)).toHaveLength(1));
  const sent = (imports(api.requests)[0].body as { sessions: { memo: string; kind: string }[] })
    .sessions;
  expect(sent.map((s) => [s.kind, s.memo])).toEqual([
    ['running', '대회'],
    ['indoor_cycling', ''],
  ]);
  expect(await screen.findByText('유산소 기록 2건을 가져왔습니다')).toBeInTheDocument();
});

test('a refused import keeps every row and shows the reason on the refused one', async () => {
  const user = userEvent.setup();
  const api = setup([], () =>
    json(
      {
        error: '1건에 문제가 있어 아무것도 저장하지 않았습니다',
        rows: [{ index: 1, message: '이미 가져온 활동입니다' }],
      },
      409,
    ),
  );
  const card = await choose(user);
  await user.click(within(card).getByRole('button', { name: '선택한 2건 저장' }));
  expect(
    await within(card).findByText(/아무것도 저장하지 않았습니다\. 표의 확인 칸에서/),
  ).toBeInTheDocument();
  const rows = within(card).getAllByRole('row');
  expect(within(rows[2]).getByText('이미 가져온 활동입니다')).toBeInTheDocument();
  expect(within(rows[1]).getByText('저장 가능')).toBeInTheDocument();
  expect(imports(api.requests)).toHaveLength(1);
});
