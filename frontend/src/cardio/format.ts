import type { CardioKind, Feedback } from '../contract';

// #115: labels and display formats for cardio sessions. The API answers pace in seconds per
// km and speed in km/h (both null without a distance); this file only turns them into text.

export const cardioKindLabels: Record<CardioKind, string> = {
  running: '러닝',
  walking: '걷기',
  outdoor_cycling: '실외 사이클',
  indoor_cycling: '실내 자전거',
  rowing: '로잉',
  stairs: '계단',
  elliptical: '일립티컬',
  swimming: '수영',
  other: '기타',
};

// The #83 workout feedback levels, reused for perceived effort.
export const effortLabels: Record<Feedback, string> = {
  hard: '힘듦',
  medium: '중간',
  easy: '쉬움',
};

type DurationParts = { hours: string; minutes: string; seconds: string };

// Hours, minutes and seconds typed as text (hours may stay empty) → whole seconds.
// Each field is empty or a whole number; minutes and seconds stay under 60 so "90분" is not
// silently read as 1:30:00. A total of 0 is refused here; the 24-hour limit is the schema's.
export function parseDuration(parts: DurationParts): { seconds: number } | { error: string } {
  const values = [parts.hours, parts.minutes, parts.seconds].map((text) => text.trim());
  if (values.every((text) => text === '')) return { error: '운동 시간을 입력하세요' };
  if (values.some((text) => text !== '' && !/^\d+$/.test(text)))
    return { error: '시·분·초는 0 이상의 정수로 입력하세요' };
  const [hours, minutes, seconds] = values.map(Number);
  if (minutes > 59 || seconds > 59) return { error: '분과 초는 0~59로 입력하세요' };
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total === 0) return { error: '운동 시간은 1초 이상이어야 합니다' };
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

// Seconds per km → "5:30/km", rounded to whole seconds (329.6 → 5:30). Null without distance.
export function formatPace(secPerKm: number | null): string | null {
  if (secPerKm === null) return null;
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${two(total % 60)}/km`;
}

const number = (digits: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits });

// km/h with one decimal. Null without distance.
export function formatSpeed(kmh: number | null): string | null {
  return kmh === null ? null : `${number(1).format(kmh)} km/h`;
}

// Distance in km, except swimming in whole metres ("1,500 m"): pools and lap counts are in
// metres. Pace and speed stay per km for every kind (#115 decision 3).
export function formatDistance(kind: CardioKind, km: number | null): string | null {
  if (km === null) return null;
  if (kind === 'swimming') return `${number(0).format(Math.round(km * 1000))} m`;
  return `${number(2).format(km)} km`;
}
