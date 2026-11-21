import type { CardioKind } from '../../../shared/contract';
import { deps } from './activity-deps';

// #119: activity files exported from a watch or an app (Garmin Connect, Strava, ...), read in
// this browser. Only the summary values of cardio_sessions are kept (#114: no laps, no GPS
// route); the file itself is never uploaded or stored, because its route contains places such
// as home. GPX and TCX are XML and are read with the browser's DOMParser, without a package.
// FIT is read with Garmin's SDK and ZIP with fflate, each loaded only when such a file is
// chosen (#119 PR 2). Research and field mapping: docs/activity-import.md (#118).

// One activity read from a file, in the API's field names. `started_at` (UTC, ISO) is kept
// for the duplicate check; `date` and `start_time` are the same instant in Asia/Seoul.
export type ImportedActivity = {
  file: string;
  format: 'tcx' | 'gpx' | 'fit';
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
// A FIT file that is not an activity (settings, daily health data, ...). A whole-account export
// holds many; inside a ZIP they are counted into one line instead of one error each.
class NotActivityError extends ActivityFileError {}

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
  const zoned = /T[\d:.]+$/.test(text) ? `${text}Z` : text;
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
    throw new ActivityFileError(`${file}: Could not read the file. It is damaged or not XML.`);
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
    throw new ActivityFileError(`${file}: Not a TCX file.`);
  const activities = descendants(doc, 'Activity');
  if (!activities.length) throw new ActivityFileError(`${file}: No activities found.`);
  return activities.map((activity, index) => {
    const name = activities.length > 1 ? `${file} (${index + 1})` : file;
    const laps = children(activity, 'Lap');
    if (!laps.length) throw new ActivityFileError(`${name}: No laps (summary values) found.`);
    const start =
      instantOf(laps[0].getAttribute('StartTime') ?? '') ??
      instantOf(textOf(child(activity, 'Id')));
    if (!start) throw new ActivityFileError(`${name}: No start time found.`);
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
// apps similar words. Anything else is Other and can be changed in the preview.
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
    throw new ActivityFileError(`${file}: Not a GPX file.`);
  const tracks = descendants(doc, 'trk');
  if (!tracks.length) throw new ActivityFileError(`${file}: No track records found.`);
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
    if (!first || !last) throw new ActivityFileError(`${name}: No record timestamps found.`);
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

// FIT `sport` and `sub_sport` as the SDK names them. Treadmill and indoor running stay Running,
// and indoor walking stays Walking: the app has no kind of their own for them.
const fitEquipment: Record<string, CardioKind> = {
  treadmill: 'running',
  indoorRunning: 'running',
  indoorWalking: 'walking',
  indoorCycling: 'indoor_cycling',
  indoorRowing: 'rowing',
  elliptical: 'elliptical',
  stairClimbing: 'stairs',
};
function fitKind(sport: unknown, subSport: unknown): CardioKind {
  const sub = String(subSport ?? '');
  switch (String(sport ?? '')) {
    case 'running':
      return 'running';
    case 'walking':
    case 'hiking':
      return 'walking';
    case 'cycling':
    case 'eBiking':
      return ['indoorCycling', 'spin', 'virtualActivity'].includes(sub)
        ? 'indoor_cycling'
        : 'outdoor_cycling';
    case 'swimming':
      return 'swimming';
    case 'rowing':
      return 'rowing';
    case 'fitnessEquipment':
      return fitEquipment[sub] ?? 'other';
    default:
      return 'other';
  }
}

const damaged = (file: string) =>
  new ActivityFileError(`${file}: Could not read the file. It is damaged.`);

// FIT: each session message is one activity (a multisport file has several; their transitions
// are left out). Duration is `total_timer_time`, pauses excluded (2026-11-08 decision), the same
// as TCX. FIT has a reliable ascent total, so unlike TCX and GPX the elevation gain is kept.
// Cadence is kept only for cycling: running cadence is stored per foot.
export async function parseFit(file: string, bytes: Uint8Array): Promise<ImportedActivity[]> {
  const { Decoder, Stream } = await deps.fit();
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream)) throw new ActivityFileError(`${file}: Not a FIT file.`);
  const decoder = new Decoder(stream);
  // The CRC check catches a cut-off download as well as a damaged file.
  if (!decoder.checkIntegrity()) throw damaged(file);
  // read() reports decoding problems in `errors` instead of throwing. Sessions read before a
  // problem (e.g. in a damaged second file chained after the first) are still used.
  const { messages, errors } = decoder.read();
  const sessions = (messages.sessionMesgs ?? []).filter((s) => s.sport !== 'transition');
  if (!sessions.length)
    throw errors.length
      ? damaged(file)
      : new NotActivityError(
          `${file}: No activity summary found. Only activity FIT files can be imported.`,
        );
  return sessions.map((session, index) => {
    const name = sessions.length > 1 ? `${file} (${index + 1})` : file;
    if (!(session.startTime instanceof Date))
      throw new ActivityFileError(`${name}: No start time found.`);
    const kind = fitKind(session.sport, session.subSport);
    // A device that leaves the timer at 0 still has the elapsed time.
    const seconds = session.totalTimerTime || session.totalElapsedTime;
    return finish(name, 'fit', session.startTime, {
      kind,
      duration_sec: typeof seconds === 'number' ? Math.round(seconds) : 0,
      distance_km: kmOf(session.totalDistance ?? 0),
      avg_heart_rate: within(session.avgHeartRate ?? null, 30, 250),
      max_heart_rate: within(session.maxHeartRate ?? null, 30, 250),
      calories_kcal: within(session.totalCalories ?? null, 0, 20000),
      elevation_gain_m: within(session.totalAscent ?? null, 0, 10000),
      avg_cadence:
        kind === 'outdoor_cycling' || kind === 'indoor_cycling'
          ? within(session.avgCadence ?? null, 1, 300)
          : null,
      memo: '',
    });
  });
}

// The extensions the file chooser offers.
export const activityFileAccept = '.tcx,.gpx,.fit,.zip';

// One chosen file → its activities. The format is taken from the extension, or from the root
// element when the extension is missing or unknown.
export function parseActivityFile(file: string, text: string): ImportedActivity[] {
  const extension = file.toLowerCase().split('.').pop();
  if (extension === 'tcx') return parseTcx(file, text);
  if (extension === 'gpx') return parseGpx(file, text);
  if (/<TrainingCenterDatabase[\s>]/.test(text)) return parseTcx(file, text);
  if (/<gpx[\s>]/.test(text)) return parseGpx(file, text);
  throw new ActivityFileError(`${file}: Only TCX, GPX, FIT and ZIP files can be imported.`);
}

// What one chosen file gave: its activities, and a message for each file (or file inside a
// ZIP) that could not be read. One bad file never stops the rest.
// `skipped` counts FIT files inside a ZIP that are not activities.
export type ReadResult = {
  activities: ImportedActivity[];
  problems: string[];
  skipped: number;
  // Only with xml: 'defer' (#387): TCX and GPX text left for the caller to parse.
  deferred?: DeferredXml[];
};
// TCX and GPX are read with DOMParser, which a Web Worker does not have. The worker unzips and
// reads FIT files and hands the XML text back to the page, which parses it (#387).
export type DeferredXml = { file: string; text: string };
export type ReadOptions = {
  xml?: 'parse' | 'defer';
  // Called after each entry of the chosen ZIP, so a large export shows progress.
  onProgress?: (done: number, total: number) => void;
};
// The page's side of xml: 'defer': one deferred file → its activities, or the reason it failed.
export function parseDeferred(item: DeferredXml): {
  activities: ImportedActivity[];
  problem?: string;
} {
  try {
    return { activities: parseActivityFile(item.file, item.text) };
  } catch (e) {
    return {
      activities: [],
      problem: e instanceof ActivityFileError ? e.message : damaged(item.file).message,
    };
  }
}

const extensionOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';
const startsWith = (bytes: Uint8Array, text: string, at = 0) =>
  Array.from(text).every((c, i) => bytes[at + i] === c.charCodeAt(0));
// Garmin's whole-account export keeps the activity files in ZIPs inside the ZIP, so one level
// of nesting is opened. Other entries (JSON, images, macOS "._" copies) are skipped.
const zipDepth = 2;
const activityEntry = (path: string, depth: number) => {
  const base = path.split('/').pop() ?? '';
  if (!base || base.startsWith('.') || path.startsWith('__MACOSX/')) return false;
  const extension = extensionOf(base);
  return ['tcx', 'gpx', 'fit'].includes(extension) || (extension === 'zip' && depth < zipDepth);
};
// One activity file is a few MB at most. A larger entry is not unpacked, so a hostile ZIP cannot
// fill the memory; the nested ZIPs of an account export are not capped.
const maxEntryBytes = 50 * 1024 * 1024;

// One chosen file → its activities. TCX and GPX are text; FIT is binary and is told by its
// ".FIT" signature as well as by its extension; a ZIP is opened and each activity file inside is
// read the same way. Its activities are named "archive.zip › activity.fit".
export async function readActivityFile(
  file: string,
  bytes: Uint8Array,
  depth = 0,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const extension = extensionOf(file);
  const nameOf = (path: string) => `${file} › ${path.split('/').pop()}`;
  const failed = (problem: string): ReadResult => ({
    activities: [],
    problems: [problem],
    skipped: 0,
  });
  try {
    if (extension === 'zip' || startsWith(bytes, 'PK\x03\x04')) {
      const { unzipSync } = await deps.fflate();
      const out: ReadResult = { activities: [], problems: [], skipped: 0 };
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(bytes, {
          filter: (entry) => {
            if (!activityEntry(entry.name, depth + 1)) return false;
            if (extensionOf(entry.name) === 'zip' || entry.originalSize <= maxEntryBytes)
              return true;
            out.problems.push(
              `${nameOf(entry.name)}: Too large for an activity file (over 50 MB).`,
            );
            return false;
          },
        });
      } catch {
        return failed(`${file}: Could not open the ZIP file. It is damaged.`);
      }
      const paths = Object.keys(entries).sort();
      if (!paths.length && !out.problems.length)
        return failed(`${file}: No TCX, GPX or FIT files found in the ZIP file.`);
      let done = 0;
      for (const path of paths) {
        const inner = await readActivityFile(nameOf(path), entries[path], depth + 1, {
          xml: options.xml,
        });
        out.activities.push(...inner.activities);
        out.problems.push(...inner.problems);
        out.skipped += inner.skipped;
        if (inner.deferred) (out.deferred ??= []).push(...inner.deferred);
        if (depth === 0) options.onProgress?.(++done, paths.length);
      }
      // Reported once, by the ZIP the user chose.
      if (depth === 0 && out.skipped) {
        out.problems.push(
          `${file}: Skipped ${out.skipped} FIT ${out.skipped === 1 ? 'file' : 'files'} without an activity summary (such as settings or daily health data).`,
        );
        out.skipped = 0;
      }
      return out;
    }
    if (extension === 'fit' || startsWith(bytes, '.FIT', 8))
      return { activities: await parseFit(file, bytes), problems: [], skipped: 0 };
    if (options.xml === 'defer')
      return {
        activities: [],
        problems: [],
        skipped: 0,
        deferred: [{ file, text: new TextDecoder().decode(bytes) }],
      };
    return {
      activities: parseActivityFile(file, new TextDecoder().decode(bytes)),
      problems: [],
      skipped: 0,
    };
  } catch (e) {
    // Inside a ZIP, a non-activity FIT file is only counted.
    if (e instanceof NotActivityError && depth > 0)
      return { activities: [], problems: [], skipped: 1 };
    return failed(e instanceof ActivityFileError ? e.message : damaged(file).message);
  }
}
