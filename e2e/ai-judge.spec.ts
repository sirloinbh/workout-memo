import { expect, test } from '@playwright/test';

import { expectJudged } from './support/judged.js';

// project-standards ADR-0028, #574 (pilot): Jev judges what a selector cannot, here whether the text of the empty
// body record form is understandable. Without JEV_API_KEY and JEV_API_URL the recorded answers in
// e2e/fixtures/jev/ are replayed; with no recording the checks are skipped (jev-fixture-missing). Only the text of
// the message and the hint is judged, so it is the same on every run (no date, no typed values).
test('the body record form explains what to enter, in the error and in the hint', async ({
  page,
}) => {
  await page.goto('/body');
  await page.getByRole('button', { name: 'Add body record' }).click();
  await page.getByRole('button', { name: 'Save body record' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();

  await expectJudged(
    alert,
    {
      tells_what_to_enter: {
        type: 'noul',
        instructions:
          'The text is the error a form shows after the user pressed Save with every field empty. Does it tell the user what to enter?',
      },
      tone: {
        type: 'choice',
        instructions: 'Which describes this error message for the user who sees it?',
        criteria: {
          actionable: 'Says what the user should do next, politely and briefly',
          vague: 'Says something went wrong without saying what to do',
          blaming: 'Blames the user or is rude',
        },
      },
    },
    { tells_what_to_enter: true, tone: 'actionable' },
  );

  await expectJudged(
    page.getByText('Only one record is saved per date.'),
    {
      explains_rules: {
        type: 'noul',
        instructions:
          'The text is a hint under a form for body measurements. Does it explain that at least one value is required?',
      },
    },
    { explains_rules: true },
  );
});
