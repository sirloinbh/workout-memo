import assert from 'node:assert/strict';
import test from 'node:test';
import { command } from '../agents/process.mjs';
import {
  compactHandoff,
  codeEvidence,
  reviewPlan,
  digest,
  eventUsage,
  requirements,
  SUMMARY_LIMIT,
  retryStage,
  preserveRetryFailure,
} from '../agents/optimization.mjs';

const job = () => ({
  issue: { title: 'Atomic save', body: 'ALL acceptance criteria: rollback on duplicate save' },
  baseSha: 'a'.repeat(40),
  branch: 'feat/26-agent-task',
  results: {},
});

for (const stream of ['stdout', 'stderr']) {
  test(`nested permission failure on ${stream} is an environment failure`, async () => {
    await assert.rejects(
      command(process.execPath, [
        '-e',
        `process.${stream}.write('EACCES: Access is denied'); process.exitCode = 1;`,
      ]),
      (error) => {
        assert.equal(error.failureKind, 'environment');
        assert.equal(error.exitCode, 1);
        assert.match(error.message, /EACCES/);
        return true;
      },
    );
  });
}

test('assertion failure remains a code failure with its exit code and regression condition', async () => {
  await assert.rejects(
    command(process.execPath, [
      '-e',
      "console.log('REGRESSION_R26 rollback assertion failed'); process.exitCode = 23;",
    ]),
    (error) => {
      assert.equal(error.failureKind, undefined);
      assert.equal(error.exitCode, 23);
      assert.match(error.message, /exited 23.*REGRESSION_R26/);
      return true;
    },
  );
});

test('review recovery requires matching source branch base requirements and protected test evidence', () => {
  for (const change of [
    'none',
    'files',
    'branch',
    'baseSha',
    'issue',
    'tests',
    'routing',
    'requirements',
    'missing',
  ]) {
    const task = job();
    task.blockedStage = 'review';
    task.failureKind = 'environment';
    task.results.implementation = { blocked: false };
    task.results.tests = { testHashes: { 'behavior.test.mjs': 'original' } };
    task.implementationEvidence = codeEvidence(task, 'files');
    if (change === 'branch' || change === 'baseSha') task[change] += 'changed';
    if (change === 'issue') task.issue.body += 'changed';
    if (change === 'tests') task.results.tests.testHashes['behavior.test.mjs'] = 'changed';
    if (change === 'routing') task.testComplexity = 'simple';
    if (change === 'requirements') task.validationRequirements = { database: true };
    if (change === 'missing') delete task.implementationEvidence;
    assert.equal(
      retryStage(task, change === 'files' ? 'changed' : 'files'),
      change === 'none' ? 'review' : 'implementation',
      change,
    );
  }
});

test('retry refuses oversized failure conditions instead of silently truncating them', () => {
  const task = job();
  task.error = 'REGRESSION_R26 ' + 'x'.repeat(SUMMARY_LIMIT);
  assert.throws(() => preserveRetryFailure(task, 'safe/job.json'), /exceeds.*safe\/job.json/);
  assert.ok(task.error.startsWith('REGRESSION_R26'));
  assert.equal(task.latestFailure, undefined);
});

test('oversized critical findings stop explicitly instead of silently dropping a regression', () => {
  const task = job();
  task.results.review = { approved: false, summary: 'x'.repeat(SUMMARY_LIMIT + 1) };
  assert.throws(
    () => compactHandoff(task, 'implementation', [], '.local/agent-workflow/jobs/26/job.json'),
    /exceeds.*reconcile.*job.json/,
  );
});

test('handoff extracts CI failure conditions while unrelated log history stays local', () => {
  const task = job();
  task.results.ci = {
    failed: true,
    summary: 'CI failed',
    logs: ['old noise\nEXIT_23 regression rollback failed'],
  };
  const handoff = compactHandoff(
    task,
    'implementation',
    ['source.mjs'],
    '.local/agent-workflow/jobs/26/job.json',
  );
  assert.match(handoff, /EXIT_23/);
  assert.ok(!handoff.includes('old noise'));
});

test('review prioritizes delta only within prior scope and still requires final complete approval', () => {
  const task = job();
  assert.equal(reviewPlan(task, { 'a.mjs': '1' }).mode, 'full');
  task.reviewSnapshot = {
    files: { 'a.mjs': '1', 'b.mjs': '1' },
    scope: ['a.mjs'],
    requirements: digest(task.issue),
    baseSha: task.baseSha,
    branch: task.branch,
  };
  const plan = reviewPlan(task, { 'a.mjs': '2', 'b.mjs': '1' });
  assert.equal(plan.mode, 'delta');
  assert.deepEqual(plan.delta, ['a.mjs']);
  assert.match(plan.instruction, /ALL acceptance criteria.*complete final diff/);
  assert.equal(reviewPlan(task, { 'a.mjs': '2', 'b.mjs': '2' }).mode, 'full');
  assert.equal(reviewPlan(task, { 'a.mjs': '2', 'auth.mjs': '2' }).mode, 'full');
  task.reviewRole = 'highRiskReview';
  assert.equal(reviewPlan(task, { 'a.mjs': '2', 'b.mjs': '1' }).mode, 'full');
  task.reviewRole = 'review';
  task.issue.body += ' changed requirement';
  assert.equal(reviewPlan(task, { 'a.mjs': '2', 'b.mjs': '1' }).mode, 'full');
});

test('code evidence binds routing requirements protected tests and full source fingerprint', () => {
  const task = job();
  const before = codeEvidence(task, 'files');
  task.results.tests = { testHashes: { 'behavior.test.mjs': 'sha' } };
  assert.notEqual(codeEvidence(task, 'files'), before);
  const protectedEvidence = codeEvidence(task, 'files');
  task.validationRequirements = { browser: true };
  assert.notEqual(codeEvidence(task, 'files'), protectedEvidence);
});

test('only reported numeric usage is retained; absent usage is never estimated', () => {
  assert.deepEqual(eventUsage('unstructured output'), []);
  assert.deepEqual(
    eventUsage(
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 10, output_tokens: -1, cached_input_tokens: 'estimate' },
      }),
    ),
    [{ input_tokens: 10 }],
  );
  assert.throws(() => requirements({ validationRequirements: { database: 'true' } }), /Invalid/);
  assert.throws(() => requirements({ validationRequirements: { unknown: true } }), /Invalid/);
});

test('reported usage survives a later failing child instead of depending on successful stdout return', async () => {
  const observed = [];
  await assert.rejects(
    command(
      process.execPath,
      [
        '-e',
        `
    process.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:7,output_tokens:3}})+'\\n');
    setTimeout(() => process.exit(23), 40);
  `,
      ],
      { onUsage: (usage) => observed.push(usage) },
    ),
    /exited 23/,
  );
  assert.deepEqual(observed, [{ input_tokens: 7, output_tokens: 3 }]);
});

test('passing evidence cannot skip fixes after test review or CI failures', () => {
  for (const stage of ['review', 'verification', 'delivery', 'ci']) {
    for (const kind of ['test', 'review', 'ci', undefined]) {
      const task = job();
      task.blockedStage = stage;
      task.failureKind = kind;
      task.results.implementation = { blocked: false };
      task.results.review = { approved: true };
      task.implementationEvidence = codeEvidence(task, 'unchanged');
      task.reviewEvidence = task.implementationEvidence;
      assert.equal(retryStage(task, 'unchanged'), 'implementation', `${stage}/${kind}`);
    }
  }
});

test('retry failure stays available to every role after the transient error is cleared', () => {
  const task = job();
  task.blockedStage = 'verification';
  task.failureKind = 'test';
  task.error = 'EXIT_23 REGRESSION_R26 duplicate save must roll back';
  preserveRetryFailure(task, '.local/agent-workflow/jobs/26/job.json');
  delete task.error;
  for (const role of ['tests', 'implementation', 'review', 'highRiskReview']) {
    const handoff = JSON.parse(
      compactHandoff(task, role, [], '.local/agent-workflow/jobs/26/job.json'),
    );
    assert.equal(handoff.latestFailure.stage, 'verification');
    assert.equal(handoff.latestFailure.kind, 'test');
    assert.match(handoff.latestFailure.summary, /EXIT_23 REGRESSION_R26/);
    assert.match(handoff.latestFailure.summary, /duplicate save must roll back/);
  }
  assert.equal(task.resultHistory.at(-1).result.summary, task.latestFailure.summary);
});

test('oversized CI regression details block handoff rather than dropping the final failure', () => {
  const task = job();
  task.results.ci = {
    failed: true,
    summary: 'CI failed',
    logs: ['regression ' + 'x'.repeat(SUMMARY_LIMIT), 'EXIT_99 final rollback failure'],
  };
  for (const role of ['tests', 'implementation', 'review']) {
    assert.throws(
      () => compactHandoff(task, role, [], '.local/agent-workflow/jobs/26/job.json'),
      /CI failure conditions exceed.*reconcile.*job.json/,
    );
  }
  assert.match(task.results.ci.logs.at(-1), /EXIT_99/);
});

test('deleting a file participates in delta review and security deletions require full review', () => {
  const task = job();
  task.reviewSnapshot = {
    files: { 'save.mjs': '1', 'security.mjs': '1' },
    scope: ['save.mjs', 'security.mjs'],
    requirements: digest(task.issue),
    baseSha: task.baseSha,
    branch: task.branch,
  };
  const deletion = reviewPlan(task, { 'security.mjs': '1' });
  assert.equal(deletion.mode, 'delta');
  assert.deepEqual(deletion.delta, ['save.mjs']);
  const securityDeletion = reviewPlan(task, { 'save.mjs': '1' });
  assert.equal(securityDeletion.mode, 'full');
  assert.deepEqual(securityDeletion.delta, ['security.mjs']);
});
