import type { CardioBody } from './api';

// #119: when an activity that is about to be imported may already be recorded. Shared by every
// import path (files now, the Garmin and Nike sync later; docs/activity-import.md 7-1).
type Comparable = Pick<
  CardioBody,
  'date' | 'start_time' | 'duration_sec' | 'distance_km' | 'source' | 'external_id'
>;

// The same activity from the same source: the server refuses it (unique source + external id).
export const isSameActivity = (a: Comparable, b: Comparable) =>
  a.external_id !== null && a.source === b.source && a.external_id === b.external_id;

// Minutes since the epoch of a Seoul date and HH:MM; only differences matter, so the zone
// offset is left out. Across midnight 23:59 and 00:01 are two minutes apart.
const minuteOf = (date: string, time: string) =>
  Date.parse(`${date}T00:00:00Z`) / 60000 +
  Number(time.slice(0, 2)) * 60 +
  Number(time.slice(3, 5));
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.01;

// The same activity recorded another way (typed by hand, or from another source): the start is
// within 2 minutes (the same date when either start is missing) and the distance within 1%, or
// the duration within 1% when either distance is missing (2026-11-08 user decision). It is only
// a candidate: the preview leaves it unchecked and the user may still save it.
export function isSimilarActivity(a: Comparable, b: Comparable) {
  const sameTime =
    a.start_time && b.start_time
      ? Math.abs(minuteOf(a.date, a.start_time) - minuteOf(b.date, b.start_time)) <= 2
      : a.date === b.date;
  if (!sameTime) return false;
  return a.distance_km !== null && b.distance_km !== null
    ? close(a.distance_km, b.distance_km)
    : close(a.duration_sec, b.duration_sec);
}
