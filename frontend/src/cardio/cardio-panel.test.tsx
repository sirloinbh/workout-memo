import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { type ApiRequest, deferred, fixClock, json, mockApi } from '../test/api';
import type { CardioSession } from './api';
import { CardioPanel } from './cardio-panel';

const today = '2026-11-08';
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
} as const;

// Shaped like GET /api/cardio-sessions answers: newest first, pace and speed computed.
const fixture = (): CardioSession[] => [
  {
    ...base,
    id: 1,
    date: '2026-11-07',
    start_time: '07:30',
    kind: 'running',
    duration_sec: 1830,
    distance_km: 5.02,
    avg_heart_rate: 150,
    effort: 'medium',
    source: 'garmin',
    external_id: 'garmin-1',
    memo: '한강',
    pace_sec_per_km: 364.5,
    speed_kmh: 9.88,
  },
  {
    ...base,
    id: 2,
    date: '2026-11-06',
    kind: 'swimming',
    duration_sec: 2400,
    distance_km: 1.5,
    // Linked to the strength workout of the day before.
    workout_id: 8,
    pace_sec_per_km: 1600,
    speed_kmh: 2.25,
  },
  {
    ...base,
    id: 3,
    date: '2026-11-05',
    kind: 'indoor_cycling',
    duration_sec: 3725,
    distance_km: null,
    pace_sec_per_km: null,
    speed_kmh: null,
  },
];

const workouts = [
  { id: 7, date: '2026-11-08', title: '하체' },
  { id: 8, date: '2026-11-07', title: '상체' },
];

function mount(respond?: (request: ApiRequest) => unknown) {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  const sessions = fixture();
  const api = mockApi((request) => {
    const custom = respond?.(request);
    if (custom !== undefined) return custom;
    if (request.method === 'GET') return sessions;
    if (request.method === 'POST')
      return json({ ...base, id: 9, ...(request.body as object) }, 201);
    if (request.method === 'PUT') return { ...base, id: 1, ...(request.body as object) };
    return { ok: true };
  });
  render(<CardioPanel from="2026-11-02" to={today} today={today} workouts={workouts} />);
  return api;
}

const list = () => screen.findByRole('list', { name: '유산소 기록' });
const dialog = () => screen.getByRole('dialog');
const field = (name: string) => within(dialog()).getByRole('textbox', { name });

test('lists the period with duration, distance, pace and speed; no pace without distance', async () => {
  const { requests } = mount();
  const rows = within(await list()).getAllByRole('listitem');
  expect(requests[0].url.pathname).toBe('/api/cardio-sessions');
  expect(requests[0].url.search).toBe('?from=2026-11-02&to=2026-11-08');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('2026-11-07 러닝');
  expect(rows[0]).toHaveTextContent('체감 중간');
  expect(rows[0]).toHaveTextContent('30:30 · 5.02 km · 6:05/km · 9.9 km/h');
  expect(rows[0]).toHaveTextContent('한강');
  // Swimming: distance in metres, pace and speed still per km.
  expect(rows[1]).toHaveTextContent('2026-11-06 수영');
  expect(rows[1]).toHaveTextContent('40:00 · 1,500 m · 26:40/km · 2.3 km/h');
  expect(rows[2]).toHaveTextContent('2026-11-05 실내 자전거');
  expect(rows[2]).toHaveTextContent('1:02:05 · 거리 미입력');
  expect(rows[2]).not.toHaveTextContent('/km');
  expect(rows[2]).not.toHaveTextContent('km/h');
});

test('an empty period shows the empty state', async () => {
  mount((request) => (request.method === 'GET' ? [] : undefined));
  expect(
    await screen.findByRole('heading', { name: '선택한 기간에 유산소 기록이 없습니다' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: '유산소 기록' })).toBeNull();
});

test('a failed load shows the error with a reconnect action', async () => {
  let fail = true;
  mount((request) =>
    request.method === 'GET' && fail ? json({ error: '서버 오류' }, 500) : undefined,
  );
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('서버 오류');
  fail = false;
  await userEvent.click(within(alert).getByRole('button', { name: '다시 연결' }));
  expect(await list()).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('creating sends the core fields as POST and reloads the list', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: '유산소 기록 추가' }));
  expect(screen.getByRole('heading', { name: '새 유산소 기록' })).toBeInTheDocument();
  // Only the core fields show at first.
  const more = within(dialog()).getByRole('button', { name: '더 입력하기' });
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(within(dialog()).queryByRole('textbox', { name: '평균 심박 bpm (선택)' })).toBeNull();

  await user.selectOptions(within(dialog()).getByLabelText('종류'), '수영');
  await user.type(field('운동 시간 분'), '40');
  await user.type(field('운동 시간 초'), '5');
  // Swimming distance is typed in metres and saved in km.
  expect(within(dialog()).queryByRole('textbox', { name: '거리 km' })).toBeNull();
  await user.type(field('거리 m'), '1500');
  expect(dialog()).toHaveTextContent('수영 거리는 m로 입력합니다. 저장할 때 km로 바꿉니다.');
  expect(dialog()).not.toHaveTextContent('1,500 m는 1.5입니다');
  await user.click(within(dialog()).getByRole('button', { name: '힘듦' }));
  await user.type(within(dialog()).getByLabelText('메모 (선택)'), '자유형');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const post = requests.find((r) => r.method === 'POST')!;
  expect(post.path).toBe('/api/cardio-sessions');
  expect(post.body).toEqual({
    date: today,
    kind: 'swimming',
    duration_sec: 2405,
    distance_km: 1.5,
    avg_heart_rate: null,
    max_heart_rate: null,
    calories_kcal: null,
    elevation_gain_m: null,
    avg_cadence: null,
    effort: 'hard',
    start_time: null,
    workout_id: null,
    memo: '자유형',
    source: 'manual',
    external_id: null,
  });
  expect(screen.getByRole('status')).toHaveTextContent('유산소 기록을 저장했습니다');
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
});

test('more input reveals the optional fields and links a same-day workout', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: '유산소 기록 추가' }));
  const more = within(dialog()).getByRole('button', { name: '더 입력하기' });
  await user.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true');
  await user.type(field('운동 시간 분'), '30');
  await user.type(field('평균 심박 bpm (선택)'), '140');
  await user.type(field('최대 심박 bpm (선택)'), '172');
  await user.type(field('칼로리 kcal (선택)'), '320');
  await user.type(field('상승 고도 m (선택)'), '25');
  await user.type(field('케이던스 회/분 (선택)'), '170');
  await user.type(within(dialog()).getByLabelText('시작 시각 (선택)'), '06:45');
  const link = within(dialog()).getByLabelText('연결할 근력 일지');
  // Only the workout on the session's date (today) is offered.
  expect(
    within(link)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['연결 안 함', '하체']);
  await user.selectOptions(link, '하체');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));

  await waitFor(() => expect(requests.some((r) => r.method === 'POST')).toBe(true));
  expect(requests.find((r) => r.method === 'POST')!.body).toMatchObject({
    duration_sec: 1800,
    avg_heart_rate: 140,
    max_heart_rate: 172,
    calories_kcal: 320,
    elevation_gain_m: 25,
    avg_cadence: 170,
    start_time: '06:45',
    workout_id: 7,
  });
});

test('nothing is sent for a future date, zero time or an invalid heart rate', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: '유산소 기록 추가' }));
  const date = within(dialog()).getByLabelText('날짜');
  // jsdom does not simulate typing into a date input reliably; set the value directly.
  fireEvent.change(date, { target: { value: '2026-11-09' } });
  await user.type(field('운동 시간 분'), '0');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));

  expect(date).toHaveAttribute('aria-invalid', 'true');
  expect(dialog()).toHaveTextContent('유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다');
  expect(field('운동 시간 분')).toHaveAttribute('aria-invalid', 'true');
  expect(field('운동 시간 분')).toHaveAccessibleDescription('운동 시간은 1초 이상이어야 합니다');

  // A heart-rate error opens the collapsed section so the message is visible.
  fireEvent.change(date, { target: { value: today } });
  await user.type(field('운동 시간 분'), '5');
  await user.click(within(dialog()).getByRole('button', { name: '더 입력하기' }));
  await user.type(field('평균 심박 bpm (선택)'), '20');
  await user.click(within(dialog()).getByRole('button', { name: '더 입력하기' }));
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));
  expect(within(dialog()).getByRole('button', { name: '더 입력하기' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(field('평균 심박 bpm (선택)')).toHaveAccessibleDescription(
    '평균 심박은 30~250 bpm의 정수로 입력하세요',
  );
  await user.clear(field('평균 심박 bpm (선택)'));
  await user.type(field('평균 심박 bpm (선택)'), '150');
  await user.type(field('최대 심박 bpm (선택)'), '140');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));
  expect(field('최대 심박 bpm (선택)')).toHaveAccessibleDescription(
    '최대 심박은 평균 심박보다 낮을 수 없습니다',
  );

  // Text that Number() would read but nobody types as a number ("1e3", "0x10") is a field
  // error, and the heart-rate cross check still shows while another field fails.
  await user.type(field('거리 km'), '1e3');
  await user.type(field('칼로리 kcal (선택)'), '0x10');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));
  expect(field('거리 km')).toHaveAccessibleDescription('거리를 숫자로 입력하세요');
  expect(field('칼로리 kcal (선택)')).toHaveAccessibleDescription(/숫자로 입력하세요/);
  expect(field('최대 심박 bpm (선택)')).toHaveAccessibleDescription(
    '최대 심박은 평균 심박보다 낮을 수 없습니다',
  );
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('switching to and from swimming keeps the typed distance in m or km', async () => {
  const user = userEvent.setup();
  mount();
  await list();
  await user.click(screen.getByRole('button', { name: '유산소 기록 추가' }));
  const kind = within(dialog()).getByLabelText('종류');
  await user.type(field('거리 km'), '5');
  await user.selectOptions(kind, '수영');
  expect(field('거리 m')).toHaveValue('5000');
  expect(within(dialog()).getByText('거리 m (선택)')).toBeInTheDocument();
  await user.clear(field('거리 m'));
  await user.type(field('거리 m'), '1500');
  await user.selectOptions(kind, '러닝');
  expect(field('거리 km')).toHaveValue('1.5');
  // Between two km kinds nothing changes.
  await user.selectOptions(kind, '걷기');
  expect(field('거리 km')).toHaveValue('1.5');
});

test('a swimming distance must be whole metres', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: '유산소 기록 추가' }));
  await user.selectOptions(within(dialog()).getByLabelText('종류'), '수영');
  await user.type(field('운동 시간 분'), '30');
  await user.type(field('거리 m'), '1500.5');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));
  expect(field('거리 m')).toHaveAccessibleDescription(
    '수영 거리는 1~1,000,000 m의 정수로 입력하세요',
  );
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('editing a swim session shows metres and keeps its link to another day', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: '2026-11-06 수영 40:00 유산소 기록 수정' }));
  expect(field('거리 m')).toHaveValue('1500');
  const link = within(dialog()).getByLabelText('연결할 근력 일지');
  expect(link).toHaveValue('8');
  expect(dialog()).toHaveTextContent('다른 날짜(2026-11-07)의 근력 일지에 연결돼 있습니다.');
  expect(dialog()).not.toHaveTextContent('이 날짜에는 연결할 근력 일지가 없습니다.');
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const put = requests.find((r) => r.method === 'PUT')!;
  expect(put.path).toBe('/api/cardio-sessions/2');
  expect(put.body).toMatchObject({ kind: 'swimming', distance_km: 1.5, workout_id: 8 });
});

test('two sessions of one kind on one day get distinct button names', async () => {
  const twin = (id: number, extra: Partial<CardioSession>): CardioSession => ({
    ...base,
    id,
    date: '2026-11-07',
    kind: 'running',
    duration_sec: 1830,
    distance_km: null,
    pace_sec_per_km: null,
    speed_kmh: null,
    ...extra,
  });
  mount((request) =>
    request.method === 'GET'
      ? [twin(1, { start_time: '07:30' }), twin(2, { start_time: '19:00' }), twin(3, {})]
      : undefined,
  );
  await list();
  for (const name of [
    '2026-11-07 07:30 러닝 유산소 기록 수정',
    '2026-11-07 19:00 러닝 유산소 기록 수정',
    '2026-11-07 러닝 30:30 유산소 기록 수정',
    '2026-11-07 러닝 30:30 유산소 기록 삭제',
  ])
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
});

test('editing an imported session PUTs the whole record with its source and external id', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: '2026-11-07 07:30 러닝 유산소 기록 수정' }));
  expect(screen.getByRole('heading', { name: '유산소 기록 수정' })).toBeInTheDocument();
  // The stored values are filled in; extra values open the more section.
  expect(field('운동 시간 시')).toHaveValue('');
  expect(field('운동 시간 분')).toHaveValue('30');
  expect(field('운동 시간 초')).toHaveValue('30');
  expect(field('거리 km')).toHaveValue('5.02');
  expect(within(dialog()).getByRole('button', { name: '더 입력하기' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(within(dialog()).getByRole('button', { name: '중간' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.clear(field('운동 시간 초'));
  await user.type(field('운동 시간 초'), '0');
  // Pressing the chosen effort again clears it.
  await user.click(within(dialog()).getByRole('button', { name: '중간' }));
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const put = requests.find((r) => r.method === 'PUT')!;
  expect(put.path).toBe('/api/cardio-sessions/1');
  expect(put.body).toEqual({
    date: '2026-11-07',
    kind: 'running',
    duration_sec: 1800,
    distance_km: 5.02,
    avg_heart_rate: 150,
    max_heart_rate: null,
    calories_kcal: null,
    elevation_gain_m: null,
    avg_cadence: null,
    effort: null,
    start_time: '07:30',
    workout_id: null,
    memo: '한강',
    source: 'garmin',
    external_id: 'garmin-1',
  });
});

test('a server refusal such as a 409 duplicate stays in the open form', async () => {
  const user = userEvent.setup();
  const { requests } = mount((request) =>
    request.method === 'PUT'
      ? json({ error: '같은 출처와 외부 ID의 유산소 기록이 이미 있습니다' }, 409)
      : undefined,
  );
  await list();
  await user.click(screen.getByRole('button', { name: '2026-11-07 07:30 러닝 유산소 기록 수정' }));
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));
  expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
    '같은 출처와 외부 ID의 유산소 기록이 이미 있습니다',
  );
  expect(field('운동 시간 분')).toHaveValue('30');
  expect(within(dialog()).getByRole('button', { name: '유산소 기록 저장' })).toBeEnabled();
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(1);
});

test('deleting asks first, then removes and reloads; cancelling sends nothing', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  const confirm = vi.mocked(window.confirm);
  confirm.mockReturnValueOnce(false);
  await user.click(screen.getByRole('button', { name: '2026-11-06 수영 40:00 유산소 기록 삭제' }));
  expect(confirm).toHaveBeenLastCalledWith('2026-11-06 수영 40:00 유산소 기록을 삭제할까요?');
  expect(requests.some((r) => r.method === 'DELETE')).toBe(false);

  await user.click(screen.getByRole('button', { name: '2026-11-06 수영 40:00 유산소 기록 삭제' }));
  expect(await screen.findByRole('status')).toHaveTextContent('유산소 기록을 삭제했습니다');
  const removed = requests.find((r) => r.method === 'DELETE')!;
  expect(removed.path).toBe('/api/cardio-sessions/2');
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
});

test('a failed delete shows its own error, keeps the row and does not reload', async () => {
  const user = userEvent.setup();
  const { requests } = mount((request) =>
    request.method === 'DELETE' ? json({ error: '삭제하지 못했습니다' }, 500) : undefined,
  );
  await list();
  await user.click(screen.getByRole('button', { name: '2026-11-06 수영 40:00 유산소 기록 삭제' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('삭제하지 못했습니다');
  // Not the load failure banner: there is nothing to reconnect.
  expect(within(alert).queryByRole('button', { name: '다시 연결' })).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(
    screen.getByRole('button', { name: '2026-11-06 수영 40:00 유산소 기록 삭제' }),
  ).toBeInTheDocument();
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(1);
});

test('deleting a session already removed elsewhere (404) says so and reloads', async () => {
  const user = userEvent.setup();
  let gone = false;
  const { requests } = mount((request) => {
    if (request.method === 'DELETE') {
      gone = true;
      return json({ error: '유산소 기록을 찾을 수 없습니다' }, 404);
    }
    if (request.method === 'GET' && gone) return fixture().filter((s) => s.id !== 2);
    return undefined;
  });
  await list();
  await user.click(screen.getByRole('button', { name: '2026-11-06 수영 40:00 유산소 기록 삭제' }));
  expect(await screen.findByRole('status')).toHaveTextContent('이미 삭제된 기록입니다');
  await waitFor(() =>
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
});

test('a reload after saving keeps the list on screen until the answer arrives', async () => {
  const user = userEvent.setup();
  const reload = deferred<CardioSession[]>();
  let gets = 0;
  mount((request) => {
    if (request.method !== 'GET') return undefined;
    gets += 1;
    return gets === 1 ? fixture() : reload.promise;
  });
  await list();
  await user.click(screen.getByRole('button', { name: '2026-11-07 07:30 러닝 유산소 기록 수정' }));
  await user.click(within(dialog()).getByRole('button', { name: '유산소 기록 저장' }));
  await waitFor(() => expect(gets).toBe(2));
  expect(screen.queryByText('기록을 불러오는 중…')).toBeNull();
  expect(screen.getByRole('list', { name: '유산소 기록' })).toBeInTheDocument();
  reload.resolve(fixture());
});

test('a new period clears the old rows and ignores a late answer for the old period', async () => {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  const old = deferred<CardioSession[]>();
  const fresh = deferred<CardioSession[]>();
  const { requests } = mockApi((request) =>
    request.url.searchParams.get('from') === '2026-10-26' ? old.promise : fresh.promise,
  );
  const { rerender } = render(
    <CardioPanel from="2026-10-26" to="2026-11-01" today={today} workouts={workouts} />,
  );
  expect(screen.getByText('기록을 불러오는 중…')).toBeInTheDocument();
  rerender(<CardioPanel from="2026-11-02" to={today} today={today} workouts={workouts} />);
  await waitFor(() => expect(requests).toHaveLength(2));
  fresh.resolve(fixture().slice(0, 1));
  expect(await list()).toBeInTheDocument();
  // The old period answers last: it must not replace the new period's list.
  old.resolve(fixture());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);

  // Switching again shows the loading line, not the previous period's rows.
  const next = deferred<CardioSession[]>();
  mockApi(() => next.promise);
  rerender(<CardioPanel from="2026-11-09" to="2026-11-15" today={today} workouts={workouts} />);
  expect(screen.getByText('기록을 불러오는 중…')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: '유산소 기록' })).toBeNull();
  next.resolve([]);
  expect(
    await screen.findByRole('heading', { name: '선택한 기간에 유산소 기록이 없습니다' }),
  ).toBeInTheDocument();
});

test('without a pinned today the form uses the Seoul date, not the device date', async () => {
  // 00:30 on 2026-10-15 in Seoul is still 2026-10-14 on the UTC device clock.
  fixClock();
  mockApi(() => []);
  const user = userEvent.setup();
  render(<CardioPanel from="2026-10-13" to="2026-10-19" workouts={[]} />);
  await screen.findByRole('heading', { name: '선택한 기간에 유산소 기록이 없습니다' });
  await user.click(screen.getByRole('button', { name: '유산소 기록 추가' }));
  const date = within(dialog()).getByLabelText('날짜');
  expect(date).toHaveValue('2026-10-15');
  expect(date).toHaveAttribute('max', '2026-10-15');
});
