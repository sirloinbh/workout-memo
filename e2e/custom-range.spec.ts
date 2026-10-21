import { expect, test } from '@playwright/test';

// #85: a directly chosen range is requested as-is and survives a reload through the address.
test('직접 선택한 기간은 주소에 남아 새로고침 후에도 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '직접 선택', exact: true }).click();
  const form = page.getByRole('form', { name: '기간 직접 선택' });
  await form.getByLabel('시작일').fill('2001-03-01');
  await form.getByLabel('종료일').fill('2001-03-31');
  const request = page.waitForRequest((r) =>
    r.url().includes('/api/workouts?from=2001-03-01&to=2001-03-31'),
  );
  await form.getByRole('button', { name: '적용' }).click();
  await request;
  await expect(page).toHaveURL(/\?from=2001-03-01&to=2001-03-31$/);
  await expect(page.getByText('2001-03-01 — 2001-03-31')).toBeVisible();

  await page.reload();
  await expect(page.getByText('2001-03-01 — 2001-03-31')).toBeVisible();
  await expect(form.getByLabel('시작일')).toHaveValue('2001-03-01');

  // An end before the start is explained and never requested.
  await form.getByLabel('종료일').fill('2001-02-01');
  await form.getByRole('button', { name: '적용' }).click();
  await expect(form.getByText('종료일은 시작일과 같거나 이후여야 합니다')).toBeVisible();
  await expect(page).toHaveURL(/\?from=2001-03-01&to=2001-03-31$/);

  // The open range form and the sixth tab still fit a 320px phone (#71 check).
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(form).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
