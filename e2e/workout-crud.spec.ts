import { expect, test, type Page } from '@playwright/test';

// A fixed past date keeps the fixture apart from today's dashboard and goal logic.
const day = '2001-03-15';
const title = `E2E 일지 ${Date.now()}`;

async function showDay(page: Page) {
  await page.getByLabel('기준 날짜').fill(day);
  await page.getByRole('button', { name: '1일', exact: true }).click();
  await expect(page.getByText(`${day} — ${day}`)).toBeVisible();
}
const stat = (page: Page, label: string) =>
  page.locator('.stat', { hasText: label }).locator('.stat-value');
const row = (page: Page) => page.locator('.workout-row', { hasText: title });

test.afterAll(async ({ request }) => {
  // Remove leftovers if an assertion failed before the delete step.
  const response = await request.get(`/api/workouts?from=${day}&to=${day}`);
  for (const w of (await response.json()) as { id: number; title: string }[])
    if (w.title === title) await request.delete(`/api/workouts/${w.id}`);
});

test('운동 일지를 브라우저에서 생성·조회·수정·삭제하고 DB에 저장된다', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/');
  await showDay(page);

  // Create
  await page.getByRole('button', { name: '운동 기록하기' }).first().click();
  const editor = page.getByRole('dialog', { name: '새로운 운동 기록' });
  await editor.getByLabel('운동 날짜').fill(day);
  await editor.getByLabel('일지 제목').fill(title);
  // The new-record form opens with several planned sets; keep one for exact totals.
  const sets = editor.locator('.set-editor');
  while ((await sets.count()) > 1)
    await sets.last().getByRole('button', { name: '세트 삭제' }).click();
  await editor.getByLabel('운동명').fill('E2E 스쿼트');
  await editor.getByLabel('총중량 kg').fill('100.25');
  await editor.getByLabel('횟수').fill('5');
  const completed = editor.getByRole('button', { name: '1세트 완료' });
  if ((await completed.getAttribute('aria-pressed')) !== 'true') await completed.click();
  await editor.getByRole('button', { name: '기록 저장하기' }).click();
  await expect(editor).toBeHidden();
  await expect(row(page)).toBeVisible();
  await expect(stat(page, '누적 볼륨')).toHaveText('501.25kg');

  // Read back after a reload: the record comes from the server, not a draft.
  await page.reload();
  await showDay(page);
  await expect(row(page)).toBeVisible();
  await expect(stat(page, '완료한 세트')).toHaveText('1세트');

  // Update
  await row(page).getByRole('button', { name: '수정' }).click();
  const edit = page.getByRole('dialog', { name: '운동 일지 수정' });
  await edit.getByLabel('총중량 kg').fill('120');
  await edit.getByRole('button', { name: '기록 저장하기' }).click();
  await expect(edit).toBeHidden();
  await expect(stat(page, '누적 볼륨')).toHaveText('600kg');
  await page.reload();
  await showDay(page);
  await expect(stat(page, '누적 볼륨')).toHaveText('600kg');

  // Delete
  await page.getByRole('button', { name: `${title} 삭제` }).click();
  await expect(row(page)).toHaveCount(0);
  await page.reload();
  await showDay(page);
  await expect(row(page)).toHaveCount(0);
  await expect(stat(page, '누적 볼륨')).toHaveText('0kg');
});

test('페이지 주소는 새로고침과 뒤로 가기에서 유지된다', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: '주요 메뉴' });
  await menu.getByRole('link', { name: '나의 목표' }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await page.reload();
  await expect(menu.getByRole('link', { name: '나의 목표' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await menu.getByRole('link', { name: '루틴짜기' }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(menu.getByRole('link', { name: '나의 목표' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
