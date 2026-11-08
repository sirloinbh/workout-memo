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
    test('모든 화면이 가로로 넘치지 않고 고정 요소가 조작 요소를 가리지 않는다', async ({
      page,
    }) => {
      for (const { path } of pages) {
        await openPage(page, path);
        expect(await overflow(page), `${path} 가로 넘침(px)`).toBeLessThanOrEqual(0);
        expect(await covered(page), `${path} 고정 요소에 가려진 조작 요소`).toEqual([]);
      }
    });
    test('모달이 가로로 넘치지 않는다', async ({ page }) => {
      for (const modal of modals) {
        const dialog = await openModal(page, modal);
        expect(await overflow(page), `${modal.name} 가로 넘침(px)`).toBeLessThanOrEqual(0);
        const box = (await dialog.boundingBox())!;
        expect(box.x, `${modal.name} 왼쪽`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${modal.name} 오른쪽`).toBeLessThanOrEqual(width);
      }
    });
  });
}

// #105: on a phone the workout editor fills the screen, and its save button stays on the
// bottom edge while the long form scrolls; short forms sit on the bottom edge as a sheet.
test.describe('390px 모바일 모달', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('일지 편집은 전체 화면이고 저장 버튼이 스크롤 중에도 화면 아래에 보인다', async ({
    page,
  }) => {
    const dialog = await openModal(page, modals[0]);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeCloseTo(0, 0);
    expect(box.y).toBeCloseTo(0, 0);
    expect(box.width).toBeCloseTo(390, 0);
    expect(box.height).toBeCloseTo(844, 0);
    const save = dialog.getByRole('button', { name: '기록 저장하기' });
    await expect(save).toBeInViewport();
    for (const position of ['middle', 'top'] as const) {
      await dialog.evaluate((el, at) => {
        el.scrollTop = at === 'top' ? 0 : el.scrollHeight / 2;
      }, position);
      const r = (await save.boundingBox())!;
      expect(r.y + r.height, `${position} 저장 버튼 아래 끝`).toBeGreaterThan(844 - 80);
      expect(r.y + r.height, `${position} 저장 버튼 아래 끝`).toBeLessThanOrEqual(844);
    }
  });
  test('짧은 폼은 화면 아래 시트로 뜬다', async ({ page }) => {
    const dialog = await openModal(page, modals[1]);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeCloseTo(0, 0);
    expect(box.width).toBeCloseTo(390, 0);
    expect(box.y + box.height).toBeCloseTo(844, 0);
  });
});
