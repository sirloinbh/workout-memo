import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksum, planMigrations, readMigrations, type Migration } from '../src/migrations.js';

const repoMigrations = fileURLToPath(new URL('../../database/migrations/', import.meta.url));
const file = (name: string, sql = `-- ${name}`): Migration => ({
  name,
  sql,
  checksum: checksum(sql),
});

async function withDir(files: Record<string, string>, run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'workout-migrations-'));
  try {
    for (const [name, sql] of Object.entries(files)) await writeFile(join(dir, name), sql);
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('checksum ignores line endings and a UTF-8 BOM but not content', () => {
  const lf = "CREATE TABLE a();\nINSERT INTO a VALUES ('기타');\n";
  assert.equal(checksum(lf.replace(/\n/g, '\r\n')), checksum(lf));
  assert.equal(checksum(String.fromCharCode(0xfeff) + lf), checksum(lf));
  assert.notEqual(checksum(lf + '-- changed\n'), checksum(lf));
});

test('repository migrations are numbered uniquely and read in file order', async () => {
  const files = await readMigrations(repoMigrations);
  assert.ok(files.length >= 9);
  assert.equal(files[0].name, '001_initial.sql');
  assert.deepEqual(
    files.map((f) => f.name),
    [...files.map((f) => f.name)].sort(),
  );
  // Korean seed values survive the UTF-8 read used by the CLI (no console pipe).
  assert.match(files[0].sql, /'기타'/);
});

test('readMigrations rejects unexpected names and duplicate numbers', async () => {
  await withDir({ '001_a.sql': '', 'extra.sql': '' }, async (dir) => {
    await assert.rejects(readMigrations(dir), /NNN_name\.sql 형식.*extra\.sql/);
  });
  await withDir({ '001_a.sql': '', '001_b.sql': '' }, async (dir) => {
    await assert.rejects(readMigrations(dir), /번호가 중복됩니다: 001_a\.sql, 001_b\.sql/);
  });
  await withDir({ '002_b.sql': 'b', '001_a.sql': 'a', 'notes.txt': '' }, async (dir) => {
    assert.deepEqual(
      (await readMigrations(dir)).map((f) => f.name),
      ['001_a.sql', '002_b.sql'],
    );
  });
});

test('planMigrations returns only files after the applied history', () => {
  const files = [file('001_a.sql'), file('002_b.sql'), file('003_c.sql')];
  assert.deepEqual(
    planMigrations(files, []).pending.map((f) => f.name),
    ['001_a.sql', '002_b.sql', '003_c.sql'],
  );
  const applied = files.slice(0, 2).map(({ name, checksum }) => ({ name, checksum }));
  const plan = planMigrations(files, applied);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(
    plan.pending.map((f) => f.name),
    ['003_c.sql'],
  );
});

test('planMigrations reports changed, missing and out-of-order files', () => {
  const files = [file('001_a.sql'), file('002_b.sql', 'edited'), file('004_d.sql')];
  const plan = planMigrations(files, [
    { name: '001_a.sql', checksum: file('001_a.sql').checksum },
    { name: '002_b.sql', checksum: file('002_b.sql').checksum },
    { name: '003_c.sql', checksum: file('003_c.sql').checksum },
  ]);
  assert.deepEqual(plan.errors, [
    '적용된 마이그레이션 파일의 내용이 바뀌었습니다: 002_b.sql',
    '적용된 마이그레이션 파일이 없습니다: 003_c.sql',
  ]);
  const late = planMigrations(
    [file('001_a.sql'), file('002_b.sql'), file('003_c.sql')],
    [
      { name: '001_a.sql', checksum: file('001_a.sql').checksum },
      { name: '003_c.sql', checksum: file('003_c.sql').checksum },
    ],
  );
  assert.deepEqual(late.errors, ['이미 적용된 003_c.sql보다 앞선 번호의 새 파일입니다: 002_b.sql']);
});
