import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { command } from '../agents/process.mjs';
import { compactHandoff, preserveRetryFailure } from '../agents/optimization.mjs';

for (const long of [false, true]) {
  test(`failed command preserves both streams in retry handoff (${long ? 'truncated' : 'short'})`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-output-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const log = path.join(root, 'checks.log');
    const script = `
      process.stdout.write('REGRESSION_R26 rollback assertion failed\\n');
      process.stdout.write('x'.repeat(${long ? 5 * 1024 * 1024 : 0}));
      process.stdout.write('\\nSTDOUT_END');
      process.stderr.write('EACCES stderr condition\\n');
      process.stderr.write('y'.repeat(${long ? 5000 : 0}));
      process.stderr.write('\\nSTDERR_END', () => { process.exitCode = 23; });
    `;
    await assert.rejects(command(process.execPath, ['-e', script], { log }), (error) => {
      assert.equal(error.exitCode, 23);
      assert.equal(error.failureKind, 'environment');
      for (const text of ['REGRESSION_R26', 'STDOUT_END', 'EACCES', 'STDERR_END', log])
        assert.ok(error.message.includes(text), text);
      assert.equal(error.message.includes('[truncated:'), long);
      assert.ok(error.message.length < 3500);
      const job = {
        error: error.message,
        blockedStage: 'verification',
        failureKind: 'test',
        results: {},
      };
      preserveRetryFailure(job, log);
      job.error = null;
      const handoff = compactHandoff(job, 'implementation', [], log);
      for (const text of ['exited 23', 'REGRESSION_R26', 'STDOUT_END', 'EACCES', 'STDERR_END'])
        assert.ok(handoff.includes(text), text);
      return true;
    });
    // Wait for the write stream to flush, without depending on its close timing.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = fs.readFileSync(log, 'utf8');
    assert.ok(output.includes('REGRESSION_R26'));
    assert.ok(output.includes('STDOUT_END'));
    assert.ok(output.includes('STDERR_END'));
    if (long) assert.ok(output.length > 5 * 1024 * 1024);
  });
}

test('failure excerpts redact secrets before cutting and decode split Korean UTF-8', async () => {
  const secret = 'synthetic-output-secret-26';
  const script = `
    const value = Buffer.from('회귀조건 ' + 'a'.repeat(580) + process.env.TEST_DATABASE_URL + 'b'.repeat(2000));
    for (const byte of value) process.stdout.write(Buffer.from([byte]));
    process.stderr.write(process.env.TEST_DATABASE_URL, () => { process.exitCode = 1; });
  `;
  await assert.rejects(
    command(process.execPath, ['-e', script], {
      env: { ...process.env, TEST_DATABASE_URL: secret },
    }),
    (error) => {
      assert.match(error.message, /회귀조건/);
      assert.ok(!error.message.includes(secret));
      assert.match(error.message, /REDACTED_TEST_DATABASE_URL/);
      assert.match(error.message, /truncated/);
      assert.match(error.message, /Full output was not logged/);
      return true;
    },
  );
});
