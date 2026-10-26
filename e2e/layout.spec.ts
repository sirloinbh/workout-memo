import { expect, test } from '@playwright/test';

// #71: no page may scroll sideways on a phone. #159: the main menu opens as a sheet there.
const pages = [
  '/',
  '/journal',
  '/goals',
  '/analysis',
  '/routines',
  '/body',
  '/machines',
  '/backup',
];

for (const width of [320, 390])
  test(`페이지가 ${width}px 폭에서 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${path} scrollWidth`).toBeLessThanOrEqual(width);
    }
    // #159: on a phone the main menu opens as a sheet from the top bar. Every menu link
    // stays visible and inside the viewport.
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const sheet = page.getByRole('dialog');
    // Measure after the sheet has slid in.
    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const links = sheet.getByRole('navigation', { name: '주 메뉴' }).getByRole('link');
    await expect(links).toHaveCount(8);
    for (const box of await links.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
  });
