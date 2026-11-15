import { expect, test } from '@playwright/test';

// #85: a directly chosen range is requested as-is and survives a reload through the address.
test('A custom range stays in the address and is kept after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Custom', exact: true }).click();
  const form = page.getByRole('form', { name: 'Custom range' });
  await form.getByLabel('Start date').fill('2001-03-01');
  await form.getByLabel('End date').fill('2001-03-31');
  const request = page.waitForRequest((r) =>
    r.url().includes('/api/workouts?from=2001-03-01&to=2001-03-31'),
  );
  await form.getByRole('button', { name: 'Apply' }).click();
  await request;
  await expect(page).toHaveURL(/\?from=2001-03-01&to=2001-03-31$/);
  await expect(page.getByText('2001-03-01 — 2001-03-31')).toBeVisible();

  await page.reload();
  await expect(page.getByText('2001-03-01 — 2001-03-31')).toBeVisible();
  await expect(form.getByLabel('Start date')).toHaveValue('2001-03-01');

  // An end before the start is explained and never requested.
  await form.getByLabel('End date').fill('2001-02-01');
  await form.getByRole('button', { name: 'Apply' }).click();
  await expect(
    form.getByText('The end date must be the same as or after the start date'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\?from=2001-03-01&to=2001-03-31$/);

  // The open range form and the sixth tab still fit a 320px phone (#71 check).
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(form).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
