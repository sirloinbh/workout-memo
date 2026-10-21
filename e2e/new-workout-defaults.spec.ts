import { expect, test } from '@playwright/test';

// #82: a new journal is dated today (Asia/Seoul) with a date title, and today's routine
// fills its sets including the planned machine. Routines and machines have no delete API,
// so this scenario uses unique names; a later routine starting today wins as the active one.
const seoul = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const [, month, date] = seoul.split('-').map(Number);
const title = `${month}월 ${date}일(${'일월화수목금토'[new Date(seoul + 'T00:00:00Z').getUTCDay()]})`;
const suffix = Date.now();

test('새 일지는 오늘 날짜·제목과 오늘 루틴의 세트·머신으로 시작한다', async ({ page, request }) => {
  const brands = (await (await request.get('/api/brands')).json()) as { id: number }[];
  const machine = await request.post('/api/machines', {
    data: { brand_id: brands[0].id, name: `E2E 레그프레스 ${suffix}`, base_weight: 50, notes: '' },
  });
  expect(machine.status()).toBe(201);
  const machineId = ((await machine.json()) as { id: number }).id;
  const routine = await request.post('/api/routines', {
    data: {
      name: `E2E 루틴 ${suffix}`,
      progression: 'auto',
      start_date: seoul,
      split_count: 1,
      weekly_workouts: 7,
      rest_days: [],
      splits: [
        {
          name: 'E2E 하체',
          body_parts: ['하체-앞'],
          exercises: [
            {
              exercise: `E2E 레그프레스 ${suffix}`,
              machine_id: machineId,
              sets: 2,
              weight: 150,
              reps: 10,
              rep_min: 8,
              rep_max: 12,
            },
          ],
        },
      ],
    },
  });
  expect(routine.status()).toBe(201);

  await page.goto('/');
  await page
    .getByRole('navigation', { name: '주요 메뉴' })
    .getByRole('link', { name: '운동 일지' })
    .click();
  // Browsing another day does not change the new journal's date.
  await page.getByLabel('기준 날짜').fill('2001-03-15');
  await expect(page.getByRole('button', { name: '오늘 루틴으로 기록하기' })).toBeVisible();
  await page.getByRole('button', { name: '운동 기록하기' }).first().click();
  const editor = page.getByRole('dialog', { name: '새로운 운동 기록' });
  await expect(editor.getByLabel('운동 날짜')).toHaveValue(seoul);
  await expect(editor.getByLabel('일지 제목')).toHaveValue(title);
  const sets = editor.locator('.set-editor');
  await expect(sets).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(sets.nth(i).getByLabel('운동명')).toHaveValue(`E2E 레그프레스 ${suffix}`);
    await expect(sets.nth(i).getByLabel('머신')).toHaveValue(String(machineId));
    await expect(sets.nth(i).getByLabel('총중량 kg')).toHaveValue('150');
    await expect(sets.nth(i).getByLabel('횟수')).toHaveValue('10');
  }
});
