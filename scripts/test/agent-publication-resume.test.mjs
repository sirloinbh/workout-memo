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
