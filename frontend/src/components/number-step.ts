// A plain decimal: digits with at most one decimal point, optionally negative so the schema's
// range message answers "-1". A comma is never accepted: "1,000" uses it as a thousands
// separator, and reading it as a decimal comma would save 1 for 1,000 (#115 review).
// Number() alone would also read "0x10", "1e3" or "Infinity" and send a value nobody typed.
const plainNumber = /^-?(\d+(\.\d*)?|\.\d+)$/;

// The one reader for typed number text (the stepper, the set fields and the cardio form, #383).
// Empty stays null (not recorded, never 0); anything that is not a plain decimal becomes NaN so
// the schema reports "Enter ... as a number" on that field.
export const optionalNumber = (value: string) => {
  const text = value.trim();
  if (text === '') return null;
  return plainNumber.test(text) ? Number(text) : Number.NaN;
};

const decimals = (value: number) => (String(value).split('.')[1] ?? '').length;

// The next value after a press of − or +. An empty or unreadable field counts as the minimum
// (or 0). Rounding to the longer of the value's and the step's decimals keeps 0.1 + 0.2 from
// showing as 0.30000000000000004 without cutting a typed 12.25.
export function stepValue(current: string, delta: number, min?: number, max?: number): string {
  const parsed = optionalNumber(current);
  const base = parsed !== null && Number.isFinite(parsed) ? parsed : (min ?? 0);
  const next = Number((base + delta).toFixed(Math.max(decimals(base), decimals(delta))));
  const low = min === undefined ? next : Math.max(min, next);
  return String(max === undefined ? low : Math.min(max, low));
}
