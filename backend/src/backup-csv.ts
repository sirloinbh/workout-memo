// A spreadsheet runs text that starts with these characters as a formula (CSV injection).
const formulaStart = /^[=+\-@\t\r]/;
export function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && formulaStart.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  String.fromCharCode(0xfeff) + rows.map((row) => row.map(csvCell).join(',') + '\r\n').join('');

export const csvColumns = [
  'workout_id',
  'date',
  'title',
  'workout_notes',
  'set_number',
  'exercise',
  'weight_kg',
  'reps',
  'volume_kg',
  'set_notes',
  'machine_id',
  'brand',
  'machine_name',
  'machine_base_weight_kg',
  // #83: appended so existing column positions stay the same.
  'workout_feedback',
];

// #114: cardio sessions get their own CSV; the workouts CSV above keeps its columns.
export const cardioCsvColumns = [
  'cardio_id',
  'date',
  'start_time',
  'kind',
  'duration_sec',
  'distance_km',
  'pace_sec_per_km',
  'speed_kmh',
  'avg_heart_rate',
  'max_heart_rate',
  'calories_kcal',
  'elevation_gain_m',
  'avg_cadence',
  'effort',
  'workout_id',
  'source',
  'external_id',
  'memo',
];
