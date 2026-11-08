import { expect, type Page, test } from '@playwright/test';

// #115: the journal's 유산소 tab on a 390px phone against the real API and the test DB. A fixed
// past date keeps the session apart from today's dashboard and from the other specs' days.
const day = '2001-04-20';
const memo = `E2E 유산소 ${Date.now()}`;

test.use({ viewport: { width: 390, height: 844 } });

async function showDay(page: Page) {
  await page.getByLabel('기준 날짜').fill(day);
  await page.getByRole('radio', { name: '1일', exact: true }).click();
  await expect(page.getByText(`${day} — ${day}`)).toBeVisible();
}
const row = (page: Page) =>
  page.getByRole('list', { name: '유산소 기록' }).getByRole('listitem').filter({ hasText: memo });
const textbox = (dialog: ReturnType<Page['getByRole']>, name: string) =>
  dialog.getByRole('textbox', { name, exact: true });

test.afterAll(async ({ request }) => {
  // Remove leftovers if an assertion failed before the delete step.
  const response = await request.get(`/api/cardio-sessions?from=${day}&to=${day}`);
  for (const s of (await response.json()) as { id: number; memo: string }[])
    if (s.memo === memo) await request.delete(`/api/cardio-sessions/${s.id}`);
});

test('운동 일지의 유산소 탭에서 러닝 기록을 생성·조회·수정·삭제하고 DB에 저장된다', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/journal');
  await page
    .getByRole('radiogroup', { name: '기록 종류' })
    .getByRole('radio', { name: '유산소' })
    .click();
  await expect(page).toHaveURL(/\/journal\?tab=cardio$/);
  // On the cardio tab the panel's own button is the main action.
  await expect(page.getByRole('button', { name: '운동 기록하기' })).toHaveCount(0);
  await showDay(page);
  await expect(page).toHaveURL(/tab=cardio/);

  // Create: 1 h 2 min 30 s over 12.5 km → 5:00/km, 12 km/h.
  await page.getByRole('button', { name: '유산소 기록 추가' }).click();
  const editor = page.getByRole('dialog', { name: '새 유산소 기록' });
  await editor.getByLabel('종류').selectOption({ label: '러닝' });
  await editor.getByLabel('날짜', { exact: true }).fill(day);
  await textbox(editor, '운동 시간 시').fill('1');
  await textbox(editor, '운동 시간 분').fill('2');
  await textbox(editor, '운동 시간 초').fill('30');
  await textbox(editor, '거리 km').fill('12.5');
  await editor.getByLabel('메모 (선택)').fill(memo);
  await editor.getByRole('button', { name: '유산소 기록 저장' }).click();
  await expect(editor).toBeHidden();
  await expect(row(page)).toContainText('1:02:30 · 12.5 km · 5:00/km · 12 km/h');
  await expect(page.getByLabel('기간 합계')).toContainText('12.5 km');

  // Read back after a reload: the tab and the record come from the address and the server.
  await page.reload();
  await expect(page).toHaveURL(/tab=cardio/);
  await showDay(page);
  await expect(row(page)).toContainText('1:02:30 · 12.5 km · 5:00/km');

  // Update the distance: 10 km → 6:15/km, 9.6 km/h.
  await row(page)
    .getByRole('button', { name: /유산소 기록 수정$/ })
    .click();
  const edit = page.getByRole('dialog', { name: '유산소 기록 수정' });
  await textbox(edit, '거리 km').fill('10');
  await edit.getByRole('button', { name: '유산소 기록 저장' }).click();
  await expect(edit).toBeHidden();
  await expect(row(page)).toContainText('1:02:30 · 10 km · 6:15/km · 9.6 km/h');
  await page.reload();
  await showDay(page);
  await expect(row(page)).toContainText('10 km · 6:15/km');

  // Delete
  await row(page)
    .getByRole('button', { name: /유산소 기록 삭제$/ })
    .click();
  await expect(row(page)).toHaveCount(0);
  await page.reload();
  await showDay(page);
  await expect(row(page)).toHaveCount(0);
});
