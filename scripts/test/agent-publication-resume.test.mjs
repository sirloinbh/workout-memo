import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { checkEvidence } from '../agents/optimization.mjs';

// Execute the actual CLI publication entry point with fake IO. No GitHub,
// filesystem publication or model call is performed by these recovery tests.
const cli = fs.readFileSync(new URL('../agents/cli.mjs', import.meta.url), 'utf8');
const entrySources = {
  delivery: cli.slice(cli.indexOf('async function delivery('), cli.indexOf('\nasync function ci(')),
  ci: cli.slice(cli.indexOf('async function ci('), cli.indexOf('\nasync function worker(')),
};

for (const stage of ['delivery', 'ci']) {
  for (const change of ['none', 'command-fails', 'environment-passes']) {
    test(`normal ${stage} resume verifies ${change} evidence before publication or readiness`, async () => {
      const calls = [];
      const config = { browserCheckArgs: ['original-check'] };
      const host = { npm: 'original-version' };
      const job = {
        id: '26',
        branch: 'feat/26-agent-task',
        baseSha: 'a'.repeat(40),
        commit: 'b'.repeat(40),
        stage,
        issue: { title: 'Resume publication' },
        results: {
          implementation: { summary: 'Implemented' },
          review: { approved: true, summary: 'Reviewed' },
          delivery: { url: 'https://github.com/fixture/pull/1' },
        },
      };
      const key = () => checkEvidence(job, 'source', ['npm'], config, host);
      job.results.verification = { passed: true, fingerprint: 'source', checkKey: key() };
      if (change === 'command-fails') config.browserCheckArgs = ['changed-check'];
      if (change === 'environment-passes') host.npm = 'changed-version';

      const deliver = vm.runInNewContext(`(${entrySources[stage]})`, {
        identity: async () => {},
        assertBranch: async () => {},
        worktree: () => '/fixture',
        fingerprint: async () => 'source',
        changedPaths: async () => [],
        verification: async (current) => {
          calls.push('verification');
          if (current.results.verification.checkKey === key())
            return { ...current.results.verification, reused: true };
          calls.push('check');
          if (change === 'command-fails') throw new Error('Changed check failed');
          return { passed: true, fingerprint: 'source', checkKey: key(), summary: 'Rechecked' };
        },
        git: async (_cwd, action) => {
          calls.push(action);
          return '';
        },
        gh: async (_resource, action) => {
          calls.push(action);
          if (action === 'view')
            return JSON.stringify({
              headRefOid: job.commit,
              url: job.results.delivery.url,
              isDraft: true,
              statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS', status: 'COMPLETED' }],
            });
          return action === 'list'
            ? JSON.stringify([{ state: 'OPEN', url: 'https://github.com/fixture/pull/1' }])
            : '';
        },
        save: () => calls.push('save'),
        repo: 'fixture/repo',
        jobDir: () => '/fixture/job',
        path,
        fs: { writeFileSync: () => calls.push('write-body') },
      });
      if (change === 'command-fails') {
        await assert.rejects(deliver(job), /Changed check failed/);
        assert.equal(calls.includes('push'), false);
        assert.equal(calls.includes('edit'), false);
        assert.equal(calls.includes('ready'), false);
      } else {
        await deliver(job);
        assert.ok(calls.includes('verification'));
        const publishAction = stage === 'delivery' ? 'push' : 'ready';
        assert.ok(calls.indexOf('verification') < calls.indexOf(publishAction));
        assert.equal(job.results.verification.checkKey, key());
        assert.equal(calls.includes('check'), change !== 'none');
        assert.equal(calls.filter((call) => call === publishAction).length, 1);
        assert.equal(calls.filter((call) => call === 'edit').length, stage === 'delivery' ? 1 : 0);
      }
    });
  }
}

function mergeHarness(prState, { conflict = false } = {}) {
  const calls = [];
  const job = {
    id: '30',
    branch: 'feat/30-agent-task',
    commit: 'b'.repeat(40),
    stage: 'ci',
    results: {
      verification: { passed: true },
      delivery: { url: 'https://github.com/fixture/pull/2' },
    },
  };
  const run = vm.runInNewContext(`(${entrySources.ci})`, {
    verification: async (current) => current.results.verification,
    worktree: () => '/fixture',
    git: async (_cwd, action, ...args) => {
      calls.push(['git', action, ...args]);
      if (action === 'merge' && args[0] === '--no-edit' && conflict)
        throw new Error('CONFLICT (content)');
      return action === 'rev-parse' ? 'c'.repeat(40) : '';
    },
    gh: async (_resource, action, ...args) => {
      calls.push(['gh', action, ...args]);
      if (action === 'view')
        return JSON.stringify({
          headRefOid: job.commit,
          url: job.results.delivery.url,
          isDraft: false,
          statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS', status: 'COMPLETED' }],
          ...prState,
        });
      return '';
    },
    save: () => {},
    repo: 'fixture/repo',
    jobDir: () => '/fixture/job',
    path,
    Date,
  });
  return { calls, job, run: () => run(job) };
}

test('ci merges a mergeable PR at the verified head commit after checks pass', async () => {
  const h = mergeHarness({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' });
  const result = await h.run();
  const merge = h.calls.find(([tool, action]) => tool === 'gh' && action === 'merge');
  assert.deepEqual(merge.slice(2), [
    'https://github.com/fixture/pull/2',
    '--repo',
    'fixture/repo',
    '--merge',
    '--match-head-commit',
    'b'.repeat(40),
  ]);
  assert.equal(result.merged, true);
});

test('ci waits instead of merging while GitHub mergeability is unknown', async () => {
  const h = mergeHarness({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' });
  const result = await h.run();
  assert.equal(result.pending, true);
  assert.equal(
    h.calls.some(([tool, action]) => tool === 'gh' && action === 'merge'),
    false,
  );
});

test('ci brings a branch behind main up to date and re-waits for CI before merging', async () => {
  const h = mergeHarness({ mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND' });
  const result = await h.run();
  assert.equal(result.pending, true);
  assert.ok(h.calls.some(([, action, ...args]) => action === 'merge' && args[0] === '--no-edit'));
  assert.ok(h.calls.some(([, action]) => action === 'push'));
  assert.equal(h.job.commit, 'c'.repeat(40));
  assert.equal(h.job.ciStartedAt, null);
  assert.equal(
    h.calls.some(([tool, action]) => tool === 'gh' && action === 'merge'),
    false,
  );
});

test('ci aborts a conflicting main merge and blocks for coordinator resolution', async () => {
  const h = mergeHarness(
    { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' },
    { conflict: true },
  );
  await assert.rejects(h.run(), (error) => error.failureKind === 'merge-conflict');
  assert.ok(h.calls.some(([, action, ...args]) => action === 'merge' && args[0] === '--abort'));
  assert.equal(
    h.calls.some(([, action]) => action === 'push'),
    false,
  );
  assert.equal(h.job.commit, 'b'.repeat(40));
});

test('delivery adopts the coordinator merge commit after a merge-conflict retry', async () => {
  const calls = [];
  const job = {
    id: '30',
    branch: 'feat/30-agent-task',
    commit: 'b'.repeat(40),
    failureKind: 'merge-conflict',
    issue: { title: 'Conflict' },
    results: {
      implementation: { summary: 'Implemented' },
      review: { approved: true, summary: 'Reviewed' },
      verification: { passed: true, fingerprint: 'source', summary: 'ok' },
    },
  };
  const deliver = vm.runInNewContext(`(${entrySources.delivery})`, {
    identity: async () => {},
    assertBranch: async () => {},
    worktree: () => '/fixture',
    fingerprint: async () => 'source',
    changedPaths: async () => [],
    verification: async (current) => current.results.verification,
    git: async (_cwd, action, ...args) => {
      calls.push([action, ...args]);
      return action === 'rev-parse' ? 'c'.repeat(40) : '';
    },
    gh: async (_resource, action) =>
      action === 'list'
        ? JSON.stringify([{ state: 'OPEN', url: 'https://github.com/fixture/pull/2' }])
        : '',
    save: () => {},
    repo: 'fixture/repo',
    jobDir: () => '/fixture/job',
    path,
    fs: { writeFileSync: () => {} },
  });
  await deliver(job);
  assert.deepEqual(
    calls.find(([action]) => action === 'merge-base'),
    ['merge-base', '--is-ancestor', 'b'.repeat(40), 'c'.repeat(40)],
  );
  assert.equal(job.commit, 'c'.repeat(40));
  assert.equal(job.failureKind, null);
  assert.equal(job.ciCommit, job.commit);
});
