export const stages = [
  'queued',
  'tests',
  'implementation',
  'review',
  'verification',
  'delivery',
  'ci',
  'done',
];

export function assertIssue(issue) {
  if (
    !Number.isSafeInteger(issue.number) ||
    issue.number < 1 ||
    !issue.title?.trim() ||
    !issue.body?.trim() ||
    !/(완료 기준|acceptance criteria)/i.test(issue.body) ||
    issue.url !== `https://github.com/sirloinbh/workout-memo/issues/${issue.number}` ||
    (issue.state && issue.state !== 'OPEN')
  ) {
    throw new Error('Open project issue with a title, body and acceptance criteria is required.');
  }
}

export function createJob(issue, baseSha) {
  assertIssue(issue);
  if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error('A full base commit SHA is required.');
  return {
    id: String(issue.number),
    issue: structuredClone(issue),
    baseSha,
    branch: `feat/${issue.number}-agent-task`,
    stage: 'queued',
    attempts: 0,
    history: [],
    results: {},
    createdAt: new Date().toISOString(),
  };
}

export function assertSnapshot(job, issue) {
  assertIssue(issue);
  for (const key of ['number', 'title', 'body', 'updatedAt', 'url']) {
    if (job.issue[key] !== issue[key])
      throw new Error('Issue requirements changed. Reconcile the snapshot before retrying.');
  }
}

export function nextStage(stage) {
  const index = stages.indexOf(stage);
  if (index < 0 || index >= stages.length - 1) throw new Error(`Invalid transition from ${stage}`);
  return stages[index + 1];
}

export async function runStages(job, handlers) {
  if (['done', 'blocked', 'cancelled'].includes(job.stage)) return job;
  while (job.stage !== 'done') {
    const stage = job.stage;
    try {
      if (handlers.stopping?.()) return job;
      assertSnapshot(job, await handlers.issue(job));
      job.runningStage = stage;
      await handlers.save(job);
      const result = await handlers[stage === 'queued' ? 'prepare' : stage](job);
      if (result?.blocked || (result?.failed && stage !== 'ci'))
        throw new Error(result.summary || `${stage} failed`);
      job.results ??= {};
      job.results[stage] = result;
      job.runningStage = null;
      if (stage === 'ci' && result?.pending) {
        await handlers.save(job);
        return job;
      }
      job.history.push({ stage, at: new Date().toISOString(), summary: result?.summary });
      if ((stage === 'review' && result?.approved !== true) || (stage === 'ci' && result?.failed)) {
        job.attempts += 1;
        await handlers.event?.(job, {
          kind: 'repair-retry',
          failureKind: stage,
          attempt: job.attempts,
        });
        if (job.attempts >= (handlers.maxAttempts ?? 2))
          throw new Error(`${stage} retry limit reached.`);
        job.stage = 'implementation';
      } else {
        job.stage = nextStage(stage);
      }
      await handlers.save(job);
      if (stage === 'verification' && result?.reused) return job;
    } catch (error) {
      job.stage = 'blocked';
      job.blockedStage = stage;
      job.runningStage = null;
      job.error = error.message;
      job.failureKind =
        error.failureKind ||
        (stage === 'verification'
          ? 'test'
          : stage === 'review'
            ? 'review'
            : stage === 'ci'
              ? 'ci'
              : 'code');
      await handlers.event?.(job, {
        kind: 'blocked',
        stage,
        failureKind: job.failureKind,
        error: job.error,
      });
      await handlers.save(job);
      return job;
    }
  }
  return job;
}
