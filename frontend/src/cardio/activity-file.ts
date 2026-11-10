import type { CardioKind } from '../contract';

// #119: activity files exported from a watch or an app (Garmin Connect, Strava, ...), read in
// this browser. Only the summary values of cardio_sessions are kept (#114: no laps, no GPS
// route); the file itself is never uploaded or stored, because its route contains places such
// as home. GPX and TCX are XML and are read with the browser's DOMParser, without a package.
// Research and field mapping: docs/activity-import.md (#118).

// One activity read from a file, in the API's field names. `started_at` (UTC, ISO) is kept
// for the duplicate check; `date` and `start_time` are the same instant in Asia/Seoul.
export type ImportedActivity = {
  file: string;
  format: 'tcx' | 'gpx';
  external_id: string;
  started_at: string;
  kind: CardioKind;
  date: string;
  start_time: string;
  duration_sec: number;
  distance_km: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  calories_kcal: number | null;
  elevation_gain_m: number | null;
  avg_cadence: number | null;
  memo: string;
};

// A file that could not be read at all. Its message names the file and is shown as is.
export class ActivityFileError extends Error {}

const seoulParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
// A UTC instant → the Seoul calendar date and HH:MM the app stores.
export function seoulDateTime(instant: Date) {
  const parts = seoulParts.formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    start_time: `${part('hour')}:${part('minute')}`,
  };
}

// Files name their elements with or without a namespace prefix (`gpxtpx:hr`, `ns3:TPX`), so
// elements are matched by local name only.
const children = (parent: Element, name: string) =>
  Array.from(parent.children).filter((child) => child.localName === name);
const child = (parent: Element, name: string) => children(parent, name)[0];
const descendants = (parent: Element | Document, name: string) =>
  Array.from(parent.getElementsByTagNameNS('*', name));
const textOf = (element: Element | undefined) => element?.textContent?.trim() ?? '';
// A number in the element's text, or null when it is missing or not a finite number.
function numberOf(element: Element | undefined) {
  const text = textOf(element);
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
// Both formats write UTC with a "Z". A time without any zone (seen in some exporters) is read
// as UTC too, never as the browser's local time, so the date does not depend on the device.
function instantOf(text: string) {
  const zoned = /T[d:.]+$/.test(text) ? `${text}Z` : text;
  const time = Date.parse(zoned);
  return Number.isNaN(time) ? null : new Date(time);
}
// The schema's ranges: a value outside them is a device glitch, so it is left empty (the
// preview shows the field as not recorded) instead of blocking the whole row.
const within = (value: number | null, min: number, max: number) =>
  value !== null && value >= min && value <= max ? Math.round(value) : null;
// Metres → km at the stored 1 m precision; no distance is null, never 0 km.
const kmOf = (metres: number) => (metres >= 1 ? Math.round(metres) / 1000 : null);

function parseXml(file: string, text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new ActivityFileError(`${file}: 파일을 읽지 못했습니다. 손상되었거나 XML이 아닙니다.`);
  return doc;
}

function finish(
  file: string,
  format: ImportedActivity['format'],
  start: Date,
  values: Omit<
    ImportedActivity,
    'file' | 'format' | 'external_id' | 'started_at' | 'date' | 'start_time'
  >,
): ImportedActivity {
  // Whole seconds: an exporter writing milliseconds gets the same id as one that does not.
  const startedAt = start.toISOString().slice(0, 19) + 'Z';
  const max = values.max_heart_rate;
  return {
    file,
    format,
    // The start instant in one spelling. The same file imported again gets the same id and is
    // refused. A TCX and a GPX of one activity usually share it too, but a GPX may start a few
    // seconds later (points without a position are left out); then the start ±2 minutes
    // look-alike rule asks about it instead.
    external_id: startedAt,
    started_at: startedAt,
    ...seoulDateTime(start),
    ...values,
    // A maximum under the average breaks the schema's rule; it can only be a glitch.
    max_heart_rate:
      max !== null && values.avg_heart_rate !== null && max < values.avg_heart_rate ? null : max,
  };
}

// TCX `Activity/@Sport` has only three values.
const tcxKinds: Record<string, CardioKind> = {
  running: 'running',
  biking: 'outdoor_cycling',
};

// TCX: the summary is in the laps. Duration is the laps' TotalTimeSeconds (the timer time,
// pauses excluded), distance their DistanceMeters, the average heart rate weighted by lap
// time. TCX has no ascent total; the elevation stays empty.
export function parseTcx(file: string, text: string): ImportedActivity[] {
  const doc = parseXml(file, text);
  if (doc.documentElement.localName !== 'TrainingCenterDatabase')
    throw new ActivityFileError(`${file}: TCX 파일이 아닙니다.`);
  const activities = descendants(doc, 'Activity');
  if (!activities.length) throw new ActivityFileError(`${file}: 활동 기록이 없습니다.`);
  return activities.map((activity, index) => {
    const name = activities.length > 1 ? `${file} (${index + 1})` : file;
    const laps = children(activity, 'Lap');
    if (!laps.length) throw new ActivityFileError(`${name}: 랩(요약 값)이 없습니다.`);
    const start =
      instantOf(laps[0].getAttribute('StartTime') ?? '') ??
      instantOf(textOf(child(activity, 'Id')));
    if (!start) throw new ActivityFileError(`${name}: 시작 시각이 없습니다.`);
    let seconds = 0;
    let metres = 0;
    let calories: number | null = null;
    let heartSeconds = 0;
    let heartSum = 0;
    let maxHeart: number | null = null;
    let cadenceSeconds = 0;
    let cadenceSum = 0;
    for (const lap of laps) {
      const lapSeconds = numberOf(child(lap, 'TotalTimeSeconds')) ?? 0;
      seconds += lapSeconds;
      metres += numberOf(child(lap, 'DistanceMeters')) ?? 0;
      const lapCalories = numberOf(child(lap, 'Calories'));
      if (lapCalories !== null) calories = (calories ?? 0) + lapCalories;
      const average = numberOf(child(child(lap, 'AverageHeartRateBpm') ?? lap, 'Value'));
      if (average !== null && child(lap, 'AverageHeartRateBpm') && lapSeconds > 0) {
        heartSeconds += lapSeconds;
        heartSum += average * lapSeconds;
      }
      const maximum = child(lap, 'MaximumHeartRateBpm')
        ? numberOf(child(child(lap, 'MaximumHeartRateBpm'), 'Value'))
        : null;
      if (maximum !== null) maxHeart = Math.max(maxHeart ?? 0, maximum);
      // Lap/Cadence is the bike's rpm in the schema. Running cadence lives in an extension
      // whose unit (one foot or both) differs between exporters, so it is not read.
      const cadence = numberOf(child(lap, 'Cadence'));
      if (cadence !== null && lapSeconds > 0) {
        cadenceSeconds += lapSeconds;
        cadenceSum += cadence * lapSeconds;
      }
    }
    return finish(name, 'tcx', start, {
      kind: tcxKinds[(activity.getAttribute('Sport') ?? '').toLowerCase()] ?? 'other',
      duration_sec: Math.round(seconds),
      distance_km: kmOf(metres),
      avg_heart_rate: within(heartSeconds ? heartSum / heartSeconds : null, 30, 250),
      max_heart_rate: within(maxHeart, 30, 250),
      calories_kcal: within(calories, 0, 20000),
      elevation_gain_m: null,
      avg_cadence: within(cadenceSeconds ? cadenceSum / cadenceSeconds : null, 1, 300),
      memo: textOf(child(activity, 'Notes')).slice(0, 2000),
    });
  });
}

// GPX `trk/type` is free text: Garmin writes running, cycling, walking, hiking, ... and other
// apps similar words. Anything else is 기타 and can be changed in the preview.
const gpxKinds: [RegExp, CardioKind][] = [
  [/run|jog/, 'running'],
  [/walk|hik/, 'walking'],
  [/indoor.?(cycl|bik)|virtual.?ride|spin/, 'indoor_cycling'],
  [/cycl|bik|ride/, 'outdoor_cycling'],
  [/swim/, 'swimming'],
  [/row/, 'rowing'],
  [/stair/, 'stairs'],
  [/ellip/, 'elliptical'],
];
const gpxKind = (type: string) =>
  gpxKinds.find(([pattern]) => pattern.test(type.toLowerCase()))?.[1] ?? 'other';

// The great-circle distance in metres between two points (haversine, mean Earth radius).
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// GPX has no summary, only track points. Duration is from the first to the last point, so it
// includes pauses (GPX does not record them; the preview says so). Distance adds up the points
// of each segment; a gap between segments (lost signal) is not counted. Heart rate comes from
// Garmin's TrackPointExtension; cadence is not read (its unit differs between exporters).
export function parseGpx(file: string, text: string): ImportedActivity[] {
  const doc = parseXml(file, text);
  if (doc.documentElement.localName !== 'gpx')
    throw new ActivityFileError(`${file}: GPX 파일이 아닙니다.`);
  const tracks = descendants(doc, 'trk');
  if (!tracks.length) throw new ActivityFileError(`${file}: 트랙 기록이 없습니다.`);
  return tracks.map((track, index) => {
    const name = tracks.length > 1 ? `${file} (${index + 1})` : file;
    let first: Date | null = null;
    let last: Date | null = null;
    let metres = 0;
    const hearts: number[] = [];
    for (const segment of children(track, 'trkseg')) {
      let previous: { lat: number; lon: number } | null = null;
      for (const point of children(segment, 'trkpt')) {
        const lat = Number(point.getAttribute('lat'));
        const lon = Number(point.getAttribute('lon'));
        const time = instantOf(textOf(child(point, 'time')));
        if (time) {
          if (!first || time < first) first = time;
          if (!last || time > last) last = time;
        }
        if (Number.isFinite(lat) && Number.isFinite(lon) && point.hasAttribute('lat')) {
          const here = { lat, lon };
          if (previous) metres += metresBetween(previous, here);
          previous = here;
        }
        const heart = numberOf(descendants(point, 'hr')[0]);
        if (heart !== null && heart > 0) hearts.push(heart);
      }
    }
    if (!first || !last) throw new ActivityFileError(`${name}: 기록 시각이 없습니다.`);
    return finish(name, 'gpx', first, {
      kind: gpxKind(textOf(child(track, 'type'))),
      duration_sec: Math.round((last.getTime() - first.getTime()) / 1000),
      distance_km: kmOf(metres),
      avg_heart_rate: within(
        hearts.length ? hearts.reduce((sum, h) => sum + h, 0) / hearts.length : null,
        30,
        250,
      ),
      max_heart_rate: within(
        hearts.length ? hearts.reduce((top, h) => Math.max(top, h), 0) : null,
        30,
        250,
      ),
      calories_kcal: null,
      elevation_gain_m: null,
      avg_cadence: null,
      memo: '',
    });
  });
}

// The extensions this step reads. FIT and ZIP come in the next step (#119 PR ②).
export const activityFileAccept = '.tcx,.gpx';

// One chosen file → its activities. The format is taken from the extension, or from the root
// element when the extension is missing or unknown.
export function parseActivityFile(file: string, text: string): ImportedActivity[] {
  const extension = file.toLowerCase().split('.').pop();
  if (extension === 'tcx') return parseTcx(file, text);
  if (extension === 'gpx') return parseGpx(file, text);
  if (/<TrainingCenterDatabase[\s>]/.test(text)) return parseTcx(file, text);
  if (/<gpx[\s>]/.test(text)) return parseGpx(file, text);
  throw new ActivityFileError(`${file}: TCX·GPX 파일만 가져올 수 있습니다.`);
}
