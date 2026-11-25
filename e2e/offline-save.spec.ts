import { expect, type Page, test } from '@playwright/test';

// #476: a log saved with the network off waits on the phone and appears in the list once back online.
const day = '2001-04-16';
const title = `E2E Offline ${Date.now()}`;

async function showDay(page: Page) {
  await page.getByLabel('Reference date').fill(day);
  await page.getByRole('radio', { name: '1 day', exact: true }).click();
  await expect(page.getByText(`${day} — ${day}`)).toBeVisible();
}

test.afterAll(async ({ request }) => {
  const response = await request.get(`/api/workouts?from=${day}&to=${day}`);
  for (const w of (await response.json()) as { id: number; title: string }[])
    if (w.title === title) await request.delete(`/api/workouts/${w.id}`);
});

test('a log saved offline is queued and sent once, then shows in the list', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await showDay(page);
  await page.getByRole('button', { name: 'Log workout' }).first().click();
  const editor = page.getByRole('dialog', { name: 'New workout record' });
  await editor.getByLabel('Workout date').fill(day);
  await editor.getByLabel('Journal title').fill(title);
  const sets = editor.locator('[data-slot=set-row]');
  while ((await sets.count()) > 1)
    await sets.last().getByRole('button', { name: 'Delete set' }).click();
  await editor.getByLabel('Exercise name').fill('E2E Offline Squat');
  await editor.getByLabel('Total weight kg', { exact: true }).fill('80');
  await editor.getByLabel('Reps', { exact: true }).fill('5');

  await context.setOffline(true);
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText(/waiting on this phone/)).toBeVisible();

  await context.setOffline(false);
  const row = page.locator('[data-slot=workout-row]', { hasText: title });
  await expect(row).toBeVisible();
  await expect(page.getByText(/waiting on this phone/)).toBeHidden();

  const all = await page.request.get(`/api/workouts?from=${day}&to=${day}`);
  const mine = ((await all.json()) as { title: string }[]).filter((w) => w.title === title);
  expect(mine).toHaveLength(1);
});
