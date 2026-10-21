import { expect, test } from '@playwright/test';
import { modals, openModal, openPage, pages, widths } from './support/ui-fixtures.js';

// #113: screenshot baselines are made only in the pinned Playwright container (CI and
// the visual-baseline workflow), because fonts render differently on each OS.
test.skip(!process.env.E2E_VISUAL, 'E2E_VISUAL=1인 Playwright 컨테이너에서만 화면 비교');

for (const { width, height } of widths) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height } });
    for (const { path, name } of pages)
      test(`${name} 화면`, async ({ page }) => {
        await openPage(page, path);
        await expect(page).toHaveScreenshot(`${name}-${width}.png`, { fullPage: true });
      });
    for (const modal of modals)
      test(`${modal.name} 모달`, async ({ page }) => {
        await openModal(page, modal);
        await expect(page).toHaveScreenshot(`${modal.name}-${width}.png`);
      });
  });
}
