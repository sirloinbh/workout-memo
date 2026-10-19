import { appendEvent, validateDecision } from './conversation.mjs';
export { respondToDecision, renderDecisions, flushEvents } from './conversation.mjs';

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
  if (['done', 'blocked', 'cancelled', 'awaiting_user'].includes(job.stage)) return job;
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
      if (result?.decisionRequest) {
        validateDecision(job, result.decisionRequest);
        job.pendingDecision = structuredClone(result.decisionRequest);
        job.decisionStage = stage;
        job.stage = 'awaiting_user';
        job.runningStage = null;
        appendEvent(job, 'awaiting_user', result.summary || result.decisionRequest.question);
        await handlers.save(job);
        return job;
      }
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
      if (stage === 'delivery')
        appendEvent(job, 'pr_published', 'PR published; CI pending; user merge required');
      if (job.stage === 'done')
        appendEvent(job, 'completed', result?.summary || 'CI passed; user merge required');
      await handlers.save(job);
      // The CLI can release this job immediately after publication and poll CI separately.
      if (stage === 'delivery' && handlers.deferCi) return job;
      if (stage === 'verification' && result?.reused) return job;
    } catch (error) {
      job.stage = 'blocked';
      job.blockedStage = stage;
      job.runningStage = null;
      job.error = error.message;
      appendEvent(job, 'blocked', error.message);
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

export function selectNextJob(jobs) {
  const skipped = [];
  const eligible = [];
  const active = new Set(
    jobs
      .filter(
        (j) => j.runningStage || !['queued', 'done', 'cancelled', 'blocked'].includes(j.stage),
      )
      .map((j) => j.id),
  );
  const seen = new Set();
  for (const job of jobs) {
    const s = job.scheduling;
    let reason;
    if (seen.has(job.id) || active.has(job.id)) reason = 'Duplicate or in-progress issue';
    else if (job.stage !== 'queued' || job.runningStage) reason = `Stage ${job.stage}`;
    else if (job.issue.state && job.issue.state !== 'OPEN') reason = 'Issue closed';
    else if (!s?.authorized || !s.requirementsConfirmed)
      reason = 'Explicit authorization and confirmed requirements required';
    else if (s.kind !== 'feature') reason = 'Aggregate, roadmap or non-feature issue';
    else if (!Array.isArray(s.dependencies) || s.dependencies.some((d) => d.merged !== true))
      reason = 'Dependency PR not merged or unresolved';
    seen.add(job.id);
    if (reason) skipped.push({ issue: job.id, reason });
    else eligible.push(job);
  }
  eligible.sort(
    (a, b) =>
      (a.scheduling.priority ?? 100) - (b.scheduling.priority ?? 100) ||
      (a.scheduling.order ?? Number(a.id)) - (b.scheduling.order ?? Number(b.id)) ||
      Number(a.id) - Number(b.id),
  );
  return eligible.length
    ? {
        job: eligible[0],
        reason: 'Selected by explicit authorization, merged dependencies, priority then order',
        skipped,
      }
    : {
        job: null,
        idle: true,
        reason: 'No authorized independent queued issue with confirmed requirements',
        skipped,
      };
}

export async function runQueueCycle(jobs, handlers) {
  if (jobs.some((j) => j.runningStage)) return { job: null, reason: 'A stage is already running' };
  // CI checks never run model implementations concurrently. Repairs and resumable work
  // take precedence, while pending CI and unanswered questions do not hold the queue.
  for (const job of jobs.filter((j) => j.stage === 'ci')) {
    if (handlers.stopping?.()) return;
    await runStages(job, { ...handlers, deferCi: true });
  }
  const resumable = jobs.find((j) =>
    ['tests', 'implementation', 'review', 'verification', 'delivery'].includes(j.stage),
  );
  const selection = resumable
    ? { job: resumable, reason: `Resume ${resumable.stage}`, skipped: [] }
    : selectNextJob(jobs);
  await handlers.audit?.(selection);
  if (selection.job && !handlers.stopping?.())
    await runStages(selection.job, { ...handlers, deferCi: true });
  return selection;
}
