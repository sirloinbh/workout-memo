import { expect, type Page, test } from '@playwright/test';

// A fixed past date keeps the fixture apart from today's dashboard and goal logic.
const day = '2001-03-15';
const title = `E2E Journal ${Date.now()}`;

async function showDay(page: Page) {
  await page.getByLabel('Reference date').fill(day);
  await page.getByRole('radio', { name: '1 day', exact: true }).click();
  await expect(page.getByText(`${day} — ${day}`)).toBeVisible();
}
const stat = (page: Page, label: string) =>
  page.locator('[data-slot=stat]', { hasText: label }).locator('[data-slot=stat-value]');
const row = (page: Page) => page.locator('[data-slot=workout-row]', { hasText: title });

test.afterAll(async ({ request }) => {
  // Remove leftovers if an assertion failed before the delete step.
  const response = await request.get(`/api/workouts?from=${day}&to=${day}`);
  for (const w of (await response.json()) as { id: number; title: string }[])
    if (w.title === title) await request.delete(`/api/workouts/${w.id}`);
});

test('Create, view, edit, and delete workout journals in the browser and store them in the DB', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/');
  await showDay(page);

  // Create
  await page.getByRole('button', { name: 'Log workout' }).first().click();
  const editor = page.getByRole('dialog', { name: 'New workout record' });
  await editor.getByLabel('Workout date').fill(day);
  await editor.getByLabel('Journal title').fill(title);
  // The new-record form opens with several planned sets; keep one for exact totals.
  const sets = editor.locator('[data-slot=set-row]');
  while ((await sets.count()) > 1)
    await sets.last().getByRole('button', { name: 'Delete set' }).click();
  await editor.getByLabel('Exercise name').fill('E2E Squat');
  await editor.getByLabel('Total weight kg', { exact: true }).fill('100.25');
  await editor.getByLabel('Reps', { exact: true }).fill('5');
  const completed = editor.getByRole('button', { name: 'Set 1 done' });
  if ((await completed.getAttribute('aria-pressed')) !== 'true') await completed.click();
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(editor).toBeHidden();
  await expect(row(page)).toBeVisible();
  await expect(stat(page, 'Total volume')).toHaveText('501.25kg');

  // Read back after a reload: the record comes from the server, not a draft.
  await page.reload();
  await showDay(page);
  await expect(row(page)).toBeVisible();
  await expect(stat(page, 'Completed sets')).toHaveText('1 set');

  // Update
  await row(page).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit workout journal' });
  await edit.getByLabel('Total weight kg', { exact: true }).fill('120');
  await edit.getByRole('button', { name: 'Save record' }).click();
  await expect(edit).toBeHidden();
  await expect(stat(page, 'Total volume')).toHaveText('600kg');
  await page.reload();
  await showDay(page);
  await expect(stat(page, 'Total volume')).toHaveText('600kg');

  // Delete
  await page.getByRole('button', { name: `Delete ${title}` }).click();
  await expect(row(page)).toHaveCount(0);
  await page.reload();
  await showDay(page);
  await expect(row(page)).toHaveCount(0);
  await expect(stat(page, 'Total volume')).toHaveText('0kg');
});

test('The page address is kept across reloads and back navigation', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await menu.getByRole('link', { name: 'My Goals' }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await page.reload();
  await expect(menu.getByRole('link', { name: 'My Goals' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await menu.getByRole('link', { name: 'Routine Builder' }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(menu.getByRole('link', { name: 'My Goals' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
