import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { command } from '../agents/process.mjs';
import { modelSelection, stageSelection, validateRouting } from '../agents/models.mjs';

test('routing rejects inherited object names and invalid persisted choices', () => {
  for (const role of ['toString', '__proto__', 'unknown'])
    assert.throws(() => modelSelection(role));
  for (const job of [{ taskKind: null }, { reviewRole: null }, { taskKind: 'unknown' }])
    assert.throws(() => validateRouting(job));
  assert.equal(stageSelection({}, 'implementation').model, 'gpt-6.1-sol');
  assert.equal(stageSelection({ taskKind: 'documentation' }, 'implementation').model, 'gpt-6-luna');
});

test('child stdout, stderr, logs and failures redact a DB value spanning chunks', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-model-redaction-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const marker = 'synthetic-dedicated-db-marker';
  const log = path.join(directory, 'child.log');
  const script = `const value = process.env.TEST_DATABASE_URL;
    process.stdout.write('prefix ' + value.slice(0, 8));
    process.stderr.write('error ' + value.slice(0, 9));
    setTimeout(() => {
      process.stdout.write(value.slice(8) + ' suffix');
      process.stderr.write(value.slice(9) + ' tail');
      process.exitCode = Number(process.argv[1]);
    }, 40);`;
  const options = { env: { ...process.env, TEST_DATABASE_URL: marker }, log };
  const output = await command(process.execPath, ['-e', script, '0'], options);
  assert.equal(output, 'prefix [REDACTED_TEST_DATABASE_URL] suffix');
  await assert.rejects(command(process.execPath, ['-e', script, '23'], options), (error) => {
    assert.match(error.message, /exited 23: error \[REDACTED_TEST_DATABASE_URL\] tail/);
    return !error.message.includes(marker);
  });
  const contents = fs.readFileSync(log, 'utf8');
  assert.ok(!contents.includes(marker));
  assert.match(contents, /REDACTED_TEST_DATABASE_URL/);
});
