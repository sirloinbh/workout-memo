import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { autoRoutineInput, routineInput } from '../../backend/test/routine-fixture';
import { App } from './app';
import { json, mockApi } from './test/api';
import { openPage } from './test/nav';

// Ported from backend/test/routines-ui.test.ts (vm hook harness) to a real DOM.
// Like the legacy harness, forms are submitted with fireEvent.submit, which skips
// native constraint validation (required fields) exactly as calling onSubmit did.
type Plan = ReturnType<typeof routineInput>;

function mount(failPost = false, failReadAfterPost = false, initialPlan: Plan = routineInput()) {
  vi.stubGlobal('confirm', () => true);
  let saved = { ...structuredClone(initialPlan), id: 27, schedule: [] };
  const api = mockApi(({ method, url, body }) => {
    const pathname = url.pathname;
    if (
      failReadAfterPost &&
      pathname === '/api/routines/27' &&
      api.requests.some((r) => r.method === 'POST')
    )
      return json({ error: '저장 후 조회 실패' }, 503);
    if (pathname === '/api/routines' && method === 'POST') {
      if (failPost) return json({ error: '휴식 요일과 주당 운동 횟수를 확인하세요' }, 400);
      saved = { ...(body as Plan), id: 27, schedule: [] };
      return json({ id: 27 }, 201);
    }
    if (pathname === '/api/machines') return [{ id: 5, brand: '해머', name: '레그프레스' }];
    const data =
      pathname === '/api/routines' ? [saved] : pathname === '/api/routines/27' ? saved : [];
    return structuredClone(data);
  });
  const user = userEvent.setup();
  render(<App />);
  const requests = api.requests;
  const text = (el: Element = document.body) => el.textContent ?? '';
  const labels = (label: string) =>
    [...document.querySelectorAll('label')].filter((el) => text(el).trim().startsWith(label));
  async function click(label: string) {
    const button = (await screen.findAllByRole('button', { name: label }))[0];
    expect(button, `User can access ${label}`).toBeEnabled();
    await user.click(button);
  }
  async function change(label: string, value: string, index = 0, checked?: boolean) {
    const item = labels(label)[index];
    expect(item, `Input label ${label} #${index} exists`).toBeTruthy();
    const input = item.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
    expect(input).toBeTruthy();
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      if (input.checked !== checked) await user.click(input);
      expect(input.checked).toBe(checked);
    } else fireEvent.change(input, { target: { value } });
  }
  const form = () => document.querySelectorAll('form');
  async function submit() {
    expect(form()[0]).toBeTruthy();
    fireEvent.submit(form()[0]);
  }
  const nonGet = () => requests.filter((r) => r.method !== 'GET');
  return { requests, user, text, labels, click, change, submit, form, nonGet };
}
async function openRoutines() {
  await openPage('루틴짜기');
  await screen.findByRole('button', { name: '새 루틴 만들기' });
}
// #88: new routines start in cycle mode with default body parts. Tests of the weekday
// form switch the mode and clear the prefilled parts of split 1 first.
async function weekdayForm(ui: ReturnType<typeof mount>) {
  await ui.change('운동 일정 방식', 'weekday');
  while (screen.queryByRole('button', { name: '분할 1 부위 1 삭제' }))
    await ui.click('분할 1 부위 1 삭제');
}
// The UI offers 이두·삼두 instead of the legacy 팔 (#88).
const offered = (parts: string[]) => parts.map((p) => (p === '팔' ? '이두' : p));
// A save is finished once the form has left its saving state.
const saveSettled = () =>
  waitFor(() => expect(screen.getByRole('button', { name: '새 루틴 만들기' })).toBeEnabled());

test('routine screen re-queries saved plans and displays all 12 manual weeks with distinct deloads', async () => {
  const ui = mount();
  await openRoutines();
  expect(ui.requests.some((r) => r.path === '/api/routines' && r.method === 'GET')).toBe(true);
  await waitFor(() => expect(ui.text()).toMatch(/수동 12주 루틴/));
  // The list may show the complete plan or expose a detail button.
  const detail = screen.queryAllByRole('button', { name: '계획 보기' })[0];
  if (detail) {
    await ui.user.click(detail);
    await waitFor(() => expect(document.querySelector('article')).not.toBeNull());
  }
  for (let week = 1; week <= 12; week++)
    expect(ui.text()).toMatch(new RegExp(`(?:^|\\D)${week}주차`));
  for (const week of [4, 8, 12]) {
    const row = [...document.querySelectorAll('tr, li, article, section')].filter(
      (el) =>
        new RegExp(`(?:^|\\D)${week}주차`).test(ui.text(el)) &&
        /디로딩/.test(ui.text(el)) &&
        !/(?:^|\D)1주차/.test(ui.text(el)),
    );
    expect(row.length, `Week ${week} has its own deload label`).toBeGreaterThan(0);
  }
  expect(ui.text()).toMatch(/7\.25/);
  expect(ui.text()).toMatch(/100\.25/);
  for (const part of ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'])
    expect(ui.text()).toContain(part);
  expect(
    (ui.text().match(/가슴/g) ?? []).length,
    'Repeated body parts remain visible',
  ).toBeGreaterThanOrEqual(3);
  expect(ui.nonGet(), 'Viewing a plan must not create workouts or achievement goals').toHaveLength(
    0,
  );
  // A fresh mount has no component state and must recover the same server plan.
  cleanup();
  const reopened = mount();
  await openRoutines();
  await waitFor(() => expect(reopened.text()).toMatch(/수동 12주 루틴/));
});

for (const failRead of [false, true]) {
  test(`routine form saves explicit schedule, duplicate parts, baselines and every manual week; follow-up read failure=${failRead}`, async () => {
    const ui = mount(false, failRead);
    const expected = routineInput(1);
    expected.name = '새로 작성한 루틴 27';
    expected.weeks[7] = { week: 8, kind: 'deload', amount: 1, deload_metric: 'sets' };
    expected.weeks[11] = { week: 12, kind: 'deload', amount: 3, deload_metric: 'reps' };
    expected.splits[0].body_parts = offered(expected.splits[0].body_parts);
    await openRoutines();
    await ui.click('새 루틴 만들기');
    // #28 rule change: new routines default to automatic targets; this test covers manual mode.
    await ui.change('주차 목표 방식', 'manual');
    await weekdayForm(ui);
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
      const field = [...document.querySelectorAll('fieldset')].filter((el) =>
        ui.text(el).startsWith(`${w.week}주차`),
      )[0];
      expect(field).toBeTruthy();
      fireEvent.change(field.querySelector('select')!, {
        target: { value: w.deload_metric ?? w.kind },
      });
      await ui.change(
        w.kind === 'deload' ? '감소량' : '증가량',
        String(w.amount),
        w.kind === 'deload' ? w.week / 4 - 1 : w.week - 1 - Math.floor(w.week / 4),
      );
    }
    await ui.submit();
    await saveSettled();
    const post = ui.requests.find((r) => r.method === 'POST');
    expect(post).toBeTruthy();
    // #28: the form now states the mode explicitly; manual plans keep every manual week.
    expect(post!.body).toEqual({ ...expected, progression: 'manual', schedule_mode: 'weekday' });
    expect(ui.requests.some((r) => r.path === '/api/routines/27')).toBe(true);
    if (failRead) await waitFor(() => expect(ui.text()).toMatch(/저장 후 조회 실패/));
    expect(ui.text()).toMatch(/7\.25/);
    expect(ui.text()).toMatch(/100\.25/);
    expect(ui.text()).toMatch(/12주차 · 디로딩/);
    expect(ui.form(), 'Successful save closes the draft').toHaveLength(0);
    expect(ui.nonGet()).toHaveLength(1);
    expect(ui.text()).toMatch(/루틴 #27을 저장했습니다/);
    if (failRead) expect(ui.text()).toMatch(/저장 후 조회 실패/);
    else {
      // Use the actual posted plan, not the default fixture, in a new component session.
      cleanup();
      const reopened = mount(false, false, post!.body as Plan);
      await openRoutines();
      await reopened.click('계획 보기');
      await waitFor(() => expect(reopened.text()).toMatch(/새로 작성한 루틴 27/));
      expect(reopened.requests.some((r) => r.path === '/api/routines/27')).toBe(true);
      expect(reopened.text()).toMatch(/무분할 · 시작일 2024-02-29 · 주 3회/);
      expect(reopened.text()).toContain(expected.splits[0].body_parts.join(' → '));
      expect(reopened.text()).toMatch(/5주차 · 총중량 kg 7\.25 증가/);
      expect(reopened.text()).toMatch(/8주차 · 디로딩 · 세트 수 1 감소/);
      expect(reopened.text()).toMatch(/12주차 · 디로딩 · 반복 수 3 감소/);
      expect(reopened.nonGet()).toHaveLength(0);
    }
  });
}

test('routine editor exposes all five splits and keeps a failed save available for correction', async () => {
  const ui = mount(true);
  await openRoutines();
  await ui.click('새 루틴 만들기');
  for (const n of [1, 2, 3, 4, 5]) {
    await ui.change('분할 방식', String(n));
    expect(
      [...document.querySelectorAll('label')].filter((el) => ui.text(el).trim() === '분할 이름'),
    ).toHaveLength(n);
  }
  await ui.change('루틴 이름', '실패 후 보존');
  // #88: 5분할 fills split 1 with 가슴; the clicks add two more occurrences.
  await ui.click('가슴 추가');
  await ui.click('가슴 추가');
  await ui.submit();
  await waitFor(() => expect(ui.text()).toMatch(/휴식 요일과 주당 운동 횟수를 확인하세요/));
  await saveSettled();
  expect(ui.form()).toHaveLength(1);
  expect(
    [...document.querySelectorAll('input')].filter((el) => el.value === '실패 후 보존'),
  ).toHaveLength(1);
  const posted = ui.requests.find((r) => r.method === 'POST')!.body as Plan;
  expect(posted.split_count).toBe(5);
  expect(posted.splits[0].body_parts).toEqual(['가슴', '가슴', '가슴']);
  expect(screen.getByRole('button', { name: '루틴 저장하기' })).toBeEnabled();
});

test('new routine requires explicit manual amounts and removes only the selected duplicate body part', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('새 루틴 만들기');
  await ui.change('주차 목표 방식', 'manual');
  for (let week = 1; week <= 12; week++) {
    const field = [...document.querySelectorAll('fieldset')].filter((el) =>
      ui.text(el).startsWith(`${week}주차`),
    )[0];
    expect(field).toBeTruthy();
    const amount = field.querySelector('input')!;
    expect(amount.value, `Week ${week} has no automatic change amount`).toBe('');
    if (week % 4 === 0) {
      expect(ui.text(field)).toMatch(/디로딩/);
      expect(field.querySelector('select')!.value).toBe('');
    }
  }
  await weekdayForm(ui);
  await ui.click('가슴 추가');
  await ui.click('등 추가');
  await ui.click('가슴 추가');
  await ui.click('분할 1 부위 1 삭제');
  const partList = [...document.querySelectorAll('ol')].filter((el) =>
    ui.text(el).includes('삭제'),
  )[0];
  expect(partList).toBeTruthy();
  expect(
    [...partList.querySelectorAll('li')].map((el) => ui.text(el).replace('삭제', '').trim()),
    'Removing one occurrence preserves the other occurrence and order',
  ).toEqual(['등', '가슴']);
  expect(ui.nonGet()).toHaveLength(0);
});

test('new routines default to automatic double progression with a 12-week preview', async () => {
  const expected = { ...autoRoutineInput(), schedule_mode: 'weekday' as const };
  expected.splits[0].body_parts = offered(expected.splits[0].body_parts);
  const ui = mount(false, false, expected as unknown as Plan);
  await openRoutines();
  await ui.click('새 루틴 만들기');
  const mode = ui.labels('주차 목표 방식')[0];
  expect(mode, 'the form offers a target mode').toBeTruthy();
  expect(mode.querySelector('select')!.value).toBe('auto');
  expect(ui.text(), 'the rule is explained on screen').toMatch(/반복 수를 1회씩/);
  expect(
    [...document.querySelectorAll('label')].filter((el) =>
      /^(증가량|감소량)/.test(ui.text(el).trim()),
    ),
    'no manual per-week amounts in auto mode',
  ).toHaveLength(0);
  await ui.change('루틴 이름', expected.name);
  await ui.change('분할 이름', expected.splits[0].name);
  await ui.change('시작일', expected.start_date);
  await weekdayForm(ui);
  await ui.change('주당 운동 횟수', '3');
  for (const day of ['일', '화', '목', '토']) await ui.change(day, '', 0, true);
  for (const part of expected.splits[0].body_parts) await ui.click(part + ' 추가');
  await ui.click('운동 추가');
  await ui.click('운동 추가');
  for (const [i, ex] of expected.splits[0].exercises.entries()) {
    const sets = ui.labels('세트 수')[i];
    expect(sets.querySelector('input'), 'default 3 sets').toHaveValue(3);
    const range = (label: string) => ui.labels(label)[i].querySelector('input');
    expect(range('반복 하한')).toHaveValue(8);
    expect(range('반복 상한')).toHaveValue(12);
    await ui.change('운동명', ex.exercise, i);
    await ui.change('현재 총중량 (kg, 머신 기본중량 포함)', String(ex.weight), i);
    await ui.change('현재 반복 수', String(ex.reps), i);
  }
  const preview = ui.text();
  // #28: targets advance per session of the split (here 3 sessions a week), grouped by week.
  expect(preview).toMatch(
    /1주차: 1번째 100 kg × 10회\(시작\), 2번째 100 kg × 11회\(반복 \+1\), 3번째 100 kg × 12회\(반복 \+1\)/,
  );
  expect(preview).toMatch(/2주차: 1번째 105 kg × 8회\(증량 \+5 kg\)/);
  expect(preview).toMatch(
    /4주차 디로딩: 1번째 100 kg × 8회\(디로딩\), 2번째 100 kg × 8회\(디로딩\)/,
  );
  // #86: light weights also go up by the 5 kg default increment.
  expect(preview).toMatch(/1주차: 1번째 40 kg × 12회\(시작\), 2번째 45 kg × 8회\(증량 \+5 kg\)/);
  expect(preview).toMatch(/12주차 디로딩: 1번째 0 kg × 12회\(디로딩\)/);
  expect(preview, 'the per-session rule is explained').toMatch(/세션\(운동일\)마다/);
  expect(ui.nonGet(), 'preview sends nothing').toHaveLength(0);
  await ui.submit();
  await saveSettled();
  const post = ui.requests.find((r) => r.method === 'POST');
  expect(post).toBeTruthy();
  expect(post!.body).toEqual(expected);
  await waitFor(() => expect(ui.text()).toMatch(/자동 · 이중 점진 과부하/));
  expect(ui.text()).toMatch(/5주차: 1번째 110 kg × 9회\(반복 \+1\)/);
});

test('a new routine defaults to a cycle and fills each split count with its cycle and parts (#88)', async () => {
  const ui = mount();
  await openRoutines();
  await ui.click('새 루틴 만들기');
  const value = (label: string) =>
    ui.labels(label)[0].querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!.value;
  expect(value('운동 일정 방식')).toBe('cycle');
  expect(ui.labels('휴식 요일')).toHaveLength(0);
  const partsOf = (i: number) =>
    [...document.querySelectorAll('fieldset')]
      .filter((el) => ui.text(el).startsWith(`분할 ${i + 1}`))[0]
      .querySelectorAll('ol li');
  const listed = (i: number) => [...partsOf(i)].map((li) => ui.text(li).replace('삭제', '').trim());
  for (const [count, train, rest, parts] of [
    [
      2,
      '2',
      '1',
      [
        ['등', '가슴', '이두', '삼두'],
        ['하체-앞', '하체-뒤', '복근', '어깨'],
      ],
    ],
    [
      3,
      '3',
      '1',
      [
        ['등', '이두'],
        ['하체-앞', '하체-뒤', '복근'],
        ['가슴', '어깨', '삼두'],
      ],
    ],
    [4, '4', '1', [['등'], ['가슴', '이두'], ['하체-앞', '하체-뒤', '복근'], ['어깨', '삼두']]],
    [5, '5', '2', [['가슴'], ['등'], ['하체-앞', '하체-뒤'], ['어깨'], ['이두', '삼두', '복근']]],
  ] as const) {
    await ui.change('분할 방식', String(count));
    expect(value('연속 운동일')).toBe(train);
    expect(value('이어지는 휴식일')).toBe(rest);
    parts.forEach((expected, i) => expect(listed(i), `${count}분할 ${i + 1}`).toEqual(expected));
  }
  await ui.change('분할 방식', '1');
  expect(listed(0)).toEqual(['가슴', '등', '어깨', '이두', '삼두', '하체-앞', '하체-뒤', '복근']);
  expect(screen.queryByRole('button', { name: '팔 추가' })).toBeNull();
  // The defaults stay editable and the plan is sent as a cycle.
  await ui.change('분할 방식', '3');
  await ui.change('연속 운동일', '2');
  await ui.change('루틴 이름', '주기 루틴');
  await ui.change('시작일', '2026-10-21');
  await ui.submit();
  await saveSettled();
  const body = ui.requests.find((r) => r.method === 'POST')!.body as Plan & {
    schedule_mode: string;
    cycle: object;
  };
  expect(body.schedule_mode).toBe('cycle');
  expect(body.cycle).toEqual({ train_days: 2, rest_days: 1 });
  expect(body.rest_days).toEqual([]);
  expect(body.weekly_workouts).toBe(2);
});

test('a routine exercise can name a machine that the plan keeps (#82)', async () => {
  const expected = autoRoutineInput();
  const ui = mount(false, false, expected as unknown as Plan);
  await openRoutines();
  await ui.click('새 루틴 만들기');
  await ui.change('루틴 이름', expected.name);
  await ui.change('분할 이름', expected.splits[0].name);
  await ui.change('시작일', expected.start_date);
  await weekdayForm(ui);
  await ui.change('주당 운동 횟수', '3');
  for (const day of ['일', '화', '목', '토']) await ui.change(day, '', 0, true);
  await ui.click('가슴 추가');
  await ui.click('운동 추가');
  for (const [i, ex] of expected.splits[0].exercises.slice(0, 2).entries()) {
    await ui.change('운동명', ex.exercise, i);
    await ui.change('현재 총중량 (kg, 머신 기본중량 포함)', String(ex.weight), i);
    await ui.change('현재 반복 수', String(ex.reps), i);
  }
  await waitFor(() =>
    expect(ui.labels('머신')[0].querySelector('option[value="5"]')).not.toBeNull(),
  );
  await ui.change('머신', '5', 0);
  await ui.submit();
  await saveSettled();
  const post = ui.requests.find((r) => r.method === 'POST');
  const exercises = (post!.body as Plan).splits[0].exercises as Record<string, unknown>[];
  expect(exercises[0].machine_id).toBe(5);
  // A free exercise omits the field, keeping the plan shape of older routines.
  expect('machine_id' in exercises[1]).toBe(false);
  await waitFor(() => expect(ui.text()).toMatch(/벤치프레스 \(해머 · 레그프레스\)/));
});
