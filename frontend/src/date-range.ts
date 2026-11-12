import { date } from './contract';
import { monthNames } from './date';

// #85: a period chosen directly by start and end date. Both ends are included.
export const maxRangeDays = 371;
const day = (value: string) => Date.parse(value + 'T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const rangeDays = (from: string, to: string) =>
  Math.round((day(to) - day(from)) / 86400000) + 1;

// Per-field messages; an empty object means the range can be requested.
export function checkRange(from: string, to: string) {
  const errors: { from?: string; to?: string } = {};
  if (!from) errors.from = 'Enter a start date';
  else if (!date.safeParse(from).success) errors.from = 'Enter a valid start date';
  if (!to) errors.to = 'Enter an end date';
  else if (!date.safeParse(to).success) errors.to = 'Enter a valid end date';
  if (errors.from || errors.to) return errors;
  if (to < from) errors.to = 'The end date must be the same as or after the start date';
  else if (rangeDays(from, to) > maxRangeDays)
    errors.to = `You can select up to ${maxRangeDays} days`;
  return errors;
}
// A range from the address, or null when it is missing or invalid.
export function parseRange(from: string | null, to: string | null) {
  if (from === null || to === null) return null;
  return Object.keys(checkRange(from, to)).length ? null : { from, to };
}

// Chart groups by length: up to 31 days per day, up to 92 days per week (7-day steps
// from the start), longer per calendar month. `end` is exclusive.
export function rangeBuckets(from: string, to: string) {
  const count = rangeDays(from, to);
  const last = day(to) + 86400000;
  const buckets: { start: string; end: string; label: string }[] = [];
  const md = (ms: number) => `${new Date(ms).getUTCMonth() + 1}/${new Date(ms).getUTCDate()}`;
  if (count <= 92) {
    const step = (count <= 31 ? 1 : 7) * 86400000;
    for (let a = day(from); a < last; a += step)
      buckets.push({ start: iso(a), end: iso(Math.min(a + step, last)), label: md(a) });
    return buckets;
  }
  const years = new Set([from.slice(0, 4), to.slice(0, 4)]).size;
  for (let a = day(from); a < last;) {
    const d = new Date(a);
    const next = Math.min(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), last);
    const month = d.getUTCMonth() + 1;
    buckets.push({
      start: iso(a),
      end: iso(next),
      label: years > 1 ? `${String(d.getUTCFullYear()).slice(2)}.${month}` : monthNames[month - 1],
    });
    a = next;
  }
  return buckets;
}
