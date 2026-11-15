import { type CardioKind, cardioKinds } from '../contract';
import { paceOf } from './format';

// #115: period statistics computed from the sessions the panel already loaded (from..to), so no
// extra request is needed. Buckets are calendar weeks starting on Monday (AGENTS.project.md,
// #140) or calendar months. A bucket that starts before `from` or ends after `to` still counts
// only the sessions of the period, like the cardio goals (#116).

type StatSession = {
  id: number;
  date: string;
  start_time: string | null;
  kind: CardioKind;
  duration_sec: number;
  distance_km: number | null;
};
export type StatUnit = 'week' | 'month';
import { monthNames } from '../date';
export type Totals = { distance_km: number; duration_sec: number; count: number };
// `end` is exclusive.
export type Bucket = { start: string; end: string; label: string } & Totals;

const dayMs = 86400000;
const ms = (date: string) => Date.parse(date.slice(0, 10) + 'T00:00:00Z');
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

// The Monday of the date's week (Sunday belongs to the week that started six days earlier).
export function weekStart(date: string): string {
  const time = ms(date);
  return iso(time - ((new Date(time).getUTCDay() + 6) % 7) * dayMs);
}

const empty = (): Totals => ({ distance_km: 0, duration_sec: 0, count: 0 });
function add(totals: Totals, s: StatSession) {
  totals.count += 1;
  totals.duration_sec += s.duration_sec;
  // A session without distance adds time and count only; its distance is never guessed.
  if (s.distance_km !== null) totals.distance_km += s.distance_km;
}
// Sums of km keep float noise away (5.02 + 3.1 → 8.12, not 8.120000000000001).
const tidy = (t: Totals): Totals => ({ ...t, distance_km: Number(t.distance_km.toFixed(3)) });

export function totalsOf(sessions: readonly StatSession[]): Totals {
  const totals = empty();
  for (const s of sessions) add(totals, s);
  return tidy(totals);
}

// Every week or month touching from..to, empty ones included so the chart keeps its time axis.
// Labels: the week's Monday "11/2", the month "Nov" ("25.12" when the period spans years).
export function bucketsOf(
  sessions: readonly StatSession[],
  from: string,
  to: string,
  unit: StatUnit,
): Bucket[] {
  const last = ms(to);
  const years = new Set([from.slice(0, 4), to.slice(0, 4)]).size;
  const buckets: Bucket[] = [];
  if (unit === 'week') {
    for (let a = ms(weekStart(from)); a <= last; a += 7 * dayMs) {
      const d = new Date(a);
      buckets.push({
        start: iso(a),
        end: iso(a + 7 * dayMs),
        label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
        ...empty(),
      });
    }
  } else {
    const first = new Date(ms(from));
    const y = first.getUTCFullYear();
    // Date.UTC carries month 12 into January of the next year.
    for (let m = first.getUTCMonth(); Date.UTC(y, m, 1) <= last; m++) {
      const a = new Date(Date.UTC(y, m, 1));
      const month = a.getUTCMonth() + 1;
      buckets.push({
        start: iso(a.getTime()),
        end: iso(Date.UTC(y, m + 1, 1)),
        label:
          years > 1 ? `${String(a.getUTCFullYear()).slice(2)}.${month}` : monthNames[month - 1],
        ...empty(),
      });
    }
  }
  for (const s of sessions) {
    const date = s.date.slice(0, 10);
    if (date < from || date > to) continue;
    const bucket = buckets.find((b) => date >= b.start && date < b.end);
    if (bucket) add(bucket, s);
  }
  return buckets.map((b) => ({ ...b, ...tidy(b) }));
}

// The kinds that have sessions, in the order of the kind list (running first).
export function kindsOf(sessions: readonly StatSession[]): CardioKind[] {
  const present = new Set(sessions.map((s) => s.kind));
  return cardioKinds.filter((kind) => present.has(kind));
}

export type PacePoint = { id: number; date: string; pace: number };
// Running pace per session in date order (start time, then id, within a day). Sessions without
// a distance have no pace and are left out rather than drawn as 0.
export function runningPaces(sessions: readonly StatSession[]): PacePoint[] {
  return sessions
    .filter((s) => s.kind === 'running' && s.distance_km !== null)
    .map((s) => ({ ...s, date: s.date.slice(0, 10) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
        a.id - b.id,
    )
    .map((s) => ({ id: s.id, date: s.date, pace: paceOf(s.duration_sec, s.distance_km)! }));
}
