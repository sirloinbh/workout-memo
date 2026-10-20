import assert from 'node:assert/strict';
import test from 'node:test';
import './agent-conversation.test.mjs';
import {
  assertIssue,
  assertSnapshot,
  createJob,
  nextStage,
  runStages,
} from '../agents/workflow.mjs';

function issue(overrides = {}) {
  return {
    number: 18,
    title: 'Add workout filtering',
    body: '## Acceptance criteria\n- Filter workouts by date.',
    updatedAt: '2026-10-14T00:00:00Z',
    url: 'https://github.com/sirloinbh/workout-memo/issues/18',
    state: 'OPEN',
    ...overrides,
  };
}

function harness(overrides = {}) {
  const calls = [];
  const saved = [];
  const options = {
    issue: async () => issue(),
    save: async (job) => saved.push(structuredClone(job)),
    ...Object.fromEntries(
      ['prepare', 'tests', 'implementation', 'review', 'verification', 'delivery', 'ci'].map(
        (stage) => [
          stage,
          async () => {
            calls.push(stage);
            return stage === 'review'
              ? { approved: true, summary: 'Meets requirements' }
              : { summary: `${stage} complete` };
          },
        ],
      ),
    ),
    ...overrides,
  };
  return { calls, saved, options };
}

test('accepts a scoped issue with English or Korean acceptance criteria', () => {
  assert.doesNotThrow(() => assertIssue(issue()));
  assert.doesNotThrow(() => assertIssue(issue({ body: '## 완료 기준\n- 날짜로 조회한다.' })));
});

test('rejects incomplete or incorrectly scoped issues before work starts', () => {
  const invalid = [
    { number: 0 },
    { number: -1 },
    { number: 1.5 },
    { number: Number.MAX_SAFE_INTEGER + 1 },
    { title: ' ' },
    { body: ' ' },
    { body: 'Implement something' },
    { url: 'https://github.com/other/workout-memo/issues/18' },
    { url: 'https://github.com/sirloinbh/workout-memo/issues/19' },
    { state: 'CLOSED' },
  ];
  for (const value of invalid)
    assert.throws(() => assertIssue(issue(value)), JSON.stringify(value));
});

test('creates a resumable job from an immutable issue snapshot', () => {
  const source = issue();
  const job = createJob(source, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(job.id, '18');
  assert.equal(job.branch, 'feat/18-agent-task');
  assert.equal(job.baseSha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(job.stage, 'queued');
  assert.equal(job.attempts, 0);
  assert.deepEqual(job.history, []);
  source.body = 'Changed externally';
  assert.equal(job.issue.body, issue().body);
});

test('detects requirement edits and issue identity changes', () => {
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.doesNotThrow(() => assertSnapshot(job, issue()));
  for (const changes of [
    { number: 19 },
    { title: 'Changed' },
    { body: 'Changed' },
    { updatedAt: 'later' },
  ]) {
    assert.throws(() => assertSnapshot(job, issue(changes)), JSON.stringify(changes));
  }
});

test('advances through the workflow and rejects unknown stages', () => {
  const stages = [
    'queued',
    'tests',
    'implementation',
    'review',
    'verification',
    'delivery',
    'ci',
    'done',
  ];
  for (let index = 0; index < stages.length - 1; index += 1) {
    assert.equal(nextStage(stages[index]), stages[index + 1]);
  }
  assert.throws(() => nextStage('unrecognized'));
});

test('runs tests, implementation, independent review and verification before delivery', async () => {
  const { calls, saved, options } = harness();
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, options);
  assert.deepEqual(calls, [
    'prepare',
    'tests',
    'implementation',
    'review',
    'verification',
    'delivery',
    'ci',
  ]);
  assert.equal(job.stage, 'done');
  assert.equal(saved.at(-1).stage, 'done');
  assert.equal(job.results.verification.summary, 'verification complete');
  const before = calls.length;
  await runStages(job, options);
  assert.equal(calls.length, before, 'a completed job must not publish again');
});

test('returns rejected reviews to implementation and eventually delivers approved work', async () => {
  let reviews = 0;
  const h = harness({
    review: async () => {
      h.calls.push('review');
      reviews += 1;
      return { approved: reviews === 2, summary: reviews === 1 ? 'Missing edge case' : 'Approved' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, h.options);
  assert.deepEqual(h.calls, [
    'prepare',
    'tests',
    'implementation',
    'review',
    'implementation',
    'review',
    'verification',
    'delivery',
    'ci',
  ]);
  assert.equal(job.stage, 'done');
});

test('bounds repeated review rejection and prevents publication', async () => {
  let reviews = 0;
  const h = harness({
    maxAttempts: 2,
    review: async () => {
      reviews += 1;
      return { approved: false, summary: 'Requirement not satisfied' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, h.options);
  assert.equal(job.stage, 'blocked');
  assert.ok(reviews <= 3, 'review retries must be bounded');
  assert.ok(!h.calls.includes('verification'));
  assert.ok(!h.calls.includes('delivery'));
});

test('a verification failure persists the reason and prevents publication', async () => {
  const { calls, saved, options } = harness({
    verification: async () => {
      throw new Error('npm run check failed');
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, options);
  assert.equal(job.stage, 'blocked');
  assert.equal(job.blockedStage, 'verification');
  assert.match(job.error, /npm run check failed/);
  assert.equal(saved.at(-1).stage, 'blocked');
  assert.ok(!calls.includes('delivery'));
  assert.ok(!calls.includes('ci'));
});

test('pending CI yields and resumes without repeating delivery', async () => {
  let checks = 0;
  const h = harness({
    ci: async () => {
      checks += 1;
      return checks === 1 ? { pending: true } : { summary: 'All required checks passed' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, h.options);
  assert.equal(job.stage, 'ci');
  assert.equal(checks, 1, 'pending CI must not busy poll');
  await runStages(job, h.options);
  assert.equal(job.stage, 'done');
  assert.equal(h.calls.filter((stage) => stage === 'delivery').length, 1);
});

test('persistently failed CI blocks after bounded repairs', async () => {
  let checks = 0;
  const { options } = harness({
    maxAttempts: 2,
    ci: async () => {
      checks += 1;
      return { failed: true, summary: 'Build failed' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, options);
  assert.equal(job.stage, 'blocked');
  assert.equal(job.blockedStage, 'ci');
  assert.equal(checks, 2);
});

test('transient CI failure reruns implementation, review and verification before new delivery', async () => {
  let checks = 0;
  const h = harness({
    ci: async () => {
      h.calls.push('ci');
      checks += 1;
      return checks === 1 ? { failed: true, summary: 'Fix build' } : { summary: 'CI passed' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, h.options);
  assert.equal(job.stage, 'done');
  assert.equal(job.attempts, 1);
  assert.deepEqual(h.calls, [
    'prepare',
    'tests',
    'implementation',
    'review',
    'verification',
    'delivery',
    'ci',
    'implementation',
    'review',
    'verification',
    'delivery',
    'ci',
  ]);
});

test('checks fresh requirements between stages and stops before implementing stale requirements', async () => {
  let changed = false;
  const h = harness({
    issue: async () => issue(changed ? { body: '## Acceptance criteria\n- New behavior' } : {}),
    tests: async () => {
      changed = true;
      return { summary: 'Tests written' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, h.options);
  assert.equal(job.stage, 'blocked');
  assert.ok(!h.calls.includes('implementation'));
  assert.ok(!h.calls.includes('delivery'));
});

test('a test agent blocked result stops implementation', async () => {
  const { calls, options } = harness({
    tests: async () => ({ blocked: true, summary: 'Acceptance criteria ambiguous' }),
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, options);
  assert.equal(job.stage, 'blocked');
  assert.equal(job.blockedStage, 'tests');
  assert.match(job.error, /Acceptance criteria ambiguous/);
  assert.ok(!calls.includes('implementation'));
});

test('implementation and review can report a blocker without publishing', async () => {
  for (const stage of ['implementation', 'review']) {
    const { calls, options } = harness({
      [stage]: async () => ({ blocked: true, summary: 'Needs a user decision' }),
    });
    const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await runStages(job, options);
    assert.equal(job.stage, 'blocked');
    assert.equal(job.blockedStage, stage);
    assert.ok(!calls.includes('verification'));
    assert.ok(!calls.includes('delivery'));
  }
});

test('missing required verification, delivery or CI cannot silently complete', async () => {
  for (const stage of ['verification', 'delivery', 'ci']) {
    const { options } = harness({ [stage]: undefined });
    const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await runStages(job, options);
    assert.equal(job.stage, 'blocked');
    assert.equal(job.blockedStage, stage);
  }
});

test('resuming a blocked job does not perform further side effects', async () => {
  const { calls, options } = harness();
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  job.stage = 'blocked';
  await runStages(job, options);
  assert.deepEqual(calls, []);
});

test('a cancelled job remains cancelled without executing or saving further work', async () => {
  const { calls, saved, options } = harness({
    issue: async () => {
      throw new Error('Cancelled jobs must not fetch requirements');
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  job.stage = 'cancelled';
  await runStages(job, options);
  assert.equal(job.stage, 'cancelled');
  assert.deepEqual(calls, []);
  assert.deepEqual(saved, []);
});

test('stopping between stages preserves resumable state without starting the next stage', async () => {
  let stopped = false;
  const h = harness({
    stopping: () => stopped,
    tests: async () => {
      h.calls.push('tests');
      stopped = true;
      return { summary: 'Tests prepared' };
    },
  });
  const job = createJob(issue(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await runStages(job, h.options);
  assert.equal(job.stage, 'implementation');
  assert.equal(h.saved.at(-1).stage, 'implementation');
  assert.deepEqual(h.calls, ['prepare', 'tests']);
  stopped = false;
  await runStages(job, h.options);
  assert.equal(job.stage, 'done');
  assert.equal(h.calls.filter((stage) => stage === 'tests').length, 1);
});
