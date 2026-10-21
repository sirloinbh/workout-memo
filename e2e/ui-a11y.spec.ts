import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modals, openModal, openPage, pages } from './support/ui-fixtures.js';

// #113: axe WCAG 2.1 A/AA rules (contrast, labels, roles) on every page and modal, at a
// phone and a desktop width. Low-contrast colors that existed before the check are listed
// per screen in a11y-known-contrast.json until the color work (#98, #100) fixes them; any
// other violation, or a new low-contrast color pair, fails.
// #131: the list only shrinks. One test checks both widths of a screen, so it knows every
// pair the screen still shows and fails on listed pairs that no longer appear, even when
// only some tests run (--grep).
const known = JSON.parse(
  readFileSync(join(__dirname, 'a11y-known-contrast.json'), 'utf8'),
) as Record<string, string[]>;
const widths = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

async function violations(page: Page, screen: string, used: Set<string>, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder.include(include);
  const result = await builder.analyze();
  const allowed = new Set(known[screen] ?? []);
  return result.violations.flatMap((v) => {
    const nodes = v.nodes.filter((n) => {
      if (v.id !== 'color-contrast') return true;
      const data = n.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined;
      const pair = `${data?.fgColor} on ${data?.bgColor}`;
      if (!allowed.has(pair)) return true;
      used.add(pair);
      return false;
    });
    return nodes.length
      ? [{ rule: v.id, help: v.help, nodes: nodes.slice(0, 5).map((n) => n.failureSummary) }]
      : [];
  });
}

async function checkScreen(
  browser: Browser,
  screen: string,
  open: (page: Page) => Promise<unknown>,
  include?: string,
) {
  const used = new Set<string>();
  // A fresh context per width, like separate tests: an opened editor leaves a draft in
  // localStorage that would change the next page.
  const { baseURL, locale, timezoneId } = test.info().project.use;
  for (const viewport of widths) {
    const context = await browser.newContext({ baseURL, locale, timezoneId, viewport });
    try {
      const page = await context.newPage();
      await open(page);
      expect
        .soft(await violations(page, screen, used, include), `${screen} ${viewport.width}px`)
        .toEqual([]);
    } finally {
      await context.close();
    }
  }
  expect(
    (known[screen] ?? []).filter((pair) => !used.has(pair)),
    `${screen}: 허용 목록에 있지만 ${widths.map((w) => w.width).join('·')}px 어디에도 나타나지 않은 조합. 색을 고쳤다면 a11y-known-contrast.json에서 지운다`,
  ).toEqual([]);
}

test('허용 목록은 검사하는 화면만 가리킨다', () => {
  const screens = new Set<string>([...pages, ...modals].map((s) => s.name));
  expect(Object.keys(known).filter((screen) => !screens.has(screen))).toEqual([]);
});

for (const { path, name } of pages)
  test(`${name} 화면 접근성`, async ({ browser }) => {
    await checkScreen(browser, name, (page) => openPage(page, path));
  });
for (const modal of modals)
  test(`${modal.name} 모달 접근성`, async ({ browser }) => {
    await checkScreen(browser, modal.name, (page) => openModal(page, modal), '[role="dialog"]');
  });
