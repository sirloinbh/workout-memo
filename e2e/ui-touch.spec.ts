import { expect, type Locator, type Page, test } from '@playwright/test';

import { modals, openModal, openPage, pages, widths } from './support/ui-fixtures.js';

// #104: on touch screens page controls stay 44px to tap and fields use 16px text, the size
// below which iOS zooms in on focus. Only touch screens change, so the visual baselines,
// taken without touch, stay as they are.
const touchWidths = widths.filter(({ width }) => width < 1280);

// Controls under the given root that break either rule, described for the failure message.
function violations(root: Locator) {
  return root.evaluateAll((roots) => {
    const found: string[] = roots.length ? [] : ['검사할 .legacy 영역 없음'];
    const visible = (el: Element) => el.getClientRects().length > 0;
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20)}"`;
    const fields =
      'input:not([type="checkbox"], [type="radio"], [type="hidden"]), select, textarea';
    const targets = `button:not([role="switch"], [role="checkbox"]), summary, a.primary, ${fields}`;
    for (const scope of roots) {
      for (const el of scope.querySelectorAll(fields)) {
        if (!visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 16) found.push(`${name(el)} 글자 ${size}px`);
      }
      for (const el of scope.querySelectorAll(targets)) {
        if (!visible(el)) continue;
        const { width, height } = el.getBoundingClientRect();
        if (height < 44) found.push(`${name(el)} 높이 ${height}px`);
        if (el.tagName === 'BUTTON' && width < 44) found.push(`${name(el)} 너비 ${width}px`);
      }
      // A switch and the common Checkbox keep their small size and are tapped through an
      // invisible ::after area.
      for (const el of scope.querySelectorAll('[role="switch"], [role="checkbox"]')) {
        if (!visible(el)) continue;
        const area = getComputedStyle(el, '::after');
        const height = parseFloat(area.height);
        const width = parseFloat(area.width);
        if (!(height >= 44 && width >= 44))
          found.push(`${el.getAttribute('role')} "${el.id}" 누름 영역 ${width}×${height}px`);
        // The box itself must not grow into a 44px square (the legacy button rule does that).
        const box = el.getBoundingClientRect();
        if (el.getAttribute('role') === 'checkbox' && (box.width > 24 || box.height > 24))
          found.push(`checkbox "${el.id}" 상자 ${box.width}×${box.height}px`);
      }
      // A checkbox is tapped through its label. Radix's hidden twin of a switch is not tapped.
      for (const el of scope.querySelectorAll('input[type="checkbox"]:not([aria-hidden="true"])')) {
        if (!visible(el)) continue;
        const height = (el.closest('label') ?? el).getBoundingClientRect().height;
        if (height < 44)
          found.push(
            `체크박스 "${el.closest('label')?.textContent?.trim().slice(0, 20)}" 높이 ${height}px`,
          );
      }
    }
    return found;
  });
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const { width, height } of touchWidths) {
  test.describe(`터치 ${width}px`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('모든 화면의 입력·누름 영역이 기준을 지키고 가로로 넘치지 않는다', async ({ page }) => {
      for (const { path } of pages) {
        await openPage(page, path);
        expect(await violations(page.locator('main .legacy')), path).toEqual([]);
        expect(await overflow(page), `${path} 가로 넘침(px)`).toBeLessThanOrEqual(0);
      }
    });

    test('모달의 입력·누름 영역이 기준을 지키고 가로로 넘치지 않는다', async ({ page }) => {
      for (const modal of modals) {
        const dialog = await openModal(page, modal);
        expect(await violations(dialog), modal.name).toEqual([]);
        expect(await overflow(page), `${modal.name} 가로 넘침(px)`).toBeLessThanOrEqual(0);
        const inner = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(inner, `${modal.name} 모달 안 가로 넘침(px)`).toBeLessThanOrEqual(0);
      }
    });

    // #102: the body-part chips appear only after opening the editor, so the page check above
    // never sees them; this keeps their 44px touch size from regressing.
    test('종목 분석의 부위 지정 칩이 기준을 지킨다', async ({ page }) => {
      await openPage(page, '/analysis');
      await page.getByRole('button', { name: '랫풀다운 부위 지정' }).click();
      await expect(page.getByRole('group', { name: '랫풀다운 부위' })).toBeVisible();
      expect(await violations(page.locator('main .legacy'))).toEqual([]);
      expect(await overflow(page), '가로 넘침(px)').toBeLessThanOrEqual(0);
    });
  });
}

test.describe('터치 내비게이션', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('메뉴에 현재 페이지가 표시되고 고르면 그 페이지로 간다', async ({ page }) => {
    await openPage(page, '/goals');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const menu = page.getByRole('dialog').getByRole('navigation', { name: '주 메뉴' });
    await expect(menu.getByRole('link', { name: '나의 목표' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu.getByRole('link', { name: '운동 일지' }).click();
    await expect(page).toHaveURL(/\/journal$/);
  });
});
