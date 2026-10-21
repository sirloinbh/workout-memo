// Rest timer state lives only in this browser. The remaining time is always derived
// from the stored end timestamp, so background tabs and reloads show the real value
// instead of a count of interval ticks that browsers may throttle.
export type RestTimer = {
  format: 1;
  duration: number; // seconds
  autoStart: boolean;
  state: 'idle' | 'running' | 'paused';
  endsAt: number | null; // epoch ms while running
  remaining: number; // ms kept while paused
};
export const restTimerKey = 'workout-memo:rest-timer:v1';
export const minRest = 5;
export const maxRest = 3600;
export const defaultTimer = (): RestTimer => ({
  format: 1,
  duration: 90,
  autoStart: false,
  state: 'idle',
  endsAt: null,
  remaining: 90000,
});
export const validDuration = (seconds: number) =>
  Number.isInteger(seconds) && seconds >= minRest && seconds <= maxRest;
export function remainingMs(t: RestTimer, now: number) {
  if (t.state === 'running') return Math.max(0, (t.endsAt ?? now) - now);
  if (t.state === 'paused') return t.remaining;
  return t.duration * 1000;
}
export const finished = (t: RestTimer, now: number) =>
  t.state === 'running' && remainingMs(t, now) === 0;
// `seconds` overrides the configured duration for one rest (#84: per exercise kind).
export const startTimer = (t: RestTimer, now: number, seconds = t.duration): RestTimer => ({
  ...t,
  state: 'running',
  endsAt: now + seconds * 1000,
  remaining: seconds * 1000,
});
export function pauseTimer(t: RestTimer, now: number): RestTimer {
  if (t.state !== 'running' || finished(t, now)) return t;
  return { ...t, state: 'paused', endsAt: null, remaining: remainingMs(t, now) };
}
export function resumeTimer(t: RestTimer, now: number): RestTimer {
  if (t.state !== 'paused') return t;
  return { ...t, state: 'running', endsAt: now + t.remaining };
}
export const cancelTimer = (t: RestTimer): RestTimer => ({
  ...t,
  state: 'idle',
  endsAt: null,
  remaining: t.duration * 1000,
});
export function withDuration(t: RestTimer, seconds: number): RestTimer {
  if (!validDuration(seconds)) return t;
  // A running or paused countdown keeps its end; the new length applies to the next rest.
  return t.state === 'idle'
    ? { ...t, duration: seconds, remaining: seconds * 1000 }
    : { ...t, duration: seconds };
}
// Whole seconds are rounded up so 0:00 appears only when the rest has really ended.
export function formatRemaining(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function parseTimer(raw: string | null, now: number): RestTimer {
  if (!raw) return defaultTimer();
  try {
    const t = JSON.parse(raw) as RestTimer;
    const limit = maxRest * 1000;
    if (
      t.format !== 1 ||
      !validDuration(t.duration) ||
      typeof t.autoStart !== 'boolean' ||
      !['idle', 'running', 'paused'].includes(t.state) ||
      !Number.isFinite(t.remaining) ||
      t.remaining < 0 ||
      t.remaining > limit ||
      (t.state === 'running' &&
        (typeof t.endsAt !== 'number' || !Number.isFinite(t.endsAt) || t.endsAt - now > limit))
    )
      throw Error('invalid timer');
    return t.state === 'running' ? t : { ...t, endsAt: null };
  } catch {
    return defaultTimer();
  }
}

// #84: default rest per exercise kind, kept only in this browser like the timer.
export type RestKind = 'lower' | 'upper' | 'single';
export type RestDurations = Record<RestKind, number>;
export const restDurationsKey = 'workout-memo:rest-durations:v1';
export const restKinds = ['lower', 'upper', 'single'] as const;
export const defaultRestDurations = (): RestDurations => ({ lower: 150, upper: 120, single: 90 });
export function parseRestDurations(raw: string | null): RestDurations {
  const defaults = defaultRestDurations();
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw) as Partial<RestDurations>;
    // Each kind falls back on its own, so one corrupt value does not reset the others.
    return Object.fromEntries(
      restKinds.map((k) => [
        k,
        typeof value?.[k] === 'number' && validDuration(value[k]) ? value[k] : defaults[k],
      ]),
    ) as RestDurations;
  } catch {
    return defaults;
  }
}
const lowerParts = ['하체-앞', '하체-뒤'];
// 이두·삼두 (#88) and the legacy 팔 are upper body.
const upperParts = ['가슴', '등', '어깨', '팔', '이두', '삼두'];
// A single-joint machine wins, then lower body, then upper body. Kinds come only from
// what the user set (machine flag, #32 body parts); exercise names are never guessed.
// Abs-only or unmapped exercises have no kind and keep the configured rest.
export function restKind(singleJoint: boolean, parts: readonly string[]): RestKind | null {
  if (singleJoint) return 'single';
  if (parts.some((p) => lowerParts.includes(p))) return 'lower';
  if (parts.some((p) => upperParts.includes(p))) return 'upper';
  return null;
}
