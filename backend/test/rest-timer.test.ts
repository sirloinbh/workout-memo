import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelTimer,
  defaultTimer,
  finished,
  formatRemaining,
  parseTimer,
  pauseTimer,
  remainingMs,
  resumeTimer,
  startTimer,
  withDuration,
} from '../../frontend/src/rest-timer.js';

const t0 = Date.parse('2026-10-14T15:30:00Z');

test('remaining rest time comes from the end timestamp, not from elapsed ticks', () => {
  const running = startTimer(withDuration(defaultTimer(), 60), t0);
  assert.equal(remainingMs(running, t0), 60000);
  // A tab that was in the background for 45 s without any timer callbacks.
  assert.equal(remainingMs(running, t0 + 45000), 15000);
  assert.equal(formatRemaining(remainingMs(running, t0 + 45000)), '0:15');
  assert.equal(finished(running, t0 + 59999), false);
  assert.equal(formatRemaining(remainingMs(running, t0 + 59999)), '0:01');
  assert.equal(finished(running, t0 + 60000), true);
  assert.equal(remainingMs(running, t0 + 600000), 0, 'never negative after a long background');
  assert.equal(formatRemaining(remainingMs(running, t0 + 600000)), '0:00');
});

test('pause keeps the remaining time, resume sets a new end and cancel resets', () => {
  const running = startTimer(defaultTimer(), t0);
  const paused = pauseTimer(running, t0 + 10000);
  assert.equal(paused.state, 'paused');
  assert.equal(remainingMs(paused, t0 + 500000), 80000, 'paused time does not run');
  const resumed = resumeTimer(paused, t0 + 70000);
  assert.equal(resumed.endsAt, t0 + 150000);
  assert.equal(remainingMs(resumed, t0 + 90000), 60000);
  assert.deepEqual(resumeTimer(resumed, t0 + 95000), resumed, 'resume is idempotent');
  assert.deepEqual(pauseTimer(defaultTimer(), t0), defaultTimer(), 'idle cannot pause');
  const cancelled = cancelTimer(resumed);
  assert.equal(cancelled.state, 'idle');
  assert.equal(cancelled.endsAt, null);
  assert.equal(remainingMs(cancelled, t0 + 99999999), 90000);
  const ended = startTimer(defaultTimer(), t0);
  assert.equal(pauseTimer(ended, t0 + 90000).state, 'running', 'finished rest is not paused');
});

test('duration accepts whole seconds from 5 to 3600 only', () => {
  const t = defaultTimer();
  for (const invalid of [4, 3601, 0, -10, 1.5, Number.NaN])
    assert.equal(withDuration(t, invalid).duration, 90, String(invalid));
  assert.equal(withDuration(t, 5).duration, 5);
  assert.equal(withDuration(t, 3600).duration, 3600);
  assert.equal(formatRemaining(3600000), '60:00');
  const running = startTimer(t, t0);
  const changed = withDuration(running, 30);
  assert.equal(changed.endsAt, running.endsAt, 'changing length keeps the current countdown');
  assert.equal(remainingMs(startTimer(changed, t0), t0), 30000, 'next rest uses the new length');
});

test('stored timer state is validated and corrupt data falls back to defaults', () => {
  const running = startTimer(defaultTimer(), t0);
  assert.deepEqual(parseTimer(JSON.stringify(running), t0 + 1000), running);
  for (const raw of [
    null,
    '',
    '{broken',
    JSON.stringify({ ...running, format: 2 }),
    JSON.stringify({ ...running, duration: 0 }),
    JSON.stringify({ ...running, autoStart: 'yes' }),
    JSON.stringify({ ...running, state: 'done' }),
    JSON.stringify({ ...running, endsAt: null }),
    // A clock moved backwards cannot create a rest longer than the maximum.
    JSON.stringify({ ...running, endsAt: t0 + 3600001 }),
    JSON.stringify({ ...running, remaining: -1 }),
  ])
    assert.deepEqual(parseTimer(raw, t0), defaultTimer(), String(raw));
  const paused = pauseTimer(running, t0 + 1000);
  assert.deepEqual(parseTimer(JSON.stringify(paused), t0 + 999999), paused);
});
