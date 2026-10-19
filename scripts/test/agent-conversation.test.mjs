import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as workflow from '../agents/workflow.mjs';
import { readJson, saveJson } from '../agents/store.mjs';

// Public boundary contracts for #43. Helpers may be re-exported from workflow.mjs.
// No real chat, GitHub, model, queue, credentials or application DB is used here.
const sha = 'a'.repeat(40);
const pr = 'https://github.com/sirloinbh/workout-memo/pull/9001';
const target = { project: 'sirloinbh/workout-memo', threadId: 'synthetic-explicit-thread' };
function job(number = 43) {
  return workflow.createJob(
    {
      number,
      title: `Synthetic feature ${number}`,
      body: '## Acceptance criteria\n- Notify the explicitly connected conversation.',
      updatedAt: '2026-10-19T01:00:00Z',
      state: 'OPEN',
      url: `https://github.com/sirloinbh/workout-memo/issues/${number}`,
    },
    sha,
  );
}
function api(name) {
  assert.equal(typeof workflow[name], 'function', `Missing #43 public behavior: ${name}`);
  return workflow[name];
}
function handlers(j, overrides = {}) {
  const calls = [];
  const saved = [];
  return {
    calls,
    saved,
    issue: async () => structuredClone(j.issue),
    save: async (value) => saved.push(structuredClone(value)),
    ...Object.fromEntries(
      ['prepare', 'tests', 'implementation', 'review', 'verification', 'delivery', 'ci'].map(
        (stage) => [
          stage,
          async () => {
            calls.push(stage);
            if (stage === 'review') return { approved: true, summary: 'Independent review passed' };
            if (stage === 'verification')
              return { summary: 'Synthetic checks: 12 pass; DB not run', db: false };
            if (stage === 'delivery') return { summary: 'Draft PR published', url: pr };
            if (stage === 'ci') return { pending: true, summary: 'CI pending' };
            return { summary: `${stage} complete` };
          },
        ],
      ),
    ),
    ...overrides,
  };
}
function request(j) {
  return {
    id: `q-${j.id}-retention`,
    issue: j.issue.number,
    requirementsVersion: j.issue.updatedAt,
    question: 'How long should completed notifications be retained?',
    options: [
      { id: 'short', label: '30 days', pros: ['Less storage'], cons: ['Short audit history'] },
      { id: 'long', label: '90 days', pros: ['Longer audit history'], cons: ['More storage'] },
    ],
    recommendation: { optionId: 'long', reason: 'Preserve restart diagnostics' },
    impact: 'Changes retention acceptance criteria and related tests',
    dependsOn: ['notification-retention'],
  };
}
async function waiting() {
  const j = job();
  const q = request(j);
  const h = handlers(j, {
    implementation: async () => ({ summary: 'User requirement needed', decisionRequest: q }),
  });
  await workflow.runStages(j, h);
  return { j, q, h };
}
function response(j, q, changes = {}) {
  return {
    questionId: q.id,
    issue: j.issue.number,
    requirementsVersion: q.requirementsVersion,
    source: 'user',
    answer: { optionId: 'long', text: '90 days, including failed deliveries.' },
    changesRequirements: true,
    ...changes,
  };
}
function event(j, kind = 'pr_published') {
  return {
    id: `event-${j.id}-${kind}`,
    kind,
    issue: { number: j.issue.number, title: j.issue.title },
    result: 'PR published; CI pending',
    prUrl: pr,
    verification: '12 pass; DB not run',
    remaining: ['CI verification', 'User review and merge'],
    delivery: { status: 'pending', attempts: 0 },
  };
}

test('#43 publication persists a truthful event before CI completes', async () => {
  const j = job();
  const h = handlers(j);
  await workflow.runStages(j, h);
  assert.equal(j.stage, 'ci');
  const published = j.events?.find((e) => e.kind === 'pr_published');
  assert.ok(published, 'PR publication must persist an outbox event');
  assert.ok(published.id);
  assert.equal(published.issue.number, 43);
  assert.equal(published.issue.title, j.issue.title);
  assert.equal(published.prUrl, pr);
  assert.match(published.verification, /12 pass.*DB not run/);
  assert.ok(published.result);
  assert.ok(published.remaining.length);
  assert.equal(published.delivery.status, 'pending', 'persistence is not chat acknowledgement');
  assert.equal(
    j.events.some((e) => e.kind === 'completed'),
    false,
  );
  assert.ok(h.saved.some((s) => s.events?.some((e) => e.id === published.id)));
});

test('#43 CI success produces one completion event, and restart does not replay old done jobs', async () => {
  const j = job();
  const h = handlers(j, { ci: async () => ({ summary: 'Required CI checks passed' }) });
  await workflow.runStages(j, h);
  assert.equal(j.stage, 'done');
  assert.equal(j.events?.filter((e) => e.kind === 'completed').length, 1);
  const restarted = JSON.parse(JSON.stringify(j));
  await workflow.runStages(restarted, handlers(restarted));
  assert.deepEqual(restarted.events, j.events);
  const legacy = job(44);
  legacy.stage = 'done';
  await workflow.runStages(legacy, handlers(legacy));
  assert.equal(legacy.events?.length ?? 0, 0, 'do not announce historic jobs as new completions');
});

test('#43 infrastructure failure remains blocked and gets its own event, not a product question', async () => {
  const j = job();
  await workflow.runStages(
    j,
    handlers(j, { tests: async () => ({ blocked: true, summary: 'Model access denied' }) }),
  );
  assert.equal(j.stage, 'blocked');
  const blocked = j.events?.find((e) => e.kind === 'blocked');
  assert.ok(blocked, 'blocked failures must be visible through the outbox');
  assert.match(blocked.result, /Model access denied/);
  assert.equal(j.pendingDecision, undefined);
});

test('#43 structured product question pauses before review, verification or publication', async () => {
  const { j, q, h } = await waiting();
  assert.equal(j.stage, 'awaiting_user');
  assert.deepEqual(j.pendingDecision, q);
  assert.equal(j.runningStage, null);
  assert.ok(!h.calls.includes('review'));
  assert.ok(!h.calls.includes('delivery'));
  const asked = j.events?.find((e) => e.kind === 'awaiting_user');
  assert.ok(asked);
  assert.equal(asked.questionId, q.id);
  const before = JSON.stringify(j);
  await workflow.runStages(j, handlers(j));
  assert.equal(JSON.stringify(j), before, 'no default answer or timeout-based continuation');
});

for (const key of [
  'id',
  'issue',
  'requirementsVersion',
  'question',
  'options',
  'recommendation',
  'impact',
  'dependsOn',
]) {
  test(`#43 malformed product question missing ${key} cannot advance to publication`, async () => {
    const j = job();
    const q = request(j);
    delete q[key];
    const h = handlers(j, { implementation: async () => ({ decisionRequest: q }) });
    await workflow.runStages(j, h);
    assert.equal(j.stage, 'blocked');
    assert.ok(!h.calls.includes('delivery'));
    assert.equal(j.pendingDecision, undefined);
  });
}

test('#43 actual user answer restarts tests and invalidates all downstream evidence', async () => {
  const respond = api('respondToDecision');
  const { j, q } = await waiting();
  Object.assign(j.results, {
    tests: { summary: 'Old tests' },
    review: { approved: true },
    verification: { fingerprint: 'stale-fingerprint' },
    delivery: { url: pr },
    ci: { summary: 'Old CI success' },
  });
  await respond(j, response(j, q));
  assert.equal(j.stage, 'tests', 'changed acceptance criteria require the formal test handoff');
  assert.equal(j.pendingDecision, undefined);
  for (const stage of ['tests', 'implementation', 'review', 'verification', 'ci'])
    assert.equal(j.results[stage], undefined, `${stage} evidence is stale`);
  assert.ok(j.decisions.some((d) => d.question.id === q.id && d.response.source === 'user'));
  assert.equal(j.mergeAuthorized, undefined, 'a product answer never grants merge permission');
});

for (const [label, changes] of [
  ['another issue', { issue: 44 }],
  ['another question', { questionId: 'unknown-question' }],
  ['stale requirements', { requirementsVersion: '2026-10-18T00:00:00Z' }],
  ['fabricated model answer', { source: 'agent' }],
  ['unknown candidate', { answer: { optionId: 'nonexistent' } }],
]) {
  test(`#43 rejects ${label} without modifying the waiting job`, async () => {
    const respond = api('respondToDecision');
    const { j, q } = await waiting();
    const before = JSON.stringify(j);
    await assert.rejects(async () => respond(j, response(j, q, changes)));
    assert.equal(JSON.stringify(j), before);
  });
}

test('#43 rejects duplicate answers and answers racing an active implementation', async () => {
  const respond = api('respondToDecision');
  const { j, q } = await waiting();
  const answer = response(j, q);
  j.runningStage = 'implementation';
  const before = JSON.stringify(j);
  await assert.rejects(async () => respond(j, answer));
  assert.equal(JSON.stringify(j), before);
  j.runningStage = null;
  await respond(j, answer);
  const answered = JSON.stringify(j);
  await assert.rejects(async () => respond(j, answer));
  assert.equal(JSON.stringify(j), answered);
});

test('#43 free-form user answer survives persistence and renders as user adoption', async () => {
  const respond = api('respondToDecision');
  const render = api('renderDecisions');
  const { j, q } = await waiting();
  const text = '45일\n| 사용자 입력 |\n<script>alert("synthetic")</script>';
  await respond(j, response(j, q, { answer: { text } }));
  assert.equal(j.decisions.at(-1).response.answer.text, text);
  const restored = JSON.parse(JSON.stringify(j));
  const markdown = render(restored);
  assert.match(markdown, /45일/);
  assert.match(markdown, /30 days/);
  assert.match(markdown, /90 days/);
  assert.match(markdown, /Less storage/);
  assert.match(markdown, /Short audit history/);
  assert.match(markdown, /Preserve restart diagnostics/);
  assert.match(markdown, /user|사용자/i);
  assert.match(markdown, /retention acceptance criteria/);
  assert.ok(!markdown.includes('<script>'), 'escape active HTML in PR Markdown');
  assert.equal(
    render(restored),
    markdown,
    'republishing must render a stable, nonduplicated section',
  );
});

test('#43 undecided question renders as unresolved without adopting the recommendation', async () => {
  const render = api('renderDecisions');
  const { j } = await waiting();
  const markdown = render(j);
  assert.match(markdown, /unresolved|pending|미결/i);
  assert.match(markdown, /90 days/);
  assert.equal(j.decisions?.length ?? 0, 0);
});

test('#43 oversized user answer is rejected atomically rather than silently truncated', async () => {
  const respond = api('respondToDecision');
  const { j, q } = await waiting();
  const before = JSON.stringify(j);
  await assert.rejects(async () =>
    respond(j, response(j, q, { answer: { text: 'x'.repeat(1_000_000) } })),
  );
  assert.equal(JSON.stringify(j), before);
});

test('#43 PR rendering redacts synthetic sensitive connection text without changing the answer', () => {
  const render = api('renderDecisions');
  const j = job();
  const text = 'Use postgres://synthetic:synthetic-password@invalid.example/fixture';
  j.decisions = [{ question: request(j), response: response(j, request(j), { answer: { text } }) }];
  const markdown = render(j);
  assert.ok(!markdown.includes('synthetic-password'));
  assert.equal(j.decisions[0].response.answer.text, text);
});

test('#43 outbox retries after disk reload, confirms matching receipt, and never duplicates acknowledged delivery', async (t) => {
  const flush = api('flushEvents');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-outbox-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'job.json');
  const j = job();
  j.events = [event(j)];
  const save = async (value) => saveJson(file, value);
  let sends = 0;
  await flush(j, {
    target,
    save,
    send: async () => {
      sends += 1;
      throw new Error('Synthetic chat transport disconnected');
    },
  });
  assert.notEqual(j.events[0].delivery.status, 'delivered');
  const restored = readJson(file);
  assert.equal(restored.events[0].id, j.events[0].id);
  const send = async (outgoing, destination) => {
    sends += 1;
    assert.deepEqual(destination, target);
    assert.equal(outgoing.id, j.events[0].id, 'retry uses the same idempotency key');
    return { eventId: outgoing.id, threadId: target.threadId, acknowledged: true };
  };
  await flush(restored, { target, save, send });
  assert.equal(restored.events[0].delivery.status, 'delivered');
  await flush(readJson(file), { target, save, send });
  assert.equal(sends, 2);
});

for (const receipt of [
  undefined,
  { acknowledged: false },
  { acknowledged: true, eventId: 'other', threadId: target.threadId },
  { acknowledged: true, eventId: 'event-43-pr_published', threadId: 'unrelated-thread' },
]) {
  test(`#43 transport result ${JSON.stringify(receipt)} cannot falsely acknowledge delivery`, async () => {
    const flush = api('flushEvents');
    const j = job();
    j.events = [event(j)];
    await flush(j, { target, save: async () => {}, send: async () => receipt });
    assert.notEqual(j.events[0].delivery.status, 'delivered');
  });
}

test('#43 missing explicit chat binding never discovers or sends to an arbitrary thread', async () => {
  const flush = api('flushEvents');
  const j = job();
  j.events = [event(j)];
  let sends = 0;
  await flush(j, {
    save: async () => {},
    send: async () => {
      sends += 1;
    },
  });
  assert.equal(sends, 0);
  assert.notEqual(j.events[0].delivery.status, 'delivered');
});

test('#43 failed durable save prevents sending an untracked event', async () => {
  const flush = api('flushEvents');
  const j = job();
  j.events = [event(j)];
  let sends = 0;
  await assert.rejects(async () =>
    flush(j, {
      target,
      save: async () => {
        throw new Error('Synthetic disk write failure');
      },
      send: async () => {
        sends += 1;
      },
    }),
  );
  assert.equal(sends, 0, 'persist the attempt and stable event ID before external side effects');
  assert.notEqual(j.events[0].delivery.status, 'delivered');
});

function candidate(number, { priority = 2, order = number, ...rest } = {}) {
  const j = job(number);
  j.scheduling = {
    authorized: true,
    requirementsConfirmed: true,
    kind: 'feature',
    priority,
    order,
    dependencies: [],
    ...rest,
  };
  j.issue.labels = [`priority:${priority}`, `order:${order}`];
  return j;
}

test('#43 next selection explains priority/order while excluding unsafe automatic candidates', () => {
  const select = api('selectNextJob');
  const eligible = candidate(52, { priority: 1, order: 2 });
  const queued = [
    candidate(20, { priority: 0, kind: 'roadmap' }),
    candidate(3, { priority: 0, kind: 'aggregate' }),
    candidate(45, { priority: 0, authorized: false }),
    candidate(46, { priority: 0, requirementsConfirmed: false }),
    candidate(47, { priority: 0, dependencies: [{ issue: 49, merged: false }] }),
    candidate(48, { priority: 0 }),
    candidate(50, { priority: 1, order: 3 }),
    candidate(51, { priority: 2, order: 1 }),
    eligible,
  ];
  queued.find((j) => j.id === '48').stage = 'awaiting_user';
  const result = select(queued);
  assert.equal(result.job.id, eligible.id);
  assert.match(result.reason, /priority|우선/i);
  assert.match(result.reason, /order|순서/i);
  assert.ok(result.skipped.some((entry) => String(entry.issue) === '47' && entry.reason));
});

test('#43 no authorized independent candidate returns an explained idle result', () => {
  const select = api('selectNextJob');
  const result = select([candidate(20, { kind: 'roadmap' }), candidate(45, { authorized: false })]);
  assert.equal(result.job, null);
  assert.equal(result.idle, true);
  assert.ok(result.reason);
});

test('#43 next selection excludes closed, duplicate and already running issues', () => {
  const select = api('selectNextJob');
  const closed = candidate(71, { priority: 0 });
  closed.issue.state = 'CLOSED';
  const running = candidate(72, { priority: 0 });
  running.stage = 'implementation';
  running.runningStage = 'implementation';
  const duplicate = candidate(72, { priority: 0 });
  const independent = candidate(73);
  const result = select([closed, running, duplicate, independent]);
  assert.equal(result.job.id, independent.id);
  assert.ok(result.skipped.some((entry) => String(entry.issue) === '72' && entry.reason));
});

test('#43 queue leaves unanswered work intact while starting an independent issue', async () => {
  const cycle = api('runQueueCycle');
  const { j: awaiting } = await waiting();
  awaiting.scheduling = candidate(43).scheduling;
  const independent = candidate(74);
  const dependent = candidate(75, { dependencies: [{ issue: 43, merged: false }] });
  const before = JSON.stringify(awaiting);
  const calls = [];
  const h = handlers(independent, {
    issue: async (value) => value.issue,
    implementation: async (value) => {
      calls.push(value.id);
      return { summary: 'Independent implementation complete' };
    },
  });
  await cycle([awaiting, dependent, independent], h);
  assert.deepEqual(calls, ['74']);
  assert.equal(JSON.stringify(awaiting), before);
  assert.equal(dependent.stage, 'queued');
});

for (const outcome of ['pass', 'fail']) {
  test(`#43 independent B starts while A CI is pending, then A CI ${outcome} is still processed`, async () => {
    const cycle = api('runQueueCycle');
    const a = candidate(61);
    a.stage = 'ci';
    a.results.delivery = { url: pr };
    const b = candidate(62);
    let pending = true;
    let active = 0;
    let maxActive = 0;
    let repairs = 0;
    const calls = [];
    const options = {
      save: async () => {},
      issue: async (j) => j.issue,
      ...Object.fromEntries(
        ['prepare', 'tests', 'implementation', 'review', 'verification', 'delivery'].map(
          (stage) => [
            stage,
            async (j) => {
              calls.push(`${j.id}:${stage}`);
              if (stage === 'implementation') {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await new Promise((resolve) => setImmediate(resolve));
                active -= 1;
                if (j.id === '61') repairs += 1;
              }
              return { approved: true, summary: `${stage} verified`, url: pr };
            },
          ],
        ),
      ),
      ci: async (j) => {
        calls.push(`${j.id}:ci`);
        if (j.id === '62' || pending) return { pending: true };
        return outcome === 'fail'
          ? { failed: true, summary: 'Synthetic CI failure' }
          : { summary: 'CI passed' };
      },
      maxAttempts: 2,
    };
    await cycle([a, b], options);
    assert.ok(calls.includes('62:implementation'), 'do not wait for A CI or user merge');
    assert.equal(a.stage, 'ci');
    assert.equal(maxActive, 1, 'preserve one implementation at a time');
    pending = false;
    for (let i = 0; i < 4 && !['done', 'blocked'].includes(a.stage); i += 1)
      await cycle([a, b], options);
    assert.equal(a.stage, outcome === 'pass' ? 'done' : 'blocked');
    if (outcome === 'fail') {
      assert.ok(repairs > 0 && repairs <= 2, 'CI repair must be retained and bounded');
      assert.ok(calls.includes('61:review'));
      assert.ok(calls.includes('61:verification'));
    }
    assert.equal(maxActive, 1);
  });
}
