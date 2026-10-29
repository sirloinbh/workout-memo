import { z } from 'zod';

import { allBodyParts, legacyBodyParts } from './domain.js';

// Exercise analysis (#32). Everything is computed on read from saved sets, so
// edits and deletes are reflected on the next request without stored PRs.
export const unclassified = '미분류';
// Epley estimate, applied only within this inclusive rep range.
export const estimateMaxReps = 10;
export const bodyPartMappingSchema = z
  .object({
    exercise: z.string().trim().min(1).max(120),
    body_parts: z.array(z.enum(allBodyParts)).max(allBodyParts.length),
  })
  .refine((v) => new Set(v.body_parts).size === v.body_parts.length, '부위를 중복 없이 선택하세요');

export type AnalysisSet = {
  id: number;
  date: string;
  exercise: string;
  // Normalized identity computed by PostgreSQL with the goal judgment expression.
  exercise_key: string;
  weight: number | string;
  reps: number;
  // A machine is selected but its base weight is not confirmed (NULL).
  unknown_base: boolean;
};
export type PersonalRecord = {
  value: number;
  weight: number;
  reps: number;
  date: string;
  ties: number;
};
type TrendPoint = {
  date: string;
  max_weight: number | null;
  max_reps: number;
  max_set_volume: number | null;
  estimated_1rm: number | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Epley: weight × (1 + reps / 30), 1 rep = the lifted weight itself. kg, total load. */
export function estimatedOneRepMax(weight: number, reps: number, unknownBase: boolean) {
  // Bodyweight (0 kg), unconfirmed machine base weight and high-rep sets are excluded.
  if (!(weight > 0) || unknownBase || reps < 1 || reps > estimateMaxReps) return null;
  return round(reps === 1 ? weight : weight * (1 + reps / 30));
}

// The earliest set reaching the best value is the PR date; equal values are ties.
function best<T extends { date: string; weight: number; reps: number }>(
  sets: T[],
  metric: (s: T) => number | null,
): PersonalRecord | null {
  let result: PersonalRecord | null = null;
  for (const s of sets) {
    const value = metric(s);
    if (value === null) continue;
    if (!result || value > result.value)
      result = { value, weight: s.weight, reps: s.reps, date: s.date, ties: 1 };
    else if (value === result.value) result.ties++;
  }
  return result;
}

export const mondayOf = (date: string) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * rows: saved sets dated on or before the Seoul service date, in chronological order.
 * PRs use every given row; trends and weekly body-part totals only use from..to.
 */
export function analyze(
  rows: AnalysisSet[],
  mappings: { exercise: string; body_part: string }[],
  from: string,
  to: string,
) {
  const parts = new Map<string, string[]>();
  for (const m of mappings) parts.set(m.exercise, [...(parts.get(m.exercise) ?? []), m.body_part]);
  for (const list of parts.values())
    list.sort((a, b) => allBodyParts.indexOf(a as never) - allBodyParts.indexOf(b as never));
  // #88: 팔 is listed only while some exercise is still mapped to it.
  const used = new Set(mappings.map((m) => m.body_part));
  const shownParts = allBodyParts.filter(
    (p) => !(legacyBodyParts as readonly string[]).includes(p) || used.has(p),
  );
  const sets = rows
    .map((r) => ({ ...r, date: r.date.slice(0, 10), weight: Number(r.weight) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const groups = new Map<string, typeof sets>();
  for (const s of sets) groups.set(s.exercise_key, [...(groups.get(s.exercise_key) ?? []), s]);
  const weighted = (s: { weight: number }) => s.weight > 0;
  const exercises = [...groups.entries()].map(([key, list]) => {
    const latest = list[list.length - 1];
    const trend = new Map<string, TrendPoint>();
    for (const s of list) {
      if (s.date < from || s.date > to) continue;
      const point = trend.get(s.date) ?? {
        date: s.date,
        max_weight: null,
        max_reps: 0,
        max_set_volume: null,
        estimated_1rm: null,
      };
      const max = (a: number | null, b: number | null) =>
        b === null ? a : a === null ? b : Math.max(a, b);
      if (weighted(s)) {
        point.max_weight = max(point.max_weight, s.weight);
        point.max_set_volume = max(point.max_set_volume, round(s.weight * s.reps));
      }
      point.max_reps = Math.max(point.max_reps, s.reps);
      point.estimated_1rm = max(
        point.estimated_1rm,
        estimatedOneRepMax(s.weight, s.reps, s.unknown_base),
      );
      trend.set(s.date, point);
    }
    return {
      key,
      // The latest spelling is shown; identity ignores case and outer spaces.
      exercise: latest.exercise,
      body_parts: parts.get(key) ?? [],
      set_count: list.length,
      last_date: latest.date,
      unknown_base_sets: list.filter((s) => s.unknown_base).length,
      bodyweight_sets: list.filter((s) => !weighted(s)).length,
      prs: {
        max_weight: best(list, (s) => (weighted(s) ? s.weight : null)),
        max_reps: best(list, (s) => s.reps),
        max_set_volume: best(list, (s) => (weighted(s) ? round(s.weight * s.reps) : null)),
        actual_1rm: best(
          list.filter((s) => !s.unknown_base),
          (s) => (weighted(s) && s.reps === 1 ? s.weight : null),
        ),
        estimated_1rm: best(
          list.filter((s) => !s.unknown_base),
          (s) => estimatedOneRepMax(s.weight, s.reps, s.unknown_base),
        ),
      },
      trend: [...trend.values()],
    };
  });
  exercises.sort(
    (a, b) => b.last_date.localeCompare(a.last_date) || a.exercise.localeCompare(b.exercise),
  );
  const weeks: {
    week_start: string;
    week_end: string;
    sets: number;
    volume: number;
    parts: { body_part: string; sets: number; volume: number }[];
  }[] = [];
  for (let start = mondayOf(from); start <= to; start = addDays(start, 7))
    weeks.push({
      week_start: start,
      week_end: addDays(start, 6),
      sets: 0,
      volume: 0,
      parts: [...shownParts, unclassified].map((body_part) => ({ body_part, sets: 0, volume: 0 })),
    });
  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    const week = weeks.find((w) => w.week_start === mondayOf(s.date))!;
    const volume = s.weight * s.reps;
    week.sets++;
    week.volume = round(week.volume + volume);
    // A set mapped to several parts counts fully toward each part.
    for (const name of parts.get(s.exercise_key) ?? [unclassified]) {
      const part = week.parts.find((p) => p.body_part === name)!;
      part.sets++;
      part.volume = round(part.volume + volume);
    }
  }
  return { from, to, exercises, weeks };
}
