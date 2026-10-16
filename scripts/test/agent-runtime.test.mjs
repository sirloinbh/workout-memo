import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
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

// Public CLI contract for #24. All execution and state below belong to a disposable
// fixture: no real Codex, GitHub, repository, queue or database is contacted.
const roleAssignments = {
  planning: ['gpt-6-astra', 'high'],
  debugging: ['gpt-6-astra', 'high'],
  highRiskReview: ['gpt-6-astra', 'high'],
  tests: ['gpt-6.1-sol', 'medium'],
  implementation: ['gpt-6.1-sol', 'medium'],
  review: ['gpt-6.1-sol', 'medium'],
  research: ['gpt-6-luna', 'medium'],
  documentation: ['gpt-6-luna', 'medium'],
};

function modelFixture(t, overrides = {}) {
  const root = temporaryDirectory(t);
  const scripts = path.join(root, 'scripts');
  const home = path.join(root, '.local/agent-workflow');
  fs.mkdirSync(scripts, { recursive: true });
  fs.cpSync(fileURLToPath(new URL('../agents', import.meta.url)), path.join(scripts, 'agents'), {
    recursive: true,
  });
  fs.copyFileSync(
    fileURLToPath(new URL('../agents.ps1', import.meta.url)),
    path.join(scripts, 'agents.ps1'),
  );
  fs.copyFileSync(
    path.join(scripts, 'agents/process.mjs'),
    path.join(scripts, 'agents/real-process.mjs'),
  );
  const issue = {
    number: 21,
    title: 'docs: simple documentation task',
    body: '## 완료 기준\n- 문서를 정리한다.',
    updatedAt: '2026-10-15T00:00:00Z',
    url: 'https://github.com/sirloinbh/workout-memo/issues/21',
    state: 'OPEN',
  };
  const job = {
    id: '21',
    issue,
    branch: 'feat/21-agent-task',
    baseSha: 'a'.repeat(40),
    stage: 'tests',
    attempts: 0,
    history: [],
    results: { verification: { summary: 'Synthetic check failure' } },
    ...overrides,
  };
  const worktree = path.join(home, 'worktrees/21');
  fs.mkdirSync(worktree, { recursive: true });
  fs.writeFileSync(path.join(worktree, 'source.txt'), 'unchanged source\n');
  fs.writeFileSync(path.join(worktree, 'behavior.test.mjs'), 'unchanged test\n');
  saveJson(path.join(home, 'jobs/21/job.json'), job);
  saveJson(path.join(home, 'result-schema.json'), { sentinel: 'worker schema' });
  saveJson(path.join(home, 'config.json'), {
    codexExecutable: 'fixture-codex',
    npmCli: path.join(root, 'fake-npm.cjs'),
  });
  fs.writeFileSync(
    path.join(root, 'fake-npm.cjs'),
    `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync('npm-observed.json', JSON.stringify({ dbInherited: process.env.TEST_DATABASE_URL === 'fixture-only-db-marker' }));
fs.writeFileSync(path.resolve(process.cwd(), '../../stop'), 'stop');
console.log('Synthetic npm check complete');
`,
    'utf8',
  );
  saveJson(path.join(root, 'issue.json'), issue);
  fs.writeFileSync(
    path.join(scripts, 'agents/process.mjs'),
    `import fs from 'node:fs';
import path from 'node:path';
import { command as launch } from './real-process.mjs';
const root = process.cwd();
export async function command(bin, args, options = {}) {
  if (bin === 'fixture-codex') {
    return launch(process.execPath, [path.join(root, 'fake-codex.mjs'), ...args], options);
  }
  if (args[0]?.endsWith('fake-npm.cjs')) return launch(bin, args, options);
  const joined = args.join(' ');
  fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify({ bin, args }) + '\\n');
  if (/git(?:\\.exe)?$/.test(bin)) {
    if (joined.includes('remote get-url')) return 'https://github.com/sirloinbh/workout-memo.git';
    if (joined.includes('branch --show-current')) return 'feat/21-agent-task';
    if (joined.includes('rev-parse')) return 'a'.repeat(40);
    if (joined.includes('ls-files')) return 'source.txt\\0behavior.test.mjs';
    return '';
  }
  if (joined.includes('api user')) return 'sirloinbh';
  if (joined.includes('issue view')) return fs.readFileSync(path.join(root, 'issue.json'), 'utf8');
  throw new Error('Unexpected fixture command: ' + bin);
}
`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, 'fake-codex.mjs'),
    `import fs from 'node:fs';
import path from 'node:path';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const args = process.argv.slice(2);
const root = process.cwd();
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify({
  args, input, dbInherited: process.env.TEST_DATABASE_URL === 'fixture-only-db-marker',
  locks: fs.readdirSync(path.join(root, '.local/agent-workflow'), { recursive: true }).filter(name => name.endsWith('.lock'))
}) + '\\n');
if (process.env.FIXTURE_DELAY === '1') await new Promise(resolve => setTimeout(resolve, 750));
if (process.env.FIXTURE_MODEL_FAILURE === '1') {
  process.stderr.write('Requested model unavailable');
  process.exit(23);
}
if (process.env.FIXTURE_CHANGE_SOURCE === '1') {
  fs.appendFileSync(path.join(root, '.local/agent-workflow/worktrees/21/source.txt'), 'concurrent edit\\n');
}
const output = args[args.indexOf('--output-last-message') + 1];
if (process.env.FIXTURE_SUCCESS === '1') fs.writeFileSync(path.join(root, '.local/agent-workflow/stop'), 'stop');
fs.writeFileSync(output, JSON.stringify({ ready: true, blocked: process.env.FIXTURE_SUCCESS !== '1', approved: false,
  summary: 'Fixture stops before further stages; evidence and recovery suggestion.' }));
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread-21' }));
`,
    'utf8',
  );
  const invoke = (args, extraEnv = {}, powershell = false) => {
    const result = spawnSync(
      powershell ? 'powershell.exe' : process.execPath,
      powershell
        ? ['-NoProfile', '-NonInteractive', '-File', path.join(scripts, 'agents.ps1'), ...args]
        : [path.join(scripts, 'agents/cli.mjs'), ...args],
      {
        cwd: root,
        env: { ...process.env, TEST_DATABASE_URL: 'fixture-only-db-marker', ...extraEnv },
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      },
    );
    assert.ifError(result.error);
    return result;
  };
  const calls = () => {
    const file = path.join(root, 'calls.jsonl');
    return fs.existsSync(file)
      ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      : [];
  };
  const start = (args, extraEnv = {}) => {
    const child = spawn(process.execPath, [path.join(scripts, 'agents/cli.mjs'), ...args], {
      cwd: root,
      env: { ...process.env, TEST_DATABASE_URL: 'fixture-only-db-marker', ...extraEnv },
      windowsHide: true,
      stdio: 'ignore',
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
  };
  return { root, home, worktree, job, invoke, calls, start };
}

function assertModelCall(call, role, sandbox) {
  assert.ok(call, 'expected one actual fake Codex child process');
  const [model, effort] = roleAssignments[role];
  assert.ok(call.args.includes('--model'), 'explicit --model required');
  assert.equal(call.args[call.args.indexOf('--model') + 1], model);
  assert.ok(
    call.args.some(
      (arg, index) =>
        ['-c', '--config'].includes(call.args[index - 1]) &&
        arg.replaceAll('"', '') === `model_reasoning_effort=${effort}`,
    ),
    `explicit reasoning effort ${effort} required`,
  );
  assert.equal(call.args[call.args.indexOf('--sandbox') + 1], sandbox);
  assert.equal(call.args[call.args.indexOf('-a') + 1], 'never');
  assert.equal(call.args.at(-1), '-');
  assert.equal(call.dbInherited, true, 'dedicated test DB marker must reach the child');
}

for (const role of Object.keys(roleAssignments)) {
  test(`#24 smoke explicitly selects ${role} model and effort`, (t) => {
    const f = modelFixture(t);
    const result = f.invoke(['smoke', '--role', role]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.calls().length, 1);
    assertModelCall(f.calls()[0], role, 'read-only');
    assert.ok(!JSON.stringify(f.calls()).includes('fixture-only-db-marker'));
  });
}

for (const [stage, overrides, expectedRole] of [
  ['tests', {}, 'tests'],
  ['implementation', {}, 'implementation'],
  ['review', {}, 'review'],
  ['implementation', { taskKind: 'documentation' }, 'documentation'],
  ['review', { reviewRole: 'highRiskReview' }, 'highRiskReview'],
]) {
  test(`#24 worker routes ${stage} ${JSON.stringify(overrides)} explicitly`, (t) => {
    const f = modelFixture(t, { stage, ...overrides });
    const result = f.invoke(['work', '--once']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.calls().length, 1);
    assertModelCall(
      f.calls()[0],
      expectedRole,
      stage === 'review' ? 'read-only' : 'workspace-write',
    );
    // The legacy fixture deliberately has a documentation title and body. They
    // cannot silently route ordinary jobs to Luna without explicit taskKind.
    assert.equal(readJson(path.join(f.home, 'jobs/21/job.json')).stage, 'blocked');
  });
}

test('#24 unknown smoke role is rejected without contacting a fallback model', (t) => {
  const f = modelFixture(t);
  const result = f.invoke(['smoke', '--role', 'unapproved-model']);
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().length, 0);
});

test('#24 unapproved model override is rejected instead of silently using a default', (t) => {
  const f = modelFixture(t);
  const result = f.invoke(['smoke', '--role', 'tests', '--model', 'unapproved-model']);
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().length, 0);
});

for (const overrides of [{ taskKind: 'misspelled-kind' }, { reviewRole: 'unapproved-role' }]) {
  test(`#24 invalid persisted routing ${JSON.stringify(overrides)} blocks without fallback`, (t) => {
    const f = modelFixture(t, { stage: 'review', ...overrides });
    const result = f.invoke(['work', '--once']);
    assert.equal(result.status, 0, result.stderr);
    const saved = readJson(path.join(f.home, 'jobs/21/job.json'));
    assert.equal(saved.stage, 'blocked');
    assert.match(saved.error, /unknown|invalid|unsupported|task|role/i);
    assert.equal(f.calls().length, 0, 'invalid routing cannot silently use Sol');
  });
}

test(
  '#24 verification npm child inherits the dedicated DB without printing its value',
  {
    skip: process.platform !== 'win32' ? 'npmCli selection is Windows specific' : false,
  },
  (t) => {
    const f = modelFixture(t, { stage: 'verification' });
    const result = f.invoke(['work', '--once']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readJson(path.join(f.worktree, 'npm-observed.json')).dbInherited, true);
    assert.equal(readJson(path.join(f.home, 'jobs/21/job.json')).stage, 'delivery');
    const log = fs.readFileSync(path.join(f.home, 'jobs/21/checks.log'), 'utf8');
    assert.ok(!(result.stdout + result.stderr + log).includes('fixture-only-db-marker'));
  },
);

test('#24 successful role result persists the selected model effort and actual thread', (t) => {
  const f = modelFixture(t);
  const result = f.invoke(['work', '--once'], { FIXTURE_SUCCESS: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().length, 1);
  const saved = readJson(path.join(f.home, 'jobs/21/job.json'));
  assert.equal(saved.stage, 'implementation');
  assert.equal(saved.results.tests.role, 'tests');
  assert.equal(saved.results.tests.model, 'gpt-6.1-sol');
  assert.equal(saved.results.tests.reasoningEffort, 'medium');
  assert.equal(saved.results.tests.threadId, 'fixture-thread-21');
  assert.ok(!JSON.stringify(saved).includes('fixture-only-db-marker'));
});

test('#24 unavailable model fails once and does not escalate or fall back', (t) => {
  const f = modelFixture(t);
  const result = f.invoke(['smoke', '--role', 'tests'], { FIXTURE_MODEL_FAILURE: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().length, 1);
  assertModelCall(f.calls()[0], 'tests', 'read-only');
  assert.match(result.stderr, /23|unavailable/i);
});

test('#24 status exposes role model effort and thread without the inherited DB value', (t) => {
  const f = modelFixture(t, {
    results: {
      tests: {
        role: 'tests',
        model: 'gpt-6.1-sol',
        reasoningEffort: 'medium',
        threadId: 'fixture-thread-21',
        summary: 'Synthetic tests complete',
      },
    },
  });
  const result = f.invoke(['status']);
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.jobs[0].issue, '21');
  for (const value of ['tests', 'gpt-6.1-sol', 'medium', 'fixture-thread-21']) {
    assert.ok(JSON.stringify(status.jobs[0]).includes(value), `status missing ${value}`);
  }
  assert.ok(!result.stdout.includes('fixture-only-db-marker'));
});

function localSnapshot(f) {
  return Object.fromEntries(
    [
      'jobs/21/job.json',
      'result-schema.json',
      'worktrees/21/source.txt',
      'worktrees/21/behavior.test.mjs',
    ].map((name) => [name, fs.readFileSync(path.join(f.home, name), 'utf8')]),
  );
}

test('#24 diagnose uses Astra read-only and preserves worker state, schema and tests', (t) => {
  const f = modelFixture(t, {
    stage: 'blocked',
    blockedStage: 'verification',
    error: 'Synthetic check failure',
  });
  // A running worker must not prevent an independently locked diagnosis.
  fs.writeFileSync(path.join(f.home, 'worker.lock'), String(process.pid));
  const before = localSnapshot(f);
  const result = f.invoke(['diagnose', '21']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().length, 1);
  const call = f.calls()[0];
  assertModelCall(call, 'debugging', 'read-only');
  assert.deepEqual(localSnapshot(f), before);
  assert.equal(fs.readFileSync(path.join(f.home, 'worker.lock'), 'utf8'), String(process.pid));
  const output = call.args[call.args.indexOf('--output-last-message') + 1];
  const schema = call.args[call.args.indexOf('--output-schema') + 1];
  assert.ok(output.startsWith(f.home + path.sep), 'diagnostic output stays in ignored local home');
  assert.notEqual(schema, path.join(f.home, 'result-schema.json'));
  assert.notEqual(output, path.join(f.home, 'jobs/21/review.json'));
  assert.ok(call.locks.includes('worker.lock'));
  assert.ok(call.locks.length > 1, 'diagnosis must hold its own lock while Codex runs');
  assert.match(call.input, /Synthetic check failure/);
  assert.match(call.input, /snapshot|스냅샷/i);
  assert.ok(
    !JSON.stringify({ call, stdout: result.stdout, stderr: result.stderr }).includes(
      'fixture-only-db-marker',
    ),
  );
  const commandFile = path.join(f.root, 'commands.jsonl');
  const commands = fs.existsSync(commandFile)
    ? fs.readFileSync(commandFile, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  for (const { bin, args } of commands) {
    if (/git(?:\.exe)?$/.test(bin)) {
      assert.ok(
        !args.some((arg) =>
          ['add', 'commit', 'push', 'checkout', 'switch', 'reset', 'clean'].includes(arg),
        ),
        `diagnosis issued mutating Git command: ${args.join(' ')}`,
      );
    }
  }
});

test('#24 concurrent diagnoses of one issue exclude each other and release their lock', async (t) => {
  const f = modelFixture(t, { stage: 'blocked' });
  const first = f.start(['diagnose', '21'], { FIXTURE_DELAY: '1' });
  for (let attempt = 0; attempt < 50 && f.calls().length === 0; attempt += 1) await delay(20);
  if (f.calls().length === 0) {
    await first;
    assert.fail('diagnosis did not start a fake Codex process');
  }
  const second = f.invoke(['diagnose', '21']);
  assert.notEqual(second.status, 0, 'second diagnosis must refuse the active diagnosis lock');
  assert.match(second.stderr, /lock|running|diagnos/i);
  assert.equal(await first, 0);
  assert.equal(f.calls().length, 1, 'concurrent diagnosis must not invoke another model');
  const third = f.invoke(['diagnose', '21']);
  assert.equal(third.status, 0, third.stderr);
  assert.equal(f.calls().length, 2, 'completed diagnosis must release its own lock');
});

test('#24 diagnose rejects an absent issue without invoking a model', (t) => {
  const f = modelFixture(t);
  const result = f.invoke(['diagnose', '999']);
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().length, 0);
});

test('#24 diagnose reports model failure without rewriting job or retrying', (t) => {
  const f = modelFixture(t, { stage: 'blocked', error: 'Synthetic check failure' });
  const before = localSnapshot(f);
  const result = f.invoke(['diagnose', '21'], { FIXTURE_MODEL_FAILURE: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().length, 1);
  assertModelCall(f.calls()[0], 'debugging', 'read-only');
  assert.deepEqual(localSnapshot(f), before);
  const retry = f.invoke(['diagnose', '21']);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(f.calls().length, 2, 'failed diagnosis must release its separate lock');
});

test('#24 diagnose identifies a snapshot made stale by a concurrent source edit', (t) => {
  const f = modelFixture(t, { runningStage: 'implementation' });
  const before = fs.readFileSync(path.join(f.home, 'jobs/21/job.json'), 'utf8');
  const result = f.invoke(['diagnose', '21'], { FIXTURE_CHANGE_SOURCE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().length, 1);
  assert.equal(fs.readFileSync(path.join(f.home, 'jobs/21/job.json'), 'utf8'), before);
  // Metadata may be in a sidecar or the report. Only inspect the isolated
  // fixture's new diagnostic artifacts, never actual project local state.
  const artifacts = fs
    .readdirSync(f.home, { recursive: true })
    .filter((name) => /diagnos/i.test(name))
    .map((name) => path.join(f.home, name))
    .filter((name) => fs.statSync(name).isFile())
    .map((name) => fs.readFileSync(name, 'utf8'))
    .join('\n');
  assert.match(
    result.stdout + artifacts,
    /"stale"\s*:\s*true|"changed"\s*:\s*true|snapshot (?:is|became) (?:stale|outdated)|스냅샷.{0,25}(?:낡|변경되)/i,
  );
});

test(
  '#24 enqueue task kind crosses the PowerShell and Node boundary',
  {
    skip: process.platform !== 'win32' ? 'PowerShell wrapper is Windows specific' : false,
  },
  (t) => {
    const f = modelFixture(t);
    fs.rmSync(path.join(f.home, 'jobs/21'), { recursive: true });
    const result = f.invoke(['enqueue', '-Issue', '21', '-TaskKind', 'documentation'], {}, true);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readJson(path.join(f.home, 'jobs/21/job.json')).taskKind, 'documentation');
    assert.equal(f.calls().length, 0, 'enqueue must not invoke a model');
  },
);

test(
  '#24 diagnose issue crosses the PowerShell and Node boundary',
  {
    skip: process.platform !== 'win32' ? 'PowerShell wrapper is Windows specific' : false,
  },
  (t) => {
    const f = modelFixture(t);
    const result = f.invoke(['diagnose', '-Issue', '21'], {}, true);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.calls().length, 1);
    assertModelCall(f.calls()[0], 'debugging', 'read-only');
  },
);

test('#24 enqueue persists explicit task and review choices through Node CLI arguments', (t) => {
  const f = modelFixture(t);
  fs.rmSync(path.join(f.home, 'jobs/21'), { recursive: true });
  const result = f.invoke([
    'enqueue',
    '21',
    '--task-kind',
    'documentation',
    '--review-role',
    'highRiskReview',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const saved = readJson(path.join(f.home, 'jobs/21/job.json'));
  assert.equal(saved.taskKind, 'documentation');
  assert.equal(saved.reviewRole, 'highRiskReview');
  assert.equal(f.calls().length, 0);
});

for (const args of [['--task-kind', 'unknown'], ['--review-role', 'unknown'], ['--task-kind']]) {
  test(`#24 enqueue rejects invalid routing ${JSON.stringify(args)} before publishing a job`, (t) => {
    const f = modelFixture(t);
    fs.rmSync(path.join(f.home, 'jobs/21'), { recursive: true });
    const result = f.invoke(['enqueue', '21', ...args]);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(f.home, 'jobs/21/job.json')), false);
    assert.equal(f.calls().length, 0);
  });
}

// Proposed public command for safely updating the already queued #21. Keep this
// operation under the worker lock instead of asking users to edit live job JSON.
test('#24 configure changes queued routing while preserving work and prior results', (t) => {
  const f = modelFixture(t, { stage: 'queued' });
  const result = f.invoke(['configure', '21', '--task-kind', 'documentation']);
  assert.equal(result.status, 0, result.stderr);
  const saved = readJson(path.join(f.home, 'jobs/21/job.json'));
  assert.equal(saved.taskKind, 'documentation');
  for (const key of ['issue', 'baseSha', 'branch', 'stage', 'results', 'attempts']) {
    assert.deepEqual(saved[key], f.job[key], `configuration must preserve ${key}`);
  }
  assert.equal(fs.readFileSync(path.join(f.worktree, 'source.txt'), 'utf8'), 'unchanged source\n');
  assert.equal(f.calls().length, 0);
});

test('#24 configure refuses to edit routing while the worker owns its lock', (t) => {
  const f = modelFixture(t, { stage: 'queued' });
  fs.writeFileSync(path.join(f.home, 'worker.lock'), String(process.pid));
  const before = localSnapshot(f);
  const result = f.invoke(['configure', '21', '--task-kind', 'documentation']);
  assert.notEqual(result.status, 0);
  assert.deepEqual(localSnapshot(f), before);
  assert.equal(fs.readFileSync(path.join(f.home, 'worker.lock'), 'utf8'), String(process.pid));
  assert.equal(f.calls().length, 0);
});

test('#24 worker records unavailable model failure without an automatic second call', (t) => {
  const f = modelFixture(t);
  const result = f.invoke(['work', '--once'], { FIXTURE_MODEL_FAILURE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().length, 1);
  assertModelCall(f.calls()[0], 'tests', 'workspace-write');
  const saved = readJson(path.join(f.home, 'jobs/21/job.json'));
  assert.equal(saved.stage, 'blocked');
  assert.equal(saved.blockedStage, 'tests');
  assert.match(saved.error, /23|unavailable/i);
  assert.ok(
    !(result.stdout + result.stderr + JSON.stringify(saved)).includes('fixture-only-db-marker'),
  );
});
