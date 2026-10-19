import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { compactHandoff } from '../agents/optimization.mjs';

for (const missingNotes of [true, false]) {
  test(`DB readiness ${missingNotes ? 'rejects missing' : 'accepts migrated'} set notes`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-schema-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, 'node_modules/pg'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), '{}');
    fs.writeFileSync(
      path.join(directory, 'node_modules/pg/index.js'),
      `const fs = require('node:fs');
const fields = {
  brands: ['id', 'name'],
  machines: ['id', 'brand_id', 'name', 'base_weight', 'notes'],
  workouts: ['id', 'date', 'title', 'notes', 'created_at'],
  sets: ['id', 'workout_id', 'exercise', 'machine_id', 'weight', 'reps', 'position'${missingNotes ? '' : ", 'notes'"}],
  goals: ['id', 'exercise', 'target_weight', 'target_reps', 'start_date', 'deadline']
};
exports.Client = class {
  async connect() {}
  async query(sql) {
    return { rows: sql.includes('information_schema.columns')
      ? Object.entries(fields).flatMap(([table_name, names]) => names.map(column_name => ({ table_name, column_name })))
      : Object.keys(fields).map(table_name => ({ table_name })) };
  }
  async end() { fs.writeFileSync(${JSON.stringify(path.join(directory, 'closed'))}, 'closed'); }
};`,
    );
    const probeUrl = new URL('../agents/optimization.mjs', import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { databaseProbe } from ${JSON.stringify(probeUrl)};
try { console.log(JSON.stringify(await databaseProbe(process.argv[1]))); }
catch (error) { console.error(error.message); process.exitCode = 1; }`,
        directory,
      ],
      {
        env: { ...process.env, TEST_DATABASE_URL: 'fixture-only-no-network' },
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      },
    );
    assert.equal(result.status, missingNotes ? 1 : 0, result.stderr);
    if (missingNotes) assert.match(result.stderr, /schema columns missing/);
    else assert.deepEqual(JSON.parse(result.stdout), { connected: true, schema: true });
    assert.equal(fs.readFileSync(path.join(directory, 'closed'), 'utf8'), 'closed');
    assert.ok(!(result.stdout + result.stderr).includes('fixture-only-no-network'));
  });
}

test('CI handoff preserves AssertionError diff and actual/expected from GitHub logs', () => {
  const block = [
    'test at scripts/test/agent-runtime.test.mjs:1032:3',
    'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
    '  + actual - expected',
    "  + 'blocked'",
    "  - 'delivery'",
    '  at TestContext.<anonymous> (agent-runtime.test.mjs:1036:12) {',
    "    code: 'ERR_ASSERTION',",
    "    actual: 'blocked',",
    "    expected: 'delivery',",
    "    operator: 'strictEqual'",
    '  }',
  ];
  const log = block
    .map((line) => `agent-workflow\tRun node --test\t2026-10-19T01:15:53.186Z ${line}`)
    .join('\n');
  const text = compactHandoff(
    { baseSha: 'a'.repeat(40), results: { ci: { logs: [log] } } },
    'implementation',
    [],
    'jobs/26/ci.log',
  );
  const conditions = JSON.parse(text).failureConditions.join('\n');
  for (const line of block) assert.ok(conditions.includes(line), `Lost assertion context: ${line}`);
  assert.ok(!conditions.includes('2026-10-19T01:15:53.186Z'));
});
