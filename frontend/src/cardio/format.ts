import type { CardioKind, Feedback } from '../contract';

// #115: labels and display formats for cardio sessions. Pace and speed are computed here from
// the stored duration and distance, so the shown value is rounded once (the API's rounded
// pace_sec_per_km and speed_kmh are only a fallback); both stay null without a distance.

export const cardioKindLabels: Record<CardioKind, string> = {
  running: 'Running',
  walking: 'Walking',
  outdoor_cycling: 'Outdoor cycling',
  indoor_cycling: 'Indoor cycling',
  rowing: 'Rowing',
  stairs: 'Stairs',
  elliptical: 'Elliptical',
  swimming: 'Swimming',
  other: 'Other',
};

// The #83 workout feedback levels, reused for perceived effort.
export const effortLabels: Record<Feedback, string> = {
  hard: 'Hard',
  medium: 'Medium',
  easy: 'Easy',
};

// A plain decimal: digits with at most one decimal point, optionally negative so the schema's
// range message answers "-1". A comma is never accepted: "1,000" uses it as a thousands
// separator, and reading it as a decimal comma would save 1 m for a 1,000 m swim (#115 review).
// Number() alone would also read "0x10", "1e3" or "Infinity" and send a value nobody typed.
const plainNumber = /^-?(\d+(\.\d*)?|\.\d+)$/;
// Empty stays null (not recorded, never 0); anything that is not a plain decimal becomes NaN
// so the schema reports "Enter ... as a number" on that field.
export const optionalNumber = (value: string) => {
  const text = value.trim();
  if (text === '') return null;
  return plainNumber.test(text) ? Number(text) : Number.NaN;
};

type DurationParts = { hours: string; minutes: string; seconds: string };

// Hours, minutes and seconds typed as text (hours may stay empty) → whole seconds.
// Each field is empty or a whole number; minutes and seconds stay under 60 so "90 min" is not
// silently read as 1:30:00. A total of 0 is refused here; the 24-hour limit is the schema's.
export function parseDuration(parts: DurationParts): { seconds: number } | { error: string } {
  const values = [parts.hours, parts.minutes, parts.seconds].map((text) => text.trim());
  if (values.every((text) => text === '')) return { error: 'Enter a workout time' };
  if (values.some((text) => text !== '' && !/^\d+$/.test(text)))
    return { error: 'Enter hours, minutes, and seconds as whole numbers 0 or more' };
  const [hours, minutes, seconds] = values.map(Number);
  if (minutes > 59 || seconds > 59) return { error: 'Enter minutes and seconds from 0 to 59' };
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total === 0) return { error: 'The workout time must be at least 1 second' };
  return { seconds: total };
}

// Whole seconds → the three fields. Hours stay empty under an hour.
export function splitDuration(total: number): DurationParts {
  const hours = Math.floor(total / 3600);
  return {
    hours: hours ? String(hours) : '',
    minutes: String(Math.floor((total % 3600) / 60)),
    seconds: String(total % 60),
  };
}

const two = (n: number) => String(n).padStart(2, '0');

// 1:02:03 with hours, 32:05 without.
export function formatDuration(total: number): string {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

// Seconds per km from the stored values; the API value only when there is no distance to use.
export function paceOf(durationSec: number, km: number | null, fallback: number | null = null) {
  return km ? durationSec / km : fallback;
}

// km/h from the stored values, with the same fallback.
export function speedOf(durationSec: number, km: number | null, fallback: number | null = null) {
  return km && durationSec ? km / (durationSec / 3600) : fallback;
}

// Seconds per km → "5:30/km", rounded to whole seconds (329.6 → 5:30). Null without distance.
export function formatPace(secPerKm: number | null): string | null {
  if (secPerKm === null) return null;
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${two(total % 60)}/km`;
}

const number = (digits: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits });

// km/h with one decimal. Null without distance.
export function formatSpeed(kmh: number | null): string | null {
  return kmh === null ? null : `${number(1).format(kmh)} km/h`;
}

// Distance in km with up to three decimals (42.195 km, 1 m precision like the schema), except
// swimming in whole metres ("1,500 m"): pools and lap counts are in metres. Pace and speed
// stay per km for every kind (#115 decision 3).
export function formatDistance(kind: CardioKind, km: number | null): string | null {
  if (km === null) return null;
  if (kind === 'swimming') return `${number(0).format(Math.round(km * 1000))} m`;
  return `${number(3).format(km)} km`;
}

// km ↔ m without float noise (5.02 × 1000 → 5020, not 5019.999…).
const clean = (n: number) => Number(n.toPrecision(12));
export const kmToMetres = (km: number) => clean(km * 1000);
export const metresToKm = (m: number) => clean(m / 1000);

// Names a session for its buttons and the delete confirmation. Date and kind alone can repeat
// within a day, so the start time is added when known, otherwise the duration:
// "2026-11-07 07:30 Running" or "2026-11-07 Running 30:30".
export function sessionLabel(s: {
  date: string;
  kind: CardioKind;
  start_time: string | null;
  duration_sec: number;
}): string {
  const date = s.date.slice(0, 10);
  const kind = cardioKindLabels[s.kind];
  return s.start_time
    ? `${date} ${s.start_time} ${kind}`
    : `${date} ${kind} ${formatDuration(s.duration_sec)}`;
}
