import { expect, test } from '@playwright/test';

// #82: a new journal is dated today (Asia/Seoul) with a date title, and today's routine
// fills its sets including the planned machine. Routines and machines have no delete API,
// so this scenario uses unique names; a later routine starting today wins as the active one.
const seoul = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
// "Tue, Oct 20"
const title = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
}).format(new Date(seoul + 'T00:00:00Z'));
const suffix = Date.now();

test("A new journal starts with today's date and title and the sets and machines from today's routine", async ({
  page,
  request,
}) => {
  const brands = (await (await request.get('/api/brands')).json()) as { id: number }[];
  const machine = await request.post('/api/machines', {
    data: { brand_id: brands[0].id, name: `E2E Leg Press ${suffix}`, base_weight: 50, notes: '' },
  });
  expect(machine.status()).toBe(201);
  const machineId = ((await machine.json()) as { id: number }).id;
  const routine = await request.post('/api/routines', {
    data: {
      name: `E2E Routine ${suffix}`,
      progression: 'auto',
      start_date: seoul,
      split_count: 1,
      weekly_workouts: 7,
      rest_days: [],
      splits: [
        {
          name: 'E2E Legs',
          body_parts: ['하체-앞'],
          exercises: [
            {
              exercise: `E2E Leg Press ${suffix}`,
              machine_id: machineId,
              sets: 2,
              weight: 150,
              reps: 10,
              rep_min: 8,
              rep_max: 12,
            },
          ],
        },
      ],
    },
  });
  expect(routine.status()).toBe(201);

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Workout journal' })
    .click();
  // Browsing another day does not change the new journal's date.
  await page.getByLabel('Reference date').fill('2001-03-15');
  await expect(page.getByRole('button', { name: "Log with today's routine" })).toBeVisible();
  await page.getByRole('button', { name: 'Log workout' }).first().click();
  const editor = page.getByRole('dialog', { name: 'New workout record' });
  await expect(editor.getByLabel('Workout date')).toHaveValue(seoul);
  await expect(editor.getByLabel('Journal title')).toHaveValue(title);
  const sets = editor.locator('[data-slot=set-row]');
  await expect(sets).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(sets.nth(i).getByLabel('Exercise name')).toHaveValue(`E2E Leg Press ${suffix}`);
    await expect(sets.nth(i).getByLabel('Machine')).toHaveValue(String(machineId));
    await expect(sets.nth(i).getByLabel('Total weight kg', { exact: true })).toHaveValue('150');
    await expect(sets.nth(i).getByLabel('Reps', { exact: true })).toHaveValue('10');
  }
});
