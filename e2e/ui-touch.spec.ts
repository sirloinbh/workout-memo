import { expect, type Locator, type Page, test } from '@playwright/test';

import { modals, openModal, openPage, pages, widths } from './support/ui-fixtures.js';

// #104: on touch screens page controls stay 44px to tap and fields use 16px text, the size
// below which iOS zooms in on focus. Only touch screens change, so the visual baselines,
// taken without touch, stay as they are.
const touchWidths = widths.filter(({ width }) => width < 1280);

// Controls under the given root that break either rule, described for the failure message.
function violations(root: Locator) {
  return root.evaluateAll((roots) => {
    const found: string[] = roots.length ? [] : ['No .legacy area to check'];
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
        if (size < 16) found.push(`${name(el)} font ${size}px`);
      }
      for (const el of scope.querySelectorAll(targets)) {
        if (!visible(el)) continue;
        const { width, height } = el.getBoundingClientRect();
        if (height < 44) found.push(`${name(el)} height ${height}px`);
        if (el.tagName === 'BUTTON' && width < 44) found.push(`${name(el)} width ${width}px`);
      }
      // A switch and the common Checkbox keep their small size and are tapped through an
      // invisible ::after area.
      for (const el of scope.querySelectorAll('[role="switch"], [role="checkbox"]')) {
        if (!visible(el)) continue;
        const area = getComputedStyle(el, '::after');
        const height = parseFloat(area.height);
        const width = parseFloat(area.width);
        if (!(height >= 44 && width >= 44))
          found.push(`${el.getAttribute('role')} "${el.id}" tap area ${width}×${height}px`);
        // The box itself must not grow into a 44px square (the legacy button rule does that).
        const box = el.getBoundingClientRect();
        if (el.getAttribute('role') === 'checkbox' && (box.width > 24 || box.height > 24))
          found.push(`checkbox "${el.id}" box ${box.width}×${box.height}px`);
      }
      // A checkbox is tapped through its label. Radix's hidden twin of a switch is not tapped.
      for (const el of scope.querySelectorAll('input[type="checkbox"]:not([aria-hidden="true"])')) {
        if (!visible(el)) continue;
        const height = (el.closest('label') ?? el).getBoundingClientRect().height;
        if (height < 44)
          found.push(
            `Checkbox "${el.closest('label')?.textContent?.trim().slice(0, 20)}" height ${height}px`,
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
  test.describe(`Touch ${width}px`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('inputs and tap targets on every screen meet the standard and do not overflow horizontally', async ({
      page,
    }) => {
      for (const { path } of pages) {
        await openPage(page, path);
        const opened = await openDetails(page.locator('main .legacy'));
        // The analysis page always has its folded rules, so opening cannot silently find nothing.
        if (path === '/analysis') expect(opened, 'Open details count').toBeGreaterThan(0);
        expect(await violations(page.locator('main .legacy')), path).toEqual([]);
        expect(await overflow(page), `${path} horizontal overflow (px)`).toBeLessThanOrEqual(0);
      }
    });

    test('modal inputs and tap targets meet the standard and do not overflow horizontally', async ({
      page,
    }) => {
      for (const modal of modals) {
        const dialog = await openModal(page, modal);
        expect(await violations(dialog), modal.name).toEqual([]);
        expect(await overflow(page), `${modal.name} horizontal overflow (px)`).toBeLessThanOrEqual(
          0,
        );
        const inner = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(inner, `${modal.name} modal horizontal overflow (px)`).toBeLessThanOrEqual(0);
      }
    });

    // #102: the body-part chips appear only after opening the editor, so the page check above
    // never sees them; this keeps their 44px touch size from regressing.
    test('the body part chips in Exercise Analysis meet the standard', async ({ page }) => {
      await openPage(page, '/analysis');
      // #125: pick the exercise from the list first; phones show its detail after the tap.
      await page
        .getByRole('list', { name: 'Exercise list' })
        .getByRole('button', { name: /^Lat Pulldown/ })
        .click();
      await page.getByRole('button', { name: 'Set body part for Lat Pulldown' }).click();
      await expect(page.getByRole('group', { name: 'Body part for Lat Pulldown' })).toBeVisible();
      expect(await violations(page.locator('main .legacy'))).toEqual([]);
      expect(await overflow(page), 'Horizontal overflow (px)').toBeLessThanOrEqual(0);
    });

    // #102: the routine form opens only on demand; the weekday mode adds the rest-day
    // Checkboxes and the manual mode the 12 week fieldsets.
    test('the Routine Builder form meets the standards', async ({ page }) => {
      await openPage(page, '/routines');
      await page.getByRole('button', { name: 'Create new routine' }).click();
      await page.getByLabel('Workout schedule type').selectOption('weekday');
      // #198: the automatic mode shows the 12 week preview inside the form; check it first.
      expect(await violations(page.locator('main .legacy')), 'Auto preview').toEqual([]);
      await page.getByLabel('Weekly goal mode').selectOption('manual');
      await expect(page.getByRole('checkbox', { name: 'Mon' })).toBeVisible();
      await openDetails(page.locator('main .legacy'));
      expect(await violations(page.locator('main .legacy'))).toEqual([]);
      expect(await overflow(page), 'Horizontal overflow (px)').toBeLessThanOrEqual(0);
    });

    // #198: the body record form and the InBody import open only on demand; the preview table
    // with its row Checkboxes appears only after a file is read.
    test('the body record form and InBody preview meet the standards', async ({ page }) => {
      await openPage(page, '/body');
      await page.getByRole('button', { name: 'Add body record' }).click();
      await expect(page.getByRole('button', { name: 'Save body record' })).toBeVisible();
      expect(await violations(page.locator('main .legacy')), 'Record form').toEqual([]);
      expect(await overflow(page), 'Record form horizontal overflow (px)').toBeLessThanOrEqual(0);

      await page.getByRole('button', { name: 'Import InBody' }).click();
      const panel = page.getByRole('region', { name: 'Import InBody' });
      await panel.getByLabel('InBody file or result sheet photo').setInputFiles({
        name: 'inbody.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(inbodyCsv),
      });
      await expect(panel.getByRole('region', { name: 'InBody preview' })).toBeVisible();
      await expect(panel.getByRole('checkbox', { name: 'Save row 1' })).toBeVisible();
      expect(await violations(page.locator('main .legacy')), 'InBody preview').toEqual([]);
      expect(await overflow(page), 'InBody preview horizontal overflow (px)').toBeLessThanOrEqual(
        0,
      );
    });
  });
}

test.describe('Touch navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('The menu shows the current page and choosing an item goes to that page', async ({
    page,
  }) => {
    await openPage(page, '/goals');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog').getByRole('navigation', { name: 'Main menu' });
    await expect(menu.getByRole('link', { name: 'My Goals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu.getByRole('link', { name: 'Workout journal' }).click();
    await expect(page).toHaveURL(/\/journal$/);
  });
});

// #125: on a phone the exercise list is on the first screen and an exercise's detail is one tap
// away; going back shows the list again.
test.describe('Exercise Analysis mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('The first screen shows the exercise list and one tap goes to the detail', async ({
    page,
  }) => {
    await openPage(page, '/analysis');
    const list = page.getByRole('list', { name: 'Exercise list' });
    const first = list.getByRole('button').first();
    await expect(first).toBeInViewport();
    await expect(page.getByRole('heading', { level: 3, name: 'Lat Pulldown' })).toBeHidden();
    await list.getByRole('button', { name: /^Lat Pulldown/ }).click();
    const heading = page.getByRole('heading', { level: 3, name: 'Lat Pulldown' });
    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: 'Exercise list' }).click();
    await expect(list).toBeVisible();
  });
});
