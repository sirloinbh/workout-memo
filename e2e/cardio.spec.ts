import { expect, type Page, test } from '@playwright/test';

// #115: the journal's Cardio tab on a 390px phone against the real API and the test DB. A fixed
// past date keeps the session apart from today's dashboard and from the other specs' days.
const day = '2001-04-20';
const memo = `E2E Cardio ${Date.now()}`;

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
const textbox = (dialog: ReturnType<Page['getByRole']>, name: string) =>
  dialog.getByRole('textbox', { name, exact: true });

test.afterAll(async ({ request }) => {
  // Remove leftovers if an assertion failed before the delete step.
  const response = await request.get(`/api/cardio-sessions?from=${day}&to=${day}`);
  for (const s of (await response.json()) as { id: number; memo: string }[])
    if (s.memo === memo) await request.delete(`/api/cardio-sessions/${s.id}`);
});

test("Create, view, edit, and delete running records on the journal's cardio tab and store them in the DB", async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/journal');
  await page
    .getByRole('radiogroup', { name: 'Record type' })
    .getByRole('radio', { name: 'Cardio' })
    .click();
  await expect(page).toHaveURL(/\/journal\?tab=cardio$/);
  // On the cardio tab the panel's own button is the main action.
  await expect(page.getByRole('button', { name: 'Log workout' })).toHaveCount(0);
  await showDay(page);
  await expect(page).toHaveURL(/tab=cardio/);

  // Create: 1 h 2 min 30 s over 12.5 km → 5:00/km, 12 km/h.
  await page.getByRole('button', { name: 'Add cardio record' }).click();
  const editor = page.getByRole('dialog', { name: 'New cardio record' });
  await editor.getByLabel('Type').selectOption({ label: 'Running' });
  await editor.getByLabel('Date', { exact: true }).fill(day);
  await textbox(editor, 'Workout time hours').fill('1');
  await textbox(editor, 'Workout time minutes').fill('2');
  await textbox(editor, 'Workout time seconds').fill('30');
  await textbox(editor, 'Distance km').fill('12.5');
  await editor.getByLabel('Memo (optional)').fill(memo);
  await editor.getByRole('button', { name: 'Save cardio record' }).click();
  await expect(editor).toBeHidden();
  await expect(row(page)).toContainText('1:02:30 · 12.5 km · 5:00/km · 12 km/h');
  await expect(page.getByLabel('Period total')).toContainText('12.5 km');

  // Read back after a reload: the tab and the record come from the address and the server.
  await page.reload();
  await expect(page).toHaveURL(/tab=cardio/);
  await showDay(page);
  await expect(row(page)).toContainText('1:02:30 · 12.5 km · 5:00/km');

  // Update the distance: 10 km → 6:15/km, 9.6 km/h.
  await row(page)
    .getByRole('button', { name: /^Edit cardio record/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Edit cardio record' });
  await textbox(edit, 'Distance km').fill('10');
  await edit.getByRole('button', { name: 'Save cardio record' }).click();
  await expect(edit).toBeHidden();
  await expect(row(page)).toContainText('1:02:30 · 10 km · 6:15/km · 9.6 km/h');
  await page.reload();
  await showDay(page);
  await expect(row(page)).toContainText('10 km · 6:15/km');

  // Delete
  await row(page)
    .getByRole('button', { name: /^Delete cardio record/ })
    .click();
  await expect(row(page)).toHaveCount(0);
  await page.reload();
  await showDay(page);
  await expect(row(page)).toHaveCount(0);
});
