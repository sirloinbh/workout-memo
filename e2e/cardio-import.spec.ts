import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

// #119: importing a TCX file on a 390px phone against the real API and the test DB. The
// fixture's start is moved to a fixed past day (and a unique note) so the run never meets the
// other specs' sessions; 22:10 UTC on 04-21 is 07:10 on 04-22 in Seoul.
const day = '2001-04-22';
const memo = `E2E Import ${Date.now()}`;
const tcx = readFileSync(join(__dirname, '../frontend/src/cardio/fixtures/garmin-run.tcx'), 'utf8')
  .replaceAll('2026-11-01T22:', '2001-04-21T22:')
  .replace('<Notes>Morning Han River</Notes>', `<Notes>${memo}</Notes>`);
const file = { name: 'run.tcx', mimeType: 'application/xml', buffer: Buffer.from(tcx) };

test.use({ viewport: { width: 390, height: 844 } });

async function showDay(page: Page) {
  await page.getByLabel('Reference date').fill(day);
  await page.getByRole('radio', { name: '1 day', exact: true }).click();
  await expect(page.getByText(`${day} — ${day}`)).toBeVisible();
}
const row = (page: Page) =>
  page
    .getByRole('list', { name: 'Cardio records' })
    .getByRole('listitem')
    .filter({ hasText: memo });
async function choose(page: Page) {
  await page.getByRole('button', { name: 'Import file' }).click();
  const card = page.getByRole('region', { name: 'Import activity file' });
  await card.getByLabel('Activity file (TCX/GPX)').setInputFiles(file);
  await expect(card.getByRole('region', { name: 'Import preview' })).toBeVisible();
  return card;
}

// The file's id is fixed, so a row left by a failed run would read as "already imported":
// it is removed before and after the test.
const externalId = '2001-04-21T22:10:05Z';
async function cleanUp({ request }: { request: APIRequestContext }) {
  const response = await request.get(`/api/cardio-sessions?from=${day}&to=${day}`);
  for (const s of (await response.json()) as { id: number; external_id: string | null }[])
    if (s.external_id === externalId) await request.delete(`/api/cardio-sessions/${s.id}`);
}
test.beforeAll(cleanUp);
test.afterAll(cleanUp);

test('previews a TCX file on the cardio tab, lists it once saved and refuses the same file again', async ({
  page,
}) => {
  await page.goto('/journal?tab=cardio');
  await showDay(page);

  const card = await choose(page);
  const save = card.getByRole('checkbox', { name: 'Save row 1' });
  await expect(save).toBeChecked();
  await expect(card.getByLabel('Row 1 date')).toHaveValue(day);
  await expect(card.getByLabel('Row 1 start time')).toHaveValue('07:10');
  await expect(card).toContainText('20:10 · 4.006 km · Avg heart rate 145');
  await card.getByRole('button', { name: 'Save 1 selected' }).click();
  await expect(page.getByText('Imported 1 cardio record').first()).toBeVisible();
  await expect(row(page)).toContainText('20:10 · 4.006 km');

  // Stored in the DB: still there after a reload.
  await page.reload();
  await showDay(page);
  await expect(row(page)).toContainText('20:10 · 4.006 km');

  // The same file again: already imported, so it cannot be chosen.
  const again = await choose(page);
  await expect(again.getByRole('checkbox', { name: 'Save row 1' })).toBeDisabled();
  await expect(again).toContainText('Already imported');
  await expect(again.getByRole('button', { name: 'Save 0 selected' })).toBeDisabled();
});
