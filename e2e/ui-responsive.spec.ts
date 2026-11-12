import { expect, type Page, test } from '@playwright/test';

import { modals, openModal, openPage, pages, widths } from './support/ui-fixtures.js';

// #113: extends the #71 overflow check to every page and modal at each width, and checks
// that fixed or sticky bars (sidebar, future bottom tabs) never cover page controls.
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// Controls whose center is hidden under a fixed/sticky element at the top of the page,
// or under a bottom bar once the page is scrolled to the end.
function covered(page: Page) {
  return page.evaluate(async () => {
    const pinned = () =>
      [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => {
        const position = getComputedStyle(el).position;
        return (position === 'fixed' || position === 'sticky') && el.getClientRects().length > 0;
      });
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
    const check = (bars: HTMLElement[]) => {
      const found: string[] = [];
      const controls = document.querySelectorAll(
        'main a[href], main button, main input, main select, main textarea',
      );
      for (const el of controls) {
        if (bars.some((bar) => bar.contains(el))) continue;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (!r.width || !r.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight)
          continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && bars.some((bar) => bar.contains(hit))) found.push(name(el));
      }
      return found;
    };
    window.scrollTo(0, 0);
    const top = check(pinned());
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(requestAnimationFrame);
    const bottom = check(
      pinned().filter((bar) => bar.getBoundingClientRect().top > innerHeight / 2),
    );
    window.scrollTo(0, 0);
    return [...new Set([...top, ...bottom])];
  });
}

for (const { width, height } of widths) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height } });
    test('no screen overflows horizontally and fixed elements do not cover controls', async ({
      page,
    }) => {
      for (const { path } of pages) {
        await openPage(page, path);
        expect(await overflow(page), `${path} horizontal overflow (px)`).toBeLessThanOrEqual(0);
        expect(await covered(page), `${path} controls covered by fixed elements`).toEqual([]);
      }
    });
    test('the modal does not overflow horizontally', async ({ page }) => {
      for (const modal of modals) {
        const dialog = await openModal(page, modal);
        expect(await overflow(page), `${modal.name} horizontal overflow (px)`).toBeLessThanOrEqual(
          0,
        );
        const box = (await dialog.boundingBox())!;
        expect(box.x, `${modal.name} left`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${modal.name} right`).toBeLessThanOrEqual(width);
      }
    });
  });
}

// #105: on a phone the workout editor fills the screen, and its save button stays on the
// bottom edge while the long form scrolls; short forms sit on the bottom edge as a sheet.
test.describe('390px mobile modal', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('Journal editing is full screen and the save button stays at the bottom of the screen while scrolling', async ({
    page,
  }) => {
    const dialog = await openModal(page, modals[0]);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeCloseTo(0, 0);
    expect(box.y).toBeCloseTo(0, 0);
    expect(box.width).toBeCloseTo(390, 0);
    expect(box.height).toBeCloseTo(844, 0);
    const save = dialog.getByRole('button', { name: 'Save record' });
    await expect(save).toBeInViewport();
    for (const position of ['middle', 'top'] as const) {
      await dialog.evaluate((el, at) => {
        el.scrollTop = at === 'top' ? 0 : el.scrollHeight / 2;
      }, position);
      const r = (await save.boundingBox())!;
      expect(
        r.y + r.height,
        `${position}: bottom of the page below the save button`,
      ).toBeGreaterThan(844 - 80);
      expect(
        r.y + r.height,
        `${position}: bottom of the page below the save button`,
      ).toBeLessThanOrEqual(844);
    }
  });
  test('A short form opens as a sheet at the bottom of the screen', async ({ page }) => {
    const dialog = await openModal(page, modals[1]);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeCloseTo(0, 0);
    expect(box.width).toBeCloseTo(390, 0);
    expect(box.y + box.height).toBeCloseTo(844, 0);
  });
});

// #105: the rest countdown stays at the top while the editor or the page scrolls.
test.describe('390px rest timer', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('The rest timer stays on top even when you scroll the edit window and dashboard', async ({
    page,
  }) => {
    const dialog = await openModal(page, modals[0]);
    await dialog.getByRole('button', { name: 'Start rest' }).click();
    const bar = (scope: typeof page | typeof dialog) =>
      scope.locator('[data-slot=rest-timer]').getByRole('timer');
    await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
    const inEditor = (await bar(dialog).boundingBox())!;
    expect(inEditor.y, 'Top of the edit window').toBeGreaterThanOrEqual(0);
    expect(inEditor.y, 'Top of the edit window').toBeLessThan(80);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The editor opens from the dashboard; the check needs it to scroll well past the bar.
    const room = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(room, 'Dashboard scroll room (px)').toBeGreaterThan(400);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const onPage = (await bar(page).boundingBox())!;
    // Below the 56px app header, near the top of the screen.
    expect(onPage.y, 'Below the header').toBeGreaterThanOrEqual(56);
    expect(onPage.y, 'Below the header').toBeLessThan(140);
  });
});
