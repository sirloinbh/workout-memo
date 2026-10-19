import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEvidence, codeEvidence, retryStage } from '../agents/optimization.mjs';
import { createJob, runStages } from '../agents/workflow.mjs';

for (const stage of ['delivery', 'ci']) {
  for (const change of ['none', 'environment', 'command']) {
    test(`${stage} environment recovery revalidates ${change} check evidence before publication`, async () => {
      const job = createJob(
        {
          number: 26,
          title: 'Recover checks',
          body: 'Acceptance criteria: validate before publication',
          url: 'https://github.com/sirloinbh/workout-memo/issues/26',
        },
        'a'.repeat(40),
      );
      job.stage = 'blocked';
      job.blockedStage = stage;
      job.failureKind = 'environment';
      job.results.review = { approved: true };
      job.reviewEvidence = codeEvidence(job, 'source');
      const config = { browserCheckArgs: ['original-check'] };
      const host = { npm: 'original-version' };
      const key = () => checkEvidence(job, 'source', ['npm'], config, host);
      job.results.verification = { passed: true, checkKey: key() };
      if (change === 'environment') host.npm = 'changed-version';
      if (change === 'command') config.browserCheckArgs = ['changed-check'];

      job.stage = retryStage(job, 'source');
      assert.equal(job.stage, 'verification');
      const calls = [];
      await runStages(job, {
        issue: async () => job.issue,
        save: async () => {},
        verification: async () => {
          calls.push('verification');
          if (job.results.verification.checkKey === key())
            return { ...job.results.verification, reused: true };
          calls.push('check');
          throw Object.assign(new Error('Changed validation is unavailable'), {
            failureKind: 'environment',
          });
        },
        delivery: async () => {
          calls.push('publication');
          return {};
        },
        ci: async () => {
          calls.push('ci');
          return {};
        },
      });
      assert.deepEqual(calls, change === 'none' ? ['verification'] : ['verification', 'check']);
      assert.equal(job.stage, change === 'none' ? 'delivery' : 'blocked');
      assert.equal(job.results.review.approved, true, 'independent review is preserved');
      assert.equal(job.attempts, 0, 'environment recovery does not consume model repair attempts');
      if (change !== 'none') assert.equal(job.blockedStage, 'verification');
      assert.equal(retryStage(job, 'changed-source'), 'implementation');
    });
  }
}
