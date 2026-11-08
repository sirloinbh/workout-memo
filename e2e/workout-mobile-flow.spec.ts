import { expect, type Locator, type Page, test } from '@playwright/test';

// #105 completion check: on a 390px touch screen, "new journal → enter and complete three
// sets → save" works end to end, and the gestures it takes are counted so the result can
// be compared with the UI before #105 (docs/changes/105-mobile-flow.md). The same script
// ran on the pre-#105 commit; it only uses names both versions share.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const exercise = '벤치프레스';
const weight = '60';
let saved: number | undefined;

test.afterAll(async ({ request }) => {
  if (saved !== undefined) await request.delete(`/api/workouts/${saved}`);
});

// A control counts as reachable when its centre is on screen and not under another
// element (a pinned bar, the keyboard-free viewport edge). Otherwise the user first
// swipes once to bring it into view: a lower bound, since a long way may take several.
function counter(page: Page) {
  const count = { taps: 0, keys: 0, scrolls: 0 };
  const reachable = (el: Locator) =>
    el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === node || node.contains(hit));
    });
  return {
    count,
    async tap(el: Locator, options?: Parameters<Locator['tap']>[0]) {
      if (!(await reachable(el))) {
        count.scrolls++;
        await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      }
      count.taps++;
      await el.tap(options);
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

test('390px 터치 화면에서 새 일지에 세트 3개를 입력·완료하고 저장한다', async ({ page }) => {
  // Without today's routine a new journal starts with three blank sets; other specs may
  // leave a routine starting today in the shared test DB.
  let resolveDay: (day: string) => void;
  const editorDay = new Promise<string>((resolve) => (resolveDay = resolve));
  await page.route('**/api/routine-progress', async (route) => {
    const response = await route.fetch();
    const { today } = (await response.json()) as { today: string };
    resolveDay(today);
    await route.fulfill({ response, json: { today, routine: null } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '운동 기록하기' }).first()).toBeEnabled();
  const user = counter(page);
  const started = Date.now();

  await user.tap(page.getByRole('button', { name: '운동 기록하기' }).first());
  const editor = page.getByRole('dialog', { name: '새로운 운동 기록' });
  const sets = editor.locator('[data-slot=set-row]');
  await expect(sets).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const set = sets.nth(i);
    await user.tap(set.getByLabel('운동명'));
    await user.type(exercise);
    // The weight starts at 0. Tapping the field's right end puts the caret after it in both
    // versions (left-aligned before #105, centred after), so one backspace clears it.
    const field = set.getByLabel('총중량 kg', { exact: true });
    const box = (await field.boundingBox())!;
    await user.tap(field, { position: { x: box.width - 6, y: box.height / 2 } });
    await user.press('Backspace');
    await user.type(weight);
    // Before #105 the number field put the 0 back after the backspace and showed "060",
    // still read as 60; the same script runs on both versions, so compare the number.
    await expect.poll(async () => Number(await field.inputValue())).toBe(Number(weight));
    // Reps keep the default 10.
    const done = set.getByRole('button', { name: `${i + 1}세트 완료` });
    await user.tap(done);
    await expect(done).toHaveAttribute('aria-pressed', 'true');
  }
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/workouts',
  );
  await user.tap(editor.getByRole('button', { name: '기록 저장하기' }));
  const created = await response;
  expect(created.status()).toBe(201);
  await expect(editor).toBeHidden();
  const elapsed = Date.now() - started;

  saved = ((await created.json()) as { id: number }).id;
  const day = await editorDay;
  const list = await page.request.get(`/api/workouts?from=${day}&to=${day}`);
  const workout = ((await list.json()) as { id: number; sets: unknown[] }[]).find(
    (w) => w.id === saved,
  )!;
  expect(workout.sets).toEqual(
    Array.from({ length: 3 }, () =>
      expect.objectContaining({ exercise, weight: 60, reps: 10, completed: true }),
    ),
  );

  const result = { ...user.count, elapsedMs: elapsed };
  // Read from the CI log to fill the comparison table.
  console.log(`[105-flow] ${JSON.stringify(result)}`);
  test.info().annotations.push({ type: '105-flow', description: JSON.stringify(result) });
});
