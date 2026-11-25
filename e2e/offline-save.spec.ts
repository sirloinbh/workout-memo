import AxeBuilder from '@axe-core/playwright';
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
  await expect(page.getByRole('list', { name: 'Logs waiting to sync' })).toBeVisible();
  await expect(page.locator('[data-slot=sync-badge]')).toHaveText('1 waiting to sync');
  // #483: the waiting mark and the shell count pass axe and fit at phone and desktop widths.
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('[data-slot=sync-badge]')
      .include('[aria-label="Logs waiting to sync"]')
      .analyze();
    expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
  }

  await context.setOffline(false);
  const row = page.locator('[data-slot=workout-row]', { hasText: title });
  await expect(row).toBeVisible();
  await expect(page.locator('[data-slot=sync-badge]')).toBeHidden();

  const all = await page.request.get(`/api/workouts?from=${day}&to=${day}`);
  const mine = ((await all.json()) as { title: string }[]).filter((w) => w.title === title);
  expect(mine).toHaveLength(1);
});
