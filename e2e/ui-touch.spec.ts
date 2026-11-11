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
    const targets = `button:not([role="switch"], [role="checkbox"]), a[data-slot="button"], summary, ${fields}`;
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

// #198: what sits inside a closed details is not rendered, so the checks above would skip it.
// Open them all first; only these touch checks see the opened state. Returns how many it found.
const openDetails = (root: Locator) =>
  root.evaluateAll((roots) => {
    let found = 0;
    for (const scope of roots)
      for (const el of scope.querySelectorAll('details')) {
        el.open = true;
        found++;
      }
    return found;
  });

// #198: an InBody CSV export with the four columns found automatically, as in the unit test.
const inbodyCsv = [
  '측정일시,체중(kg),체지방률(%),골격근량(kg),기타',
  '2026.10.01 07:30,72.4,18.3,33.1,x',
  '2026.10.08 07:30,72.0,18.1,33.2,x',
  '잘못된 날짜,71.5,,,x',
].join('\n');

for (const { width, height } of touchWidths) {
  test.describe(`터치 ${width}px`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('모든 화면의 입력·누름 영역이 기준을 지키고 가로로 넘치지 않는다', async ({ page }) => {
      for (const { path } of pages) {
        await openPage(page, path);
        const opened = await openDetails(page.locator('main .legacy'));
        // The analysis page always has its folded rules, so opening cannot silently find nothing.
        if (path === '/analysis') expect(opened, '펼친 details 수').toBeGreaterThan(0);
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
      // #125: pick the exercise from the list first; phones show its detail after the tap.
      await page
        .getByRole('list', { name: '운동 목록' })
        .getByRole('button', { name: /^랫풀다운/ })
        .click();
      await page.getByRole('button', { name: '랫풀다운 부위 지정' }).click();
      await expect(page.getByRole('group', { name: '랫풀다운 부위' })).toBeVisible();
      expect(await violations(page.locator('main .legacy'))).toEqual([]);
      expect(await overflow(page), '가로 넘침(px)').toBeLessThanOrEqual(0);
    });

    // #102: the routine form opens only on demand; the weekday mode adds the rest-day
    // Checkboxes and the manual mode the 12 week fieldsets.
    test('루틴짜기의 루틴 폼이 기준을 지킨다', async ({ page }) => {
      await openPage(page, '/routines');
      await page.getByRole('button', { name: '새 루틴 만들기' }).click();
      await page.getByLabel('운동 일정 방식').selectOption('weekday');
      // #198: the automatic mode shows the 12 week preview inside the form; check it first.
      expect(await violations(page.locator('main .legacy')), '자동 미리보기').toEqual([]);
      await page.getByLabel('주차 목표 방식').selectOption('manual');
      await expect(page.getByRole('checkbox', { name: '월' })).toBeVisible();
      await openDetails(page.locator('main .legacy'));
      expect(await violations(page.locator('main .legacy'))).toEqual([]);
      expect(await overflow(page), '가로 넘침(px)').toBeLessThanOrEqual(0);
    });

    // #198: the body record form and the InBody import open only on demand; the preview table
    // with its row Checkboxes appears only after a file is read.
    test('신체 기록의 기록 폼과 인바디 미리보기가 기준을 지킨다', async ({ page }) => {
      await openPage(page, '/body');
      await page.getByRole('button', { name: '신체 기록 추가' }).click();
      await expect(page.getByRole('button', { name: '신체 기록 저장' })).toBeVisible();
      expect(await violations(page.locator('main .legacy')), '기록 폼').toEqual([]);
      expect(await overflow(page), '기록 폼 가로 넘침(px)').toBeLessThanOrEqual(0);

      await page.getByRole('button', { name: '인바디 가져오기' }).click();
      const panel = page.getByRole('region', { name: '인바디 가져오기' });
      await panel.getByLabel('인바디 파일 또는 결과지 사진').setInputFiles({
        name: 'inbody.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(inbodyCsv),
      });
      await expect(panel.getByRole('region', { name: '인바디 미리보기' })).toBeVisible();
      await expect(panel.getByRole('checkbox', { name: '1행 저장' })).toBeVisible();
      expect(await violations(page.locator('main .legacy')), '인바디 미리보기').toEqual([]);
      expect(await overflow(page), '인바디 미리보기 가로 넘침(px)').toBeLessThanOrEqual(0);
    });
  });
}

test.describe('터치 내비게이션', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('메뉴에 현재 페이지가 표시되고 고르면 그 페이지로 간다', async ({ page }) => {
    await openPage(page, '/goals');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog').getByRole('navigation', { name: 'Main menu' });
    await expect(menu.getByRole('link', { name: '나의 목표' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu.getByRole('link', { name: '운동 일지' }).click();
    await expect(page).toHaveURL(/\/journal$/);
  });
});

// #125: on a phone the exercise list is on the first screen and an exercise's detail is one tap
// away; going back shows the list again.
test.describe('종목 분석 모바일 정보 구조', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('첫 화면에 운동 목록이 보이고 한 번 눌러 상세로 간다', async ({ page }) => {
    await openPage(page, '/analysis');
    const list = page.getByRole('list', { name: '운동 목록' });
    const first = list.getByRole('button').first();
    await expect(first).toBeInViewport();
    await expect(page.getByRole('heading', { level: 3, name: '랫풀다운' })).toBeHidden();
    await list.getByRole('button', { name: /^랫풀다운/ }).click();
    const heading = page.getByRole('heading', { level: 3, name: '랫풀다운' });
    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: '운동 목록' }).click();
    await expect(list).toBeVisible();
  });
});
