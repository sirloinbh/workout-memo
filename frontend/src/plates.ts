// #479: plate math for a barbell target. Weight is stored as the total including the bar,
// so each side carries (target - bar) / 2. The bar weight and plate set live only in this
// browser, like the rest timer settings, and the user can edit both.
export type PlateSettings = { format: 1; bar: number; plates: number[] };
export const plateSettingsKey = 'workout-memo:plates:v1';
export const maxBar = 100;
export const maxPlateKinds = 12;
export const defaultPlateSettings = (): PlateSettings => ({
  format: 1,
  bar: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
});

const validBar = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= maxBar;
const validPlate = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100;

/** Heaviest first, no duplicates. Returns null when the set is empty or has a bad value. */
export function normalizePlates(values: readonly unknown[]): number[] | null {
  if (values.length === 0 || values.length > maxPlateKinds || !values.every(validPlate))
    return null;
  return [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => b - a);
}

/** Reads a comma or space separated list such as "25, 20, 2.5". */
export function parsePlateText(text: string): number[] | null {
  const parts = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  return normalizePlates(parts);
}

export function parsePlateSettings(raw: string | null): PlateSettings {
  const defaults = defaultPlateSettings();
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw) as Partial<PlateSettings>;
    if (value?.format !== 1 || !validBar(value.bar) || !Array.isArray(value.plates))
      return defaults;
    const plates = normalizePlates(value.plates);
    return plates ? { format: 1, bar: value.bar, plates } : defaults;
  } catch {
    return defaults;
  }
}

export type PlateSplit =
  | { kind: 'below-bar'; bar: number }
  | { kind: 'exact'; perSide: { plate: number; count: number }[] }
  | {
      kind: 'inexact';
      perSide: { plate: number; count: number }[];
      /** The loadable total (kg) closest to the target. */
      nearest: number;
    };

// Work in hundredths of a kilogram so 1.25 and 2.5 add up without float drift.
const hundredths = (kg: number) => Math.round(kg * 100);

/** Splits the target total weight into plates for each side of the bar. */
export function splitPlates(target: number, settings: PlateSettings): PlateSplit {
  if (!Number.isFinite(target) || target < settings.bar)
    return { kind: 'below-bar', bar: settings.bar };
  const plates = [...settings.plates].sort((a, b) => b - a);
  let left = Math.floor((hundredths(target) - hundredths(settings.bar)) / 2);
  const exactTarget = (hundredths(target) - hundredths(settings.bar)) % 2 === 0;
  const perSide: { plate: number; count: number }[] = [];
  for (const plate of plates) {
    const unit = hundredths(plate);
    const count = Math.floor(left / unit);
    if (count > 0) {
      perSide.push({ plate, count });
      left -= count * unit;
    }
  }
  if (left === 0 && exactTarget) return { kind: 'exact', perSide };
  const smallest = hundredths(plates[plates.length - 1]);
  const loaded =
    hundredths(settings.bar) +
    2 * (Math.floor((hundredths(target) - hundredths(settings.bar)) / 2) - left);
  const up = loaded + 2 * smallest;
  const nearest = hundredths(target) - loaded <= up - hundredths(target) ? loaded : up;
  return { kind: 'inexact', perSide, nearest: nearest / 100 };
}

export const formatKg = (n: number) => `${Number(n.toFixed(2))} kg`;
