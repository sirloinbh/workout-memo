import { date } from './contract';

// #85: a period chosen directly by start and end date. Both ends are included.
export const maxRangeDays = 371;
const day = (value: string) => Date.parse(value + 'T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const rangeDays = (from: string, to: string) =>
  Math.round((day(to) - day(from)) / 86400000) + 1;

// Per-field messages; an empty object means the range can be requested.
export function checkRange(from: string, to: string) {
  const errors: { from?: string; to?: string } = {};
  if (!from) errors.from = '시작일을 입력하세요';
  else if (!date.safeParse(from).success) errors.from = '올바른 시작일을 입력하세요';
  if (!to) errors.to = '종료일을 입력하세요';
  else if (!date.safeParse(to).success) errors.to = '올바른 종료일을 입력하세요';
  if (errors.from || errors.to) return errors;
  if (to < from) errors.to = '종료일은 시작일과 같거나 이후여야 합니다';
  else if (rangeDays(from, to) > maxRangeDays)
    errors.to = `기간은 최대 ${maxRangeDays}일까지 선택할 수 있습니다`;
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
      label: years > 1 ? `${String(d.getUTCFullYear()).slice(2)}.${month}` : `${month}월`,
    });
    a = next;
  }
  return buckets;
}
