import { expect, test } from '@playwright/test';

// #117: today's routine card lists the split's cardio for this routine week, and "Log cardio"
// opens the journal's Cardio tab with a new record filled in from the item. Routines have no
// delete API, so this one starts today under a unique name; the file name sorts before
// new-workout-defaults.spec.ts, whose routine (also starting today) then becomes the active
// one for the specs after it.
const seoul = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const suffix = Date.now();
const memo = 'Routine week 1 · Running · Zone 2 · 30 min';

test.afterAll(async ({ request }) => {
  const response = await request.get(`/api/cardio-sessions?from=${seoul}&to=${seoul}`);
  for (const s of (await response.json()) as { id: number; memo: string }[])
    if (s.memo === memo) await request.delete(`/api/cardio-sessions/${s.id}`);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
])
  test(`At ${viewport.width}px today's routine cardio is logged from the routine card`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const routine = await request.post('/api/routines', {
      data: {
        name: `E2E Cardio Routine ${suffix}-${viewport.width}`,
        progression: 'auto',
        start_date: seoul,
        split_count: 1,
        weekly_workouts: 7,
        rest_days: [],
        splits: [
          {
            name: 'E2E Run day',
            body_parts: ['하체-앞'],
            exercises: [
              { exercise: 'E2E Squat', sets: 2, weight: 60, reps: 10, rep_min: 8, rep_max: 12 },
            ],
            cardio: [
              { kind: 'running', intensity: 'zone2', minutes: 30 },
              {
                kind: 'rowing',
                intensity: 'interval',
                interval: { repeats: 8, work_sec: 60, recovery_sec: 90 },
              },
            ],
          },
        ],
      },
    });
    expect(routine.status()).toBe(201);

    await page.goto('/journal');
    const card = page.getByRole('region', { name: 'Routine goals' });
    await expect(card.getByRole('heading', { name: 'Cardio after strength' })).toBeVisible();
    await expect(card).toContainText('Rowing · Interval · 8 × 1:00 work / 1:30 recovery');
    // Nothing on the card pushes the page sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );

    await card.getByRole('button', { name: 'Log cardio: Running · Zone 2 · 30 min' }).click();
    await expect(page).toHaveURL(/\/journal\?tab=cardio$/);
    const dialog = page.getByRole('dialog', { name: 'New cardio record' });
    await expect(dialog.getByLabel('Type')).toHaveValue('running');
    await expect(dialog.getByRole('textbox', { name: 'Workout time minutes' })).toHaveValue('30');
    await expect(dialog.getByLabel('Memo (optional)')).toHaveValue(memo);
    if (viewport.width === 390) {
      // Saved through the real API, then removed again (afterAll covers a failed step).
      await dialog.getByRole('button', { name: 'Save cardio record' }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page
          .getByRole('list', { name: 'Cardio records' })
          .getByRole('listitem')
          .filter({ hasText: memo }),
      ).toBeVisible();
    } else await dialog.getByRole('button', { name: 'Close' }).click();
  });
