import { weekStart } from '../cardio/stats';
import { cleanDate, done, vol, type Workout } from './model';

const dayMs = 86400000;
const ms = (date: string) => Date.parse(cleanDate(date) + 'T00:00:00Z');
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

export type CalendarDay = { date: string; inMonth: boolean };

/** Month "YYYY-MM" moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The weeks of a month, Monday first (AGENTS.project.md); days outside the month pad the first and last week. */
export function monthGrid(month: string): CalendarDay[][] {
  const first = `${month}-01`;
  const next = shiftMonth(month, 1) + '-01';
  const lastTime = ms(next) - dayMs;
  const weeks: CalendarDay[][] = [];
  for (let start = ms(weekStart(first)); start <= lastTime; start += 7 * dayMs) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = iso(start + i * dayMs);
        return { date, inMonth: date.startsWith(month) };
      }),
    );
  }
  return weeks;
}

/** Completed volume (kg) per date. A workout with no completed set does not count as a workout day. */
export function dailyVolumes(workouts: readonly Workout[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of workouts) {
    if (!w.sets.some(done)) continue;
    const date = cleanDate(w.date);
    map.set(date, (map.get(date) ?? 0) + vol(w));
  }
  return map;
}

/** Shade level 0 (no workout) to 4 relative to the busiest day shown. */
export function shadeLevel(volume: number | undefined, max: number): 0 | 1 | 2 | 3 | 4 {
  if (volume === undefined) return 0;
  if (max <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil((volume / max) * 4))) as 1 | 2 | 3 | 4;
}

/**
 * #482: a streak is consecutive Monday-based weeks with at least one workout. The current streak
 * stays alive through a week that has no workout yet, so it only breaks once that week has ended.
 */
export function weekStreaks(dates: Iterable<string>, today: string) {
  const weeks = [...new Set([...dates].map((d) => weekStart(d)))].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const w of weeks) {
    run = prev && ms(w) - ms(prev) === 7 * dayMs ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  const have = new Set(weeks);
  const thisWeek = weekStart(today);
  let cursor = ms(thisWeek) - (have.has(thisWeek) ? 0 : 7 * dayMs);
  let current = 0;
  while (have.has(iso(cursor))) {
    current += 1;
    cursor -= 7 * dayMs;
  }
  return { current, best };
}
