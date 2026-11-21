import { cardioSessionSchemaFor, fieldErrors } from '../../../shared/contract';
import type { CardioBody, CardioSession } from './api';
import { isSameActivity, isSimilarActivity } from './duplicates';
import { sessionLabel } from './format';

// #387: the preview table's per-row save check, split out of cardio-import.tsx. The checks used
// to run for every row on every render, each one scanning every other row (n²). Now an index by
// external id and by date finds the few rows a row can relate to, the answer is kept on the row,
// and an edit re-checks only the rows connected to the edited one.
export type Check =
  | { kind: 'invalid'; text: string }
  | { kind: 'blocked'; text: string }
  | { kind: 'candidate'; text: string }
  | { kind: 'ok'; text: string };

export const canSave = (check: Check) => check.kind === 'ok' || check.kind === 'candidate';

export type CheckRow = {
  body: CardioBody;
  selected: boolean;
  // The user chose the check box; until then the default (only "Ready to save" rows) follows the
  // latest duplicate check.
  touched: boolean;
  check: Check;
};

// For tests: how many rows were checked since the last reset.
export const checkCounter = { rows: 0 };

const schemas = new Map<string, ReturnType<typeof cardioSessionSchemaFor>>();
const schemaFor = (today: string) => {
  let schema = schemas.get(today);
  if (!schema) schemas.set(today, (schema = cardioSessionSchemaFor(today)));
  return schema;
};

type Keyed = Pick<CardioBody, 'date' | 'source' | 'external_id'>;
type Lookup = { byExternal: Map<string, number[]>; byDate: Map<string, number[]> };

const push = (map: Map<string, number[]>, key: string, i: number) => {
  const list = map.get(key);
  if (list) list.push(i);
  else map.set(key, [i]);
};
const externalKey = (item: Keyed) => `${item.source}|${item.external_id}`;
function buildLookup(items: readonly Keyed[]): Lookup {
  const lookup: Lookup = { byExternal: new Map(), byDate: new Map() };
  items.forEach((item, i) => {
    push(lookup.byDate, item.date, i);
    if (item.external_id !== null) push(lookup.byExternal, externalKey(item), i);
  });
  return lookup;
}
const shift = (date: string, days: number) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
    : null;
// The indices (ascending) of the items that can be the same as or similar to `item`: the same
// external id, or a start on the same date or a day either side (near midnight).
function candidates(lookup: Lookup, item: Keyed): number[] {
  const found = new Set<number>(
    item.external_id === null ? [] : (lookup.byExternal.get(externalKey(item)) ?? []),
  );
  for (const date of [shift(item.date, -1), item.date, shift(item.date, 1)])
    for (const i of (date === null ? undefined : lookup.byDate.get(date)) ?? []) found.add(i);
  return [...found].sort((a, b) => a - b);
}
const related = (a: CardioBody, b: CardioBody) => isSameActivity(a, b) || isSimilarActivity(a, b);

type Context = {
  work: CheckRow[];
  rows: readonly CheckRow[];
  rowLookup: Lookup;
  existing: readonly CardioSession[];
  existingLookup: Lookup;
  today: string;
};

// What the row's Check column says and whether it may be saved, given the rows before it: invalid
// values and an activity already stored cannot be saved. An earlier row with the same id blocks
// this one only while that row is chosen, so either copy (e.g. the TCX without pauses rather than
// the GPX) can be picked. A look-alike may be saved once checked.
function checkRow(body: CardioBody, index: number, ctx: Context): Check {
  checkCounter.rows++;
  const parsed = schemaFor(ctx.today).safeParse(body);
  if (!parsed.success)
    return { kind: 'invalid', text: Object.values(fieldErrors(parsed.error)).join(' · ') };
  const stored = candidates(ctx.existingLookup, body)
    .map((i) => ctx.existing[i])
    .filter((s) => isSameActivity(s, body))[0];
  if (stored) return { kind: 'blocked', text: `Already imported (${sessionLabel(stored)})` };
  const before = candidates(ctx.rowLookup, body).filter((j) => j < index);
  const same = (j: number) => isSameActivity(ctx.work[j].body, body);
  const chosenTwin = before.find(
    (j) => same(j) && ctx.work[j].selected && canSave(ctx.work[j].check),
  );
  if (chosenTwin !== undefined)
    return {
      kind: 'blocked',
      text: `Same activity as row ${chosenTwin + 1}. Clear that row's selection to choose this one`,
    };
  const similar = candidates(ctx.existingLookup, body)
    .map((i) => ctx.existing[i])
    .filter((s) => isSimilarActivity(s, body))[0];
  if (similar)
    return {
      kind: 'candidate',
      text: `Possible duplicate: existing record ${sessionLabel(similar)}`,
    };
  const twin = before.find((j) => same(j) || isSimilarActivity(ctx.work[j].body, body));
  if (twin !== undefined)
    return { kind: 'candidate', text: `Possible duplicate: same as or similar to row ${twin + 1}` };
  return { kind: 'ok', text: 'Ready to save' };
}

// Checks the rows at `only` (every row when omitted), in table order. With `defaults`, rows the
// user has not chosen or cleared follow the default: chosen only when "Ready to save". Re-run
// after the stored sessions or a row change, so a new look-alike is never left chosen. Rows
// outside `only` keep their check.
export function recheck<T extends CheckRow>(
  rows: readonly T[],
  existing: readonly CardioSession[],
  today: string,
  { only, defaults = true }: { only?: ReadonlySet<number>; defaults?: boolean } = {},
): T[] {
  const work = rows.slice();
  const ctx: Context = {
    work,
    rows,
    rowLookup: buildLookup(rows.map((r) => r.body)),
    existing,
    existingLookup: buildLookup(existing),
    today,
  };
  const order = only ? [...only].sort((a, b) => a - b) : rows.map((_, i) => i);
  // A later twin the user chose wins: the row before it is not chosen by default, or it would
  // block the user's choice (review round 2).
  const chosenLater = (row: T, i: number) =>
    row.body.external_id !== null &&
    (ctx.rowLookup.byExternal.get(externalKey(row.body)) ?? []).some(
      (j) => j > i && rows[j].touched && rows[j].selected && isSameActivity(rows[j].body, row.body),
    );
  for (const i of order) {
    const row = rows[i];
    const follows = defaults && !row.touched;
    // The row's own choice does not change its check, only the rows after it see it.
    work[i] = follows ? { ...row, selected: false } : row;
    const check = checkRow(row.body, i, ctx);
    work[i] = follows
      ? { ...row, selected: check.kind === 'ok' && !chosenLater(row, i), check }
      : { ...row, check };
  }
  return work;
}

// The rows a change to row `index` can affect: itself, the rows related to it before and after
// the change (`before` is its body before), and the rows related to those, so a chain of
// look-alikes is re-checked together.
export function affectedBy(rows: readonly CheckRow[], index: number, before: CardioBody) {
  const lookup = buildLookup(rows.map((r) => r.body));
  const found = new Set<number>([index]);
  const around = (body: CardioBody) =>
    candidates(lookup, body).filter((j) => related(body, rows[j].body));
  for (const j of around(before)) found.add(j);
  const queue = [index, ...found];
  for (let n = 0; n < queue.length; n++)
    for (const j of around(rows[queue[n]].body))
      if (!found.has(j)) {
        found.add(j);
        queue.push(j);
      }
  return found;
}
