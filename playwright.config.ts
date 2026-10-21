import { defineConfig } from '@playwright/test';

// Browser checks need a dedicated, migrated test database (never the personal DB).
const database = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!database)
  throw new Error(
    'E2E_DATABASE_URL 또는 TEST_DATABASE_URL에 db:migrate로 준비한 테스트 DB를 지정하세요.',
  );
const apiPort = 3101;
const webPort = 5174;
// #113: screenshot comparison runs only in the pinned Playwright container, with its
// bundled Chromium; elsewhere the installed Chrome is used.
const visual = !!process.env.E2E_VISUAL;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // One baseline set made in Linux, so no platform suffix in the file name.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  // CI never writes baselines; a missing or changed one fails (see workout-testing).
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    // The installed Chrome is used outside the container; no browser download is needed.
    channel: visual ? undefined : 'chrome',
    timezoneId: 'Asia/Seoul',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx --no-install tsx backend/src/server.ts',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: { DATABASE_URL: database, PORT: String(apiPort), TZ: 'Asia/Seoul' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w frontend -- --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
