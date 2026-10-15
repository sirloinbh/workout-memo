import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { command } from '../agents/process.mjs';
import { publicationPaths, sensitivePath } from '../agents/security.mjs';

const marker = 'synthetic-review-db-marker';
function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const mode of ['failed', 'timeout']) {
  test(`thread identity survives a started-then-${mode} process`, async () => {
    let observed = null;
    const script = `process.stdout.write('{"type":"thread.star');
      setTimeout(() => {
        process.stdout.write('ted","thread_id":"failure-thread"}\\n');
        ${mode === 'failed' ? 'setTimeout(() => process.exit(23), 30);' : 'setInterval(() => {}, 1000);'}
      }, 30);`;
    await assert.rejects(
      command(process.execPath, ['-e', script], {
        timeout: mode === 'timeout' ? 1500 : 5000,
        onThread: (id) => {
          observed = id;
        },
      }),
      (error) => {
        assert.equal(observed, 'failure-thread');
        assert.equal(error.threadId, 'failure-thread');
        assert.match(error.message, mode === 'timeout' ? /timed out/ : /exited 23/);
        return true;
      },
    );
  });
}

function fixture(t, stage = 'implementation') {
  const root = directory(t);
  const scripts = path.join(root, 'scripts/agents');
  fs.cpSync(fileURLToPath(new URL('../agents', import.meta.url)), scripts, { recursive: true });
  fs.copyFileSync(path.join(scripts, 'process.mjs'), path.join(scripts, 'real-process.mjs'));
  const home = path.join(root, '.local/agent-workflow');
  const tree = path.join(home, 'worktrees/24');
  fs.mkdirSync(tree, { recursive: true });
  fs.writeFileSync(path.join(tree, 'source.txt'), 'source');
  const issue = {
    number: 24,
    title: 'Review fixes',
    body: '## Acceptance criteria\n- Fix boundaries',
    state: 'OPEN',
    updatedAt: '2026-10-15',
    url: 'https://github.com/sirloinbh/workout-memo/issues/24',
  };
  const jobFile = path.join(home, 'jobs/24/job.json');
  fs.mkdirSync(path.dirname(jobFile), { recursive: true });
  fs.writeFileSync(
    jobFile,
    JSON.stringify({
      id: '24',
      issue,
      stage,
      branch: 'feat/24-agent-task',
      baseSha: 'a'.repeat(40),
      history: [],
      results: {},
      attempts: 0,
    }),
  );
  fs.writeFileSync(
    path.join(home, 'config.json'),
    JSON.stringify({ codexExecutable: 'fake-codex', npmCli: path.join(root, 'fake-npm.mjs') }),
  );
  fs.writeFileSync(path.join(root, 'fake-npm.mjs'), '');
  fs.writeFileSync(path.join(root, 'issue.json'), JSON.stringify(issue));
  fs.writeFileSync(
    path.join(scripts, 'process.mjs'),
    `
    import fs from 'node:fs';
    import path from 'node:path';
    import { command as launch } from './real-process.mjs';
    export async function command(bin, args, options = {}) {
      const root = process.cwd();
      if (bin === 'fake-codex') return launch(process.execPath, [path.join(root, 'fake.mjs'), ...args], options);
      const text = args.join(' ');
      if (text.includes('remote get-url')) return 'https://github.com/sirloinbh/workout-memo.git';
      if (text.includes('branch --show-current')) return 'feat/24-agent-task';
      if (text.includes('rev-parse')) return 'a'.repeat(40);
      if (text.includes('ls-files') && !args.includes('--cached')) return process.env.SENSITIVE_NAME || '';
      if (text.includes('ls-files')) return (process.env.TRACKED_NAMES || 'source.txt').split('\\n').join('\\0');
      if (text.includes('diff --name-only')) return process.env.SENSITIVE_NAME || 'source.txt';
      if (text.includes('diff') && args.includes('--check')) return '';
      if (bin === 'npm' || args.includes(path.join(root, 'fake-npm.mjs'))) return '';
      if (text.includes('api user')) return 'sirloinbh';
      if (text.includes('issue view')) return fs.readFileSync(path.join(root, 'issue.json'), 'utf8');
      throw new Error('Unexpected command before publication: ' + text);
    }
  `,
  );
  fs.writeFileSync(
    path.join(root, 'fake.mjs'),
    `
    import fs from 'node:fs';
    for await (const chunk of process.stdin) { void chunk; }
    const args = process.argv.slice(2);
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({
      blocked: true, approved: false, summary: process.env.TEST_DATABASE_URL,
      evidence: { nested: [process.env.TEST_DATABASE_URL] }, recovery: process.env.TEST_DATABASE_URL
    }));
    console.log(JSON.stringify({ type: 'thread.started', thread_id: 'review-thread' }));
    if (process.env.FAIL_CHILD) process.exitCode = 23;
  `,
  );
  const invoke = (args, env = {}) => {
    const result = spawnSync(process.execPath, [path.join(scripts, 'cli.mjs'), ...args], {
      cwd: root,
      env: { ...process.env, TEST_DATABASE_URL: marker, ...env },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert.ifError(result.error);
    assert.ok(!(result.stdout + result.stderr).includes(marker));
    return result;
  };
  return { home, tree, jobFile, invoke };
}

test('verification accepts the repository tracked inventory without reading existing sensitive paths', (t) => {
  const repository = fileURLToPath(new URL('../..', import.meta.url));
  const inventory = spawnSync(
    'git',
    ['-c', `safe.directory=${repository.replaceAll('\\', '/')}`, 'ls-files', '-z'],
    { cwd: repository, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(inventory.status, 0, inventory.stderr);
  const names = inventory.stdout.split('\0').filter(Boolean);
  assert.ok(names.includes('.env.example'));
  const f = fixture(t, 'verification');
  for (const name of names.filter((name) => !sensitivePath(name))) {
    const file = path.join(f.tree, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'synthetic tracked content');
  }
  // Sensitive paths intentionally do not exist: any attempt to read one must fail.
  const result = f.invoke(['work', '--once'], { TRACKED_NAMES: names.join('\n') });
  assert.equal(result.status, 0, result.stderr);
  const job = JSON.parse(fs.readFileSync(f.jobFile, 'utf8'));
  assert.ok(job.results.verification?.fingerprint, job.error);
  assert.match(job.results.verification.summary, /passed/);
});

test('verification still rejects a changed tracked environment template before reading it', (t) => {
  const f = fixture(t, 'verification');
  const result = f.invoke(['work', '--once'], {
    TRACKED_NAMES: 'source.txt\n.env.example',
    SENSITIVE_NAME: '.env.example',
  });
  assert.equal(result.status, 0, result.stderr);
  const job = JSON.parse(fs.readFileSync(f.jobFile, 'utf8'));
  assert.equal(job.stage, 'blocked');
  assert.match(job.error, /Sensitive path cannot be published: \.env\.example/);
  assert.equal(job.results.verification, undefined);
});

for (const fail of [false, true]) {
  for (const action of ['work', 'diagnose']) {
    test(`${action} redacts structured output and preserves thread metadata on ${fail ? 'failure' : 'success'}`, (t) => {
      const f = fixture(t);
      const before = fs.readFileSync(f.jobFile, 'utf8');
      const result = f.invoke(
        action === 'work' ? ['work', '--once'] : ['diagnose', '24'],
        fail ? { FAIL_CHILD: '1' } : {},
      );
      assert.equal(result.status, action === 'diagnose' && fail ? 1 : 0, result.stderr);
      const status = f.invoke(['status']);
      assert.equal(status.status, 0, status.stderr);
      assert.match(status.stdout, /review-thread/);
      if (action === 'diagnose') assert.equal(fs.readFileSync(f.jobFile, 'utf8'), before);
      const files = fs
        .readdirSync(f.home, { recursive: true })
        .filter((name) => name.endsWith('.json'));
      for (const name of files) {
        const content = fs.readFileSync(path.join(f.home, name), 'utf8');
        assert.ok(!content.includes(marker), name);
      }
      const outputs = files.filter((name) =>
        /implementation\.json|diagnostic-result\.json/.test(name),
      );
      assert.equal(outputs.length, 1);
      assert.match(
        fs.readFileSync(path.join(f.home, outputs[0]), 'utf8'),
        /REDACTED_TEST_DATABASE_URL/,
      );
    });
  }
}

for (const name of [
  'connection.json',
  'nested/container.env',
  'credentials/key',
  '.codex/config.toml',
  'nested/.env.local',
  'backup.tfstate',
]) {
  test(`publication rejects ${name} without reading sensitive contents`, (t) => {
    assert.equal(sensitivePath(name), true);
    assert.throws(
      () => publicationPaths(['source.txt', name]),
      /Sensitive path cannot be published/,
    );
    const f = fixture(t, 'delivery');
    const result = f.invoke(['work', '--once'], { SENSITIVE_NAME: name });
    assert.equal(result.status, 0, result.stderr);
    const job = JSON.parse(fs.readFileSync(f.jobFile, 'utf8'));
    assert.equal(job.stage, 'blocked');
    assert.match(job.error, /Sensitive path cannot be published/);
    // No sensitive file exists: rejection must precede any content read or staging.
  });
}

test('status redacts nested legacy persisted results without modifying the job', (t) => {
  const f = fixture(t);
  const job = JSON.parse(fs.readFileSync(f.jobFile, 'utf8'));
  job.error = marker;
  job.results.implementation = { model: 'gpt-6.1-sol', threadId: marker, summary: marker };
  fs.writeFileSync(f.jobFile, JSON.stringify(job));
  const before = fs.readFileSync(f.jobFile, 'utf8');
  const status = f.invoke(['status']);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /REDACTED_TEST_DATABASE_URL/);
  assert.equal(fs.readFileSync(f.jobFile, 'utf8'), before);
});
