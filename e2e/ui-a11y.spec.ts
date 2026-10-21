import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modals, openModal, openPage, pages } from './support/ui-fixtures.js';

// #113: axe WCAG 2.1 A/AA rules (contrast, labels, roles) on every page and modal, at a
// phone and a desktop width. Low-contrast colors that existed before the check are listed
// per screen in a11y-known-contrast.json until the color work (#98, #100) fixes them; any
// other violation, or a new low-contrast color pair, fails.
const known = JSON.parse(
  readFileSync(join(__dirname, 'a11y-known-contrast.json'), 'utf8'),
) as Record<string, string[]>;

async function violations(page: Page, screen: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder.include(include);
  const result = await builder.analyze();
  const allowed = new Set(known[screen] ?? []);
  return result.violations.flatMap((v) => {
    const nodes = v.nodes.filter((n) => {
      if (v.id !== 'color-contrast') return true;
      const data = n.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined;
      return !allowed.has(`${data?.fgColor} on ${data?.bgColor}`);
    });
    return nodes.length
      ? [{ rule: v.id, help: v.help, nodes: nodes.slice(0, 5).map((n) => n.failureSummary) }]
      : [];
  });
}

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height } });
    for (const { path, name } of pages)
      test(`${name} 화면 접근성`, async ({ page }) => {
        await openPage(page, path);
        expect(await violations(page, name)).toEqual([]);
      });
    for (const modal of modals)
      test(`${modal.name} 모달 접근성`, async ({ page }) => {
        await openModal(page, modal);
        expect(await violations(page, modal.name, '[role="dialog"]')).toEqual([]);
      });
  });
