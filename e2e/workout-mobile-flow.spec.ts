import { expect, type Locator, type Page, test } from '@playwright/test';

// #105 completion check: on a 390px touch screen, "new journal → enter and complete three
// sets → save" works end to end, and the gestures it takes are counted so the result can
// be compared with the UI before #105 (docs/changes/105-mobile-flow.md). The same script
// ran on the pre-#105 commit; it only uses names both versions share.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

// Korean user data, kept so the key counts match the earlier measurement.
const exercise = '벤치프레스';
const weight = '60';
let saved: number | undefined;

test.afterAll(async ({ request }) => {
  if (saved !== undefined) await request.delete(`/api/workouts/${saved}`);
});

type Point = { x: number; y: number };

// A tap counts as reachable when the point it lands on is on screen and not under another
// element (a pinned bar). Otherwise the user first swipes once to bring the control into
// view: a lower bound, since a long way may take several. Each swipe is logged with the
// control it was for.
function counter(page: Page) {
  const count = { taps: 0, keys: 0, scrolls: 0 };
  const scrolledAt: string[] = [];
  const reachable = (el: Locator, at?: Point) =>
    el.evaluate((node, at) => {
      const r = node.getBoundingClientRect();
      const x = r.left + (at?.x ?? r.width / 2);
      const y = r.top + (at?.y ?? r.height / 2);
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === node || node.contains(hit));
    }, at);
  return {
    count,
    scrolledAt,
    async tap(name: string, el: Locator, at?: Point) {
      if (!(await reachable(el, at))) {
        count.scrolls++;
        scrolledAt.push(name);
        await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      }
      count.taps++;
      await el.tap(at && { position: at });
    },
    async type(text: string) {
      count.keys += text.length;
      await page.keyboard.type(text);
    },
    async press(key: string) {
      count.keys++;
      await page.keyboard.press(key);
    },
  };
}

test('enters, completes, and saves three sets in a new journal on a 390px touch screen', async ({
  page,
}) => {
  // Without today's routine a new journal starts with three blank sets; other specs may
  // leave a routine starting today in the shared test DB.
  await page.route('**/api/routine-progress', async (route) => {
    const response = await route.fetch();
    const { today } = (await response.json()) as { today: string };
    await route.fulfill({ response, json: { today, routine: null } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log workout' }).first()).toBeEnabled();
  const user = counter(page);
  const started = Date.now();

  await user.tap('open journal', page.getByRole('button', { name: 'Log workout' }).first());
  const editor = page.getByRole('region', { name: 'New workout record' });
  const sets = editor.locator('[data-slot=set-row]');
  await expect(sets).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const set = sets.nth(i);
    await user.tap(`set ${i + 1} exercise`, set.getByLabel('Exercise name'));
    await user.type(exercise);
    // The weight starts at 0. Tapping the field's right end puts the caret after it in both
    // versions (left-aligned before #105, centred after), so one backspace clears it.
    const field = set.getByLabel('Total weight kg', { exact: true });
    const box = (await field.boundingBox())!;
    await user.tap(`set ${i + 1} weight`, field, { x: box.width - 6, y: box.height / 2 });
    await user.press('Backspace');
    await user.type(weight);
    // Before #105 the number field put the 0 back after the backspace and showed "060",
    // still read as 60; the same script runs on both versions, so compare the number.
    await expect.poll(async () => Number(await field.inputValue())).toBe(Number(weight));
    // Reps keep the default 10.
    const done = set.getByRole('button', { name: `Set ${i + 1} done` });
    await user.tap(`set ${i + 1} done`, done);
    await expect(done).toHaveAttribute('aria-pressed', 'true');
  }
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/workouts',
  );
  await user.tap('save', editor.getByRole('button', { name: 'Save record' }));
  const created = await response;
  // Registered for cleanup before any later check can fail.
  if (created.status() === 201) saved = ((await created.json()) as { id: number }).id;
  expect(created.status()).toBe(201);
  await expect(editor).toBeHidden();
  const elapsed = Date.now() - started;

  // The journal is dated by the browser when it was opened; read it back by that date.
  const day = (created.request().postDataJSON() as { date: string }).date;
  const list = await page.request.get(`/api/workouts?from=${day}&to=${day}`);
  const workout = ((await list.json()) as { id: number; sets: unknown[] }[]).find(
    (w) => w.id === saved,
  );
  expect(workout).toBeDefined();
  expect(workout!.sets).toEqual(
    Array.from({ length: 3 }, () =>
      expect.objectContaining({ exercise, weight: 60, reps: 10, completed: true }),
    ),
  );

  const result = { ...user.count, elapsedMs: elapsed, scrolledAt: user.scrolledAt };
  // Read from the CI log to fill the comparison table.
  console.log(`[105-flow] ${JSON.stringify(result)}`);
  test.info().annotations.push({ type: '105-flow', description: JSON.stringify(result) });
  // #268: the set cards fit between the pinned bars again, so the flow takes no more swipes
  // than before #105 (3), with the same taps and keys.
  // An extra swipe names its control (for example a suggestion list over the weight field).
  expect(user.count).toMatchObject({ taps: 11, keys: 24 });
  expect(user.count.scrolls, `scrolled at ${user.scrolledAt.join(', ')}`).toBeLessThanOrEqual(3);
});
