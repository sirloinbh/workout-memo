import { act, configure, getConfig, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Fakes Date and the app's timeouts from the first line of a test, so every redraw tick is fired
// by the test itself (#461). Two things break when setTimeout is faked, and both are handled here:
// - Testing Library's asyncWrapper drains the microtask queue with a setTimeout(0), so every
//   waitFor, findBy and user-event call would hang; a pass-through wrapper replaces it.
// - TanStack Query hands results to React in a setTimeout(0), so waitForFake fires the timeouts
//   that are due now (without moving the clock) before each check.
export function fakeClock(now: number) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now });
}

export const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

// Call once at the top of a test file that uses fakeClock.
export function installFakeTimerHarness() {
  let original: ReturnType<typeof getConfig>['asyncWrapper'];
  beforeEach(() => {
    original = getConfig().asyncWrapper;
    configure({ asyncWrapper: (callback) => callback() });
  });
  afterEach(() => configure({ asyncWrapper: original }));
}

// waitFor that settles the faked timeouts before every check.
export const waitForFake: typeof waitFor = (callback, options) =>
  waitFor(async () => {
    await settle();
    return callback();
  }, options);
