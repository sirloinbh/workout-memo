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
    await openRoutines();
    await ui.click('새 루틴 만들기');
    // #28 rule change: new routines default to automatic targets; this test covers manual mode.
    await ui.change('주차 목표 방식', 'manual');
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
    expect(post!.body).toEqual({ ...expected, progression: 'manual' });
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
  expect(posted.splits[0].body_parts).toEqual(['가슴', '가슴']);
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
  const expected = autoRoutineInput();
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
