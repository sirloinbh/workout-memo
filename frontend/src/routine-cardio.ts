import { cardioKindLabels } from './cardio/format';
import type { CardioKind, RoutineCardio, RoutineCardioIntensity } from './contract';

// #117: a routine split's cardio item. In Routine Builder the numbers may still be empty ('').
export type CardioItem = {
  kind: CardioKind;
  intensity: RoutineCardioIntensity;
  minutes?: number | '';
  distance_km?: number | '';
  interval?: { repeats: number | ''; work_sec: number | ''; recovery_sec: number | '' };
};

export const intensityLabels: Record<RoutineCardioIntensity, string> = {
  zone2: 'Zone 2',
  tempo: 'Tempo',
  interval: 'Interval',
  recovery: 'Recovery',
};
const seconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const cardioUnit = (c: CardioItem) => (c.minutes !== undefined ? 'min' : 'km');
/** "Running · Zone 2 · 30 min" or "Rowing · Interval · 8 × 1:00 work / 1:30 recovery". */
export function cardioLabel(c: CardioItem) {
  const head = `${cardioKindLabels[c.kind]} · ${intensityLabels[c.intensity]}`;
  if (c.interval)
    return `${head} · ${c.interval.repeats} × ${seconds(Number(c.interval.work_sec))} work / ${seconds(Number(c.interval.recovery_sec))} recovery`;
  return `${head} · ${c.minutes ?? c.distance_km} ${cardioUnit(c)}`;
}

// #117 part 3: the item with its result from saved cardio records.
export const cardioResultText = (c: CardioItem & { result?: 'achieved' | 'missed' | null }) =>
  cardioLabel(c) + (c.result === 'achieved' ? ' · Done' : c.result === 'missed' ? ' · Missed' : '');
/** "Cardio: 7 of 10 planned items done (70%)". */
export function cardioSummaryText({ done, planned }: { done: number; planned: number }) {
  if (!planned) return 'Cardio: no planned items yet';
  return `Cardio: ${done} of ${planned} planned ${planned === 1 ? 'item' : 'items'} done (${Math.round((done / planned) * 100)}%)`;
}

// What a new cardio record starts with when it is logged from today's routine card.
export type CardioPreset = {
  kind: CardioKind;
  duration_sec?: number;
  distance_km?: number;
  memo: string;
};
// A steady item fills in the week's time or distance. An interval item fills in only its type
// and structure (in the memo), since the session's total time includes the warm-up and
// cool-down.
export function cardioPreset(item: RoutineCardio, week: number): CardioPreset {
  return {
    kind: item.kind,
    ...(item.minutes !== undefined && { duration_sec: item.minutes * 60 }),
    ...(item.distance_km !== undefined && { distance_km: item.distance_km }),
    memo: `Routine week ${week} · ${cardioLabel(item)}`,
  };
}
