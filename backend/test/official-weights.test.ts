import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { machineSchema } from '../src/domain.js';

// Parse the seed tuples of migration 009 without a database so data integrity is
// checked on every run, not only when TEST_DATABASE_URL is configured.
const migration = readFileSync(
  new URL('../../database/migrations/009_official_machine_weights.sql', import.meta.url),
  'utf8',
);
const docs = readFileSync(
  new URL('../../docs/machine-official-weights.md', import.meta.url),
  'utf8',
);
const columns = [
  'brand',
  'lineup',
  'model_number',
  'model_name',
  'official_item_name',
  'setting',
  'status',
  'raw_value',
  'raw_unit',
  'official_kg_text',
  'weight_kg',
  'basis',
  'source_url',
  'checked_date',
  'notes',
] as const;
type Row = Record<(typeof columns)[number], string | number | null>;
function tuple(line: string): (string | number | null)[] {
  const values: (string | number | null)[] = [];
  let i = line.indexOf('(') + 1;
  const end = line.lastIndexOf(')');
  while (i < end) {
    const c = line[i];
    if (c === ' ' || c === ',') i++;
    else if (c === "'") {
      let value = '';
      for (i++; ; i++) {
        if (line[i] === "'" && line[i + 1] === "'") value += line[i++];
        else if (line[i] === "'") break;
        else value += line[i];
      }
      i++;
      values.push(value);
    } else if (line.startsWith('NULL', i)) {
      values.push(null);
      i += 4;
    } else if (line.startsWith('DATE ', i)) i += 5;
    else {
      const match = /^[0-9.]+/.exec(line.slice(i));
      assert.ok(match, `Unexpected token in seed: ${line.slice(i, i + 20)}`);
      values.push(Number(match[0]));
      i += match[0].length;
    }
  }
  return values;
}
const seed = migration.slice(migration.indexOf('-- seed:begin'), migration.indexOf('-- seed:end'));
const rows: Row[] = seed
  .split('\n')
  .filter((line) => line.trim().startsWith('('))
  .map((line) => {
    const values = tuple(line);
    assert.equal(values.length, columns.length, line);
    return Object.fromEntries(columns.map((c, i) => [c, values[i]])) as Row;
  });

test('seed covers only the three requested brands and every row has a status and date', () => {
  assert.ok(rows.length > 0);
  assert.deepEqual([...new Set(rows.map((r) => r.brand))].sort(), [
    'Arsenal Strength',
    'Hammer Strength',
    'Newtech',
  ]);
  // Only the 온힘 lineup is in scope for Newtech; other Newtech lines must not be mixed in.
  assert.deepEqual(
    [...new Set(rows.filter((r) => r.brand === 'Newtech').map((r) => r.lineup))],
    ['온힘'],
  );
  for (const r of rows) {
    assert.ok(
      ['verified', 'unverified', 'conflict'].includes(String(r.status)),
      String(r.model_name),
    );
    assert.equal(r.checked_date, '2026-10-19');
  }
  const keys = rows.map((r) => [r.brand, r.lineup, r.model_name, r.setting].join('|'));
  assert.equal(new Set(keys).size, keys.length, 'Each brand/lineup/model/setting is unique');
});

test('every seeded numeric value has an https official source, unit, basis and exact kg conversion', () => {
  const numeric = rows.filter((r) => r.raw_value !== null);
  assert.ok(numeric.length > 0, 'At least one official value must be seeded');
  for (const r of numeric) {
    const label = `${r.brand} ${r.model_name} ${r.setting}`;
    assert.notEqual(r.status, 'unverified', label);
    assert.match(String(r.source_url), /^https:\/\/www\.lifefitness\.com\//, label);
    assert.ok(r.raw_unit === 'lb' || r.raw_unit === 'kg', label);
    assert.ok(['per_arm', 'combined', 'unspecified'].includes(String(r.basis)), label);
    assert.equal(typeof r.raw_value, 'number');
    assert.equal(typeof r.weight_kg, 'number');
    const expected =
      r.raw_unit === 'lb'
        ? Math.round((r.raw_value as number) * 0.45359237 * 100) / 100
        : (r.raw_value as number);
    assert.equal(r.weight_kg, expected, `${label}: lb x 0.45359237 rounded to 0.01 kg`);
    assert.ok(String(r.official_kg_text).endsWith(' kg'), `${label} keeps the official kg text`);
    assert.ok(String(r.official_item_name).startsWith('Starting Resistance'), label);
    if (r.basis === 'per_arm')
      assert.match(
        `${r.official_item_name} ${r.notes}`,
        /per (work-?)?arm/,
        `${label}: per-arm basis must come from the official wording`,
      );
  }
  // Only manufacturer pages qualify; retailer domains must never be a source.
  for (const r of rows) assert.doesNotMatch(String(r.source_url), /performaxx|amazon|coupang/);
});

test('unverified rows stay NULL (never 0) and record why', () => {
  const unverified = rows.filter((r) => r.status === 'unverified');
  assert.ok(unverified.length > 0);
  for (const r of unverified) {
    assert.equal(r.raw_value, null, String(r.model_name));
    assert.equal(r.weight_kg, null, String(r.model_name));
    assert.equal(r.raw_unit, null, String(r.model_name));
    assert.ok(String(r.notes).trim().length > 10, `${r.model_name} needs a reason`);
  }
  for (const r of rows.filter((x) => x.status === 'conflict'))
    assert.match(String(r.notes), /해소하지 않았다/, 'Conflicts are flagged, not resolved');
  // Arsenal and Newtech have no reachable official source, so nothing may be invented.
  assert.ok(
    rows.filter((r) => r.brand !== 'Hammer Strength').every((r) => r.status === 'unverified'),
  );
});

test('the documentation table lists every seeded row with the same value', () => {
  // Cells are trimmed so table alignment by the formatter does not matter.
  const table = docs
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  for (const r of rows) {
    const cells = table.find(
      (c) =>
        c[0] === r.brand &&
        c[1] === r.lineup &&
        c[3] === `${r.model_name}${r.setting ? ` (${r.setting})` : ''}`,
    );
    assert.ok(cells, `docs row for ${r.brand} ${r.model_name} ${r.setting}`);
    assert.equal(cells[2], r.model_number || '—');
    assert.equal(cells[6], r.weight_kg === null ? 'NULL' : (r.weight_kg as number).toFixed(2));
    assert.equal(cells[7], r.basis ?? '—');
    assert.equal(cells[10], r.status);
  }
  assert.equal(table.length - 2, rows.length, 'No extra or missing docs rows');
  assert.match(docs, new RegExp(`조사 행 수: ${rows.length}`));
});

test('migration is idempotent and never writes user machine weights or set totals', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS official_machine_weights/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS official_weight_id/);
  assert.match(migration, /ON CONFLICT \(brand, lineup, model_name, setting\) DO UPDATE/);
  assert.doesNotMatch(migration, /UPDATE\s+machines|UPDATE\s+sets|base_weight\s*=/i);
});

test('machine link to an official reference is optional and validated', () => {
  const machine = { brand_id: 1, name: 'Test', base_weight: null };
  // Omitted stays undefined so an update can keep the stored link; null means unlink.
  assert.equal(machineSchema.parse(machine).official_weight_id, undefined);
  assert.equal(
    machineSchema.parse({ ...machine, official_weight_id: null }).official_weight_id,
    null,
  );
  assert.equal(machineSchema.parse({ ...machine, official_weight_id: 5 }).official_weight_id, 5);
  for (const official_weight_id of [0, -1, 1.5, '1', 2147483648, {}])
    assert.equal(machineSchema.safeParse({ ...machine, official_weight_id }).success, false);
  // Linking a reference never fills in the user's base weight.
  assert.equal(machineSchema.parse({ ...machine, official_weight_id: 5 }).base_weight, null);
});

test('official reference API validates the query before touching storage', async () => {
  const calls: unknown[][] = [];
  const pool = {
    query(_sql: string, params: unknown[]) {
      calls.push(params);
      return Promise.resolve({ rows: [] });
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('server');
    const base = `http://127.0.0.1:${address.port}/api/official-machine-weights`;
    for (const query of ['?brand=', '?brand=a&brand=b', '?other=1', `?brand=${'x'.repeat(121)}`]) {
      const response: Response = await fetch(base + query);
      assert.equal(response.status, 400, query);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    assert.equal(calls.length, 0);
    for (const [query, param] of [
      ['', null],
      ['?brand=Hammer%20Strength', 'Hammer Strength'],
    ] as const) {
      const response: Response = await fetch(base + query);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
      assert.deepEqual(calls.at(-1), [param]);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('machine PUT keeps an omitted link and maps an unknown reference id to 400', async () => {
  const calls: unknown[][] = [];
  let fail = false;
  const pool = {
    query(_sql: string, params: unknown[]) {
      calls.push(params);
      if (fail)
        return Promise.reject(
          Object.assign(new Error('fk'), {
            code: '23503',
            constraint: 'machines_official_weight_id_fkey',
          }),
        );
      return Promise.resolve({ rowCount: 1, rows: [{ id: 1 }] });
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('server');
    const send = (method: string, body: object) =>
      fetch(`http://127.0.0.1:${address.port}/api/machines${method === 'PUT' ? '/1' : ''}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const body = { brand_id: 1, name: 'Test', base_weight: null };
    // [official_weight_id, update flag]: omitted must not overwrite the stored link.
    for (const [value, flag] of [
      [undefined, false],
      [null, true],
      [7, true],
    ] as const) {
      const response: Response = await send('PUT', { ...body, official_weight_id: value });
      assert.equal(response.status, 200);
      assert.deepEqual(calls.at(-1)!.slice(4), [value ?? null, 1, flag]);
    }
    const created: Response = await send('POST', body);
    assert.equal(created.status, 201);
    assert.equal(calls.at(-1)![4], null, 'Omitted on create means no link');
    fail = true;
    for (const method of ['POST', 'PUT']) {
      const response: Response = await send(method, { ...body, official_weight_id: 99 });
      assert.equal(response.status, 400, method);
      assert.equal((await response.json()).error, '선택한 공식 참고값이 존재하지 않습니다');
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
