import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

// #119: importing a TCX file on a 390px phone against the real API and the test DB. The
// fixture's start is moved to a fixed past day (and a unique note) so the run never meets the
// other specs' sessions; 22:10 UTC on 04-21 is 07:10 on 04-22 in Seoul.
const day = '2001-04-22';
const memo = `E2E 가져오기 ${Date.now()}`;
const tcx = readFileSync(join(__dirname, '../frontend/src/cardio/fixtures/garmin-run.tcx'), 'utf8')
  .replaceAll('2026-11-01T22:', '2001-04-21T22:')
  .replace('<Notes>아침 한강</Notes>', `<Notes>${memo}</Notes>`);
const file = { name: 'run.tcx', mimeType: 'application/xml', buffer: Buffer.from(tcx) };

test.use({ viewport: { width: 390, height: 844 } });

async function showDay(page: Page) {
  await page.getByLabel('기준 날짜').fill(day);
  await page.getByRole('radio', { name: '1일', exact: true }).click();
  await expect(page.getByText(`${day} — ${day}`)).toBeVisible();
}
const row = (page: Page) =>
  page.getByRole('list', { name: '유산소 기록' }).getByRole('listitem').filter({ hasText: memo });
async function choose(page: Page) {
  await page.getByRole('button', { name: '파일 가져오기' }).click();
  const card = page.getByRole('region', { name: '활동 파일 가져오기' });
  await card.getByLabel('활동 파일 (TCX·GPX)').setInputFiles(file);
  await expect(card.getByRole('region', { name: '가져올 활동 미리보기' })).toBeVisible();
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

test('유산소 탭에서 TCX 파일을 미리보기로 확인해 저장하면 목록에 보이고, 같은 파일은 다시 저장할 수 없다', async ({
  page,
}) => {
  await page.goto('/journal?tab=cardio');
  await showDay(page);

  const card = await choose(page);
  const save = card.getByRole('checkbox', { name: '1행 저장' });
  await expect(save).toBeChecked();
  await expect(card.getByLabel('1행 날짜')).toHaveValue(day);
  await expect(card.getByLabel('1행 시작 시각')).toHaveValue('07:10');
  await expect(card).toContainText('20:10 · 4.006 km · 평균 심박 145');
  await card.getByRole('button', { name: '선택한 1건 저장' }).click();
  await expect(page.getByText('유산소 기록 1건을 가져왔습니다').first()).toBeVisible();
  await expect(row(page)).toContainText('20:10 · 4.006 km');

  // Stored in the DB: still there after a reload.
  await page.reload();
  await showDay(page);
  await expect(row(page)).toContainText('20:10 · 4.006 km');

  // The same file again: already imported, so it cannot be chosen.
  const again = await choose(page);
  await expect(again.getByRole('checkbox', { name: '1행 저장' })).toBeDisabled();
  await expect(again).toContainText('이미 가져온 기록입니다');
  await expect(again.getByRole('button', { name: '선택한 0건 저장' })).toBeDisabled();
});
