import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createJob, runStages } from '../agents/workflow.mjs';
import {
  renderPrDecisions,
  schedulingFromIssue,
  updateDecisionRecord,
} from '../agents/conversation.mjs';
import { agentResultSchema } from '../agents/decision-schema.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-chat-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scripts = path.join(root, 'scripts/agents');
  fs.cpSync(fileURLToPath(new URL('../agents', import.meta.url)), scripts, { recursive: true });
  fs.writeFileSync(
    path.join(scripts, 'process.mjs'),
    `
    import fs from 'node:fs';
    import path from 'node:path';
    export async function command(bin, args) {
      if (args.join(' ').includes('issue view')) return fs.readFileSync(path.join(process.cwd(), 'issue.json'), 'utf8');
      throw new Error('Unexpected external call: ' + bin);
    }
  `,
  );
  const issue = {
    number: 81,
    title: 'Synthetic decision',
    body: '## Acceptance criteria\n- Decide retention',
    state: 'OPEN',
    updatedAt: 'version-1',
    url: 'https://github.com/sirloinbh/workout-memo/issues/81',
  };
  const job = createJob(issue, 'a'.repeat(40));
  job.stage = 'awaiting_user';
  job.runningStage = null;
  job.pendingDecision = {
    id: 'retention',
    issue: 81,
    requirementsVersion: 'version-1',
    question: 'Retention?',
    options: [
      { id: 'short', label: '30 days', pros: ['Small'], cons: ['Short'] },
      { id: 'long', label: '90 days', pros: ['Long'], cons: ['Large'] },
    ],
    recommendation: { optionId: 'long', reason: 'Audit' },
    impact: 'Acceptance criteria',
    dependsOn: ['retention'],
  };
  const home = path.join(root, '.local/agent-workflow');
  const file = path.join(home, 'jobs/81/job.json');
  const note = path.join(home, 'worktrees/81/docs/changes/81-agent-task.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.dirname(note), { recursive: true });
  fs.writeFileSync(note, '# Synthetic record\n');
  fs.writeFileSync(file, JSON.stringify(job));
  fs.writeFileSync(path.join(root, 'issue.json'), JSON.stringify(issue));
  const response = {
    source: 'user',
    issue: 81,
    questionId: 'retention',
    requirementsVersion: 'version-1',
    answer: { optionId: 'long', text: '90 days including failures' },
    changesRequirements: true,
  };
  const answer = path.join(root, 'answer.json');
  const invoke = (value = response) => {
    fs.writeFileSync(answer, JSON.stringify(value));
    const result = spawnSync(
      process.execPath,
      [path.join(scripts, 'cli.mjs'), 'respond', '81', answer],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 },
    );
    assert.ifError(result.error);
    return result;
  };
  return { root, home, file, note, job, response, invoke };
}

test('#43 CLI persists real user answer, updates docs and refuses replay', (t) => {
  const f = fixture(t);
  assert.equal(f.invoke().status, 0);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(saved.stage, 'tests');
  assert.equal(saved.decisions[0].response.answer.text, f.response.answer.text);
  const note = fs.readFileSync(f.note, 'utf8');
  assert.match(note, /90 days including failures/);
  assert.match(note, /30 days/);
  const before = fs.readFileSync(f.file, 'utf8');
  assert.equal(f.invoke().status, 1);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal(updateDecisionRecord(note, saved), note);
});

for (const mode of ['locked', 'stale', 'agent']) {
  test(`#43 CLI rejects ${mode} responses without mutating job or docs`, (t) => {
    const f = fixture(t);
    if (mode === 'locked') fs.writeFileSync(path.join(f.home, 'worker.lock'), String(process.pid));
    if (mode === 'stale') {
      const issue = { ...f.job.issue, updatedAt: 'version-2' };
      fs.writeFileSync(path.join(f.root, 'issue.json'), JSON.stringify(issue));
    }
    const before = fs.readFileSync(f.file, 'utf8');
    assert.equal(
      f.invoke(mode === 'agent' ? { ...f.response, source: 'agent' } : f.response).status,
      1,
    );
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    assert.equal(fs.readFileSync(f.note, 'utf8'), '# Synthetic record\n');
  });
}

test('#43 accept-requirements recovers a pending question after the issue changes', (t) => {
  const f = fixture(t);
  const issue = { ...f.job.issue, updatedAt: 'version-2', body: '## Acceptance criteria\n- New' };
  fs.writeFileSync(path.join(f.root, 'issue.json'), JSON.stringify(issue));
  assert.equal(f.invoke().status, 1, 'stale answer stays rejected');
  const result = spawnSync(
    process.execPath,
    [path.join(f.root, 'scripts/agents/cli.mjs'), 'accept-requirements', '81'],
    { cwd: f.root, encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(saved.stage, 'tests');
  assert.equal(saved.pendingDecision, undefined);
  assert.equal(saved.issue.updatedAt, 'version-2');
  assert.deepEqual(saved.results, {});
});

test('#43 accept-requirements refuses a running awaiting job', (t) => {
  const f = fixture(t);
  const job = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  fs.writeFileSync(f.file, JSON.stringify({ ...job, runningStage: 'review' }));
  const before = fs.readFileSync(f.file, 'utf8');
  const result = spawnSync(
    process.execPath,
    [path.join(f.root, 'scripts/agents/cli.mjs'), 'accept-requirements', '81'],
    { cwd: f.root, encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
});

test('#43 schema exposes nullable structured decisions on the existing role invocation', () => {
  assert.ok(agentResultSchema.required.includes('decisionRequest'));
  const schema = agentResultSchema.properties.decisionRequest.anyOf.find(
    (s) => s.type === 'object',
  );
  for (const field of [
    'id',
    'issue',
    'requirementsVersion',
    'question',
    'options',
    'recommendation',
    'impact',
    'dependsOn',
  ])
    assert.ok(schema.required.includes(field));
});

test('#43 GitHub scheduling metadata preserves explicit approval and blocks dependencies and aggregate cards', () => {
  const issue = {
    number: 81,
    body: 'Dependencies: #12, #13',
    labels: [{ name: 'priority:1' }, { name: 'order:5' }, { name: 'depends-on:14' }],
  };
  const s = schedulingFromIssue(issue);
  assert.equal(s.authorized, false);
  assert.equal(s.priority, 1);
  assert.equal(s.order, 5);
  assert.deepEqual(
    s.dependencies,
    [14, 12, 13].map((issue) => ({ issue, merged: false })),
  );
  assert.equal(schedulingFromIssue({ ...issue, number: 20 }).kind, 'aggregate');
});

test('#43 PR render retains small candidate history and links large free text through docs without mutating it', (t) => {
  const f = fixture(t);
  f.job.decisions = [{ question: f.job.pendingDecision, response: f.response }];
  delete f.job.pendingDecision;
  assert.match(renderPrDecisions(f.job), /Small/);
  f.job.decisions[0].response.answer.text = 'x'.repeat(16000);
  f.job.decisions.push(structuredClone(f.job.decisions[0]));
  const before = JSON.stringify(f.job);
  const rendered = renderPrDecisions(f.job);
  assert.ok(rendered.length < 24000);
  assert.match(rendered, /전체 자유 입력/);
  assert.match(rendered, /90 days/);
  assert.equal(JSON.stringify(f.job), before);
});

test('#43 publication defers CI polling in the production scheduling mode', async (t) => {
  const f = fixture(t);
  const j = f.job;
  j.stage = 'delivery';
  delete j.pendingDecision;
  let polled = false;
  await runStages(j, {
    deferCi: true,
    issue: async () => j.issue,
    save: async () => {},
    delivery: async () => ({ url: 'synthetic-pr' }),
    ci: async () => {
      polled = true;
      return { pending: true };
    },
  });
  assert.equal(j.stage, 'ci');
  assert.equal(polled, false);
  assert.equal(j.events[0].kind, 'pr_published');
});
