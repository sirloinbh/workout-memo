import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { command } from '../agents/process.mjs';
import { acquireLock, fingerprintFiles, listJobs, readJson, saveJson } from '../agents/store.mjs';

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-agents-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('job discovery skips incomplete publication and nonnumeric directories', (t) => {
  const directory = temporaryDirectory(t);
  const jobs = path.join(directory, 'jobs');
  assert.deepEqual(listJobs(jobs), []);
  fs.mkdirSync(path.join(jobs, '18'), { recursive: true });
  saveJson(path.join(jobs, 'not-a-job', 'job.json'), { id: 'not-a-job', stage: 'queued' });
  assert.deepEqual(listJobs(jobs), []);
  const job = { id: '18', stage: 'queued' };
  saveJson(path.join(jobs, '18', 'job.json'), job);
  assert.deepEqual(listJobs(jobs), [job]);
});

test('file fingerprint is stable across ordering and duplicate names', (t) => {
  const directory = temporaryDirectory(t);
  fs.writeFileSync(path.join(directory, 'a.txt'), 'first');
  fs.writeFileSync(path.join(directory, 'b.txt'), 'second');
  assert.equal(
    fingerprintFiles(directory, ['a.txt', 'b.txt']),
    fingerprintFiles(directory, ['b.txt', 'a.txt', 'b.txt']),
  );
});

test('file fingerprint detects edited, newly added and deleted content', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'a.txt');
  const names = ['a.txt'];
  const absent = fingerprintFiles(directory, names);
  fs.writeFileSync(file, 'first');
  const added = fingerprintFiles(directory, names);
  assert.notEqual(added, absent);
  fs.writeFileSync(file, 'changed');
  const edited = fingerprintFiles(directory, names);
  assert.notEqual(edited, added);
  fs.unlinkSync(file);
  const deleted = fingerprintFiles(directory, names);
  assert.notEqual(deleted, edited);
  assert.equal(deleted, absent);
});

test('file fingerprint detects a newly tracked filename', (t) => {
  const directory = temporaryDirectory(t);
  fs.writeFileSync(path.join(directory, 'a.txt'), 'same');
  fs.writeFileSync(path.join(directory, 'b.txt'), 'same');
  assert.notEqual(
    fingerprintFiles(directory, ['a.txt']),
    fingerprintFiles(directory, ['a.txt', 'b.txt']),
  );
});

test('file fingerprint refuses paths outside the worktree', (t) => {
  const directory = temporaryDirectory(t);
  for (const name of ['../outside.txt', path.resolve(directory, '..', 'outside.txt')]) {
    assert.throws(() => fingerprintFiles(directory, [name]), /outside the worktree/);
  }
});

test('saved state replaces earlier state and leaves no temporary artifact', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'jobs', '18.json');
  saveJson(file, { stage: 'tests', body: '완료 기준' });
  saveJson(file, { stage: 'implementation', body: '완료 기준' });
  assert.deepEqual(readJson(file), { stage: 'implementation', body: '완료 기준' });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['18.json']);
});

test('state reader accepts a UTF-8 BOM and reports corrupt state', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'state.json');
  fs.writeFileSync(file, '\uFEFF{"stage":"ci"}');
  assert.deepEqual(readJson(file), { stage: 'ci' });
  fs.writeFileSync(file, '{broken');
  assert.throws(() => readJson(file));
});

test('worker lock excludes concurrent workers and release allows a later worker', (t) => {
  const directory = temporaryDirectory(t);
  const release = acquireLock(directory);
  assert.throws(() => acquireLock(directory), /already running/);
  release();
  const releaseAgain = acquireLock(directory);
  releaseAgain();
  releaseAgain();
  assert.equal(fs.existsSync(path.join(directory, 'worker.lock')), false);
});

test('worker refuses malformed lock ownership rather than erasing it', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'worker.lock');
  fs.writeFileSync(file, 'invalid');
  assert.throws(() => acquireLock(directory), /Invalid worker lock/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid');
});

test('worker can recover a lock whose owner exited', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'worker.lock');
  // Windows PIDs cannot exceed this value; POSIX hosts also report it absent.
  const absentPid = 2147483647;
  assert.throws(() => process.kill(absentPid, 0), { code: 'ESRCH' });
  fs.writeFileSync(file, String(absentPid));
  const release = acquireLock(directory);
  assert.equal(fs.readFileSync(file, 'utf8'), String(process.pid));
  release();
});

test('command passes issue text through stdin literally', async () => {
  const input = '한글 $(Write-Output hacked); `whoami` & | "quoted"\nsecond line';
  const output = await command(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
    input,
  });
  assert.equal(output, input);
});

test('command passes arguments containing shell metacharacters literally', async () => {
  const argument = '$(whoami); echo changed & "hello"';
  const output = await command(process.execPath, [
    '-e',
    'process.stdout.write(process.argv[1])',
    argument,
  ]);
  assert.equal(output, argument);
});

test('command rejects nonzero exit with diagnostic stderr', async () => {
  await assert.rejects(
    command(process.execPath, [
      '-e',
      'process.stderr.write("Verification failed"); process.exit(7)',
    ]),
    /exited 7: Verification failed/,
  );
});

test('command rejects an executable that cannot be started', async (t) => {
  const directory = temporaryDirectory(t);
  await assert.rejects(command(path.join(directory, 'absent-executable'), []), { code: 'ENOENT' });
});

test('command times out instead of indefinitely blocking the worker', async () => {
  await assert.rejects(
    command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 }),
    /timed out/,
  );
});
