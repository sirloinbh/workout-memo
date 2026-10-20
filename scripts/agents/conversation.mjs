import { createHash } from 'node:crypto';
import { redact } from './security.mjs';

const project = 'sirloinbh/workout-memo';
const text = (s, max = 8000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
export function validateDecision(job, q) {
  if (
    !q ||
    !text(q.id, 160) ||
    q.issue !== job.issue.number ||
    q.requirementsVersion !== job.issue.updatedAt ||
    !text(q.question) ||
    !Array.isArray(q.options) ||
    q.options.length < 2 ||
    q.options.length > 8 ||
    q.options.some(
      (o) =>
        !text(o.id, 160) ||
        !text(o.label, 500) ||
        !Array.isArray(o.pros) ||
        !Array.isArray(o.cons) ||
        [...o.pros, ...o.cons].some((s) => !text(s, 2000)),
    ) ||
    new Set(q.options.map((o) => o.id)).size !== q.options.length ||
    !q.options.some((o) => o.id === q.recommendation?.optionId) ||
    !text(q.recommendation?.reason) ||
    !text(q.impact) ||
    !Array.isArray(q.dependsOn) ||
    !q.dependsOn.length ||
    q.dependsOn.some((s) => !text(s, 500)) ||
    job.decisions?.some((d) => d.question.id === q.id)
  ) {
    throw new Error('Invalid product decision request or stale requirements version');
  }
}

export function respondToDecision(job, response) {
  const q = job.pendingDecision;
  if (job.stage !== 'awaiting_user' || job.runningStage || !q)
    throw new Error('No idle pending question');
  validateDecision(job, q);
  if (
    !response ||
    response.source !== 'user' ||
    response.issue !== job.issue.number ||
    response.questionId !== q.id ||
    response.requirementsVersion !== q.requirementsVersion ||
    typeof response.changesRequirements !== 'boolean' ||
    !response.answer ||
    (response.answer.optionId !== undefined &&
      !q.options.some((o) => o.id === response.answer.optionId)) ||
    (response.answer.text !== undefined && !text(response.answer.text, 16000)) ||
    (!response.answer.optionId && !text(response.answer.text, 16000))
  ) {
    throw new Error('Invalid, duplicate, stale or non-user answer');
  }
  // Validate fully before mutation. An answer is never permission to merge.
  job.decisions ??= [];
  job.decisions.push({
    question: structuredClone(q),
    response: structuredClone(response),
    at: new Date().toISOString(),
  });
  delete job.pendingDecision;
  // A requirement answer can affect earlier tests even when labeled clarification.
  // Always use the formal handoff rather than resuming review with missing evidence.
  job.stage = 'tests';
  for (const stage of ['tests', 'implementation', 'review', 'verification', 'delivery', 'ci'])
    delete job.results[stage];
  job.ciStartedAt = null;
  job.attempts = 0;
  job.history.push({
    stage: 'user-response',
    questionId: q.id,
    requirementsVersion: q.requirementsVersion,
    at: new Date().toISOString(),
  });
  return job;
}

export function safeMarkdown(value) {
  return redact(String(value ?? ''))
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi, '[REDACTED_CONNECTION]')
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,})\b/g,
      '[REDACTED_TOKEN]',
    )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}|!#])/g, '\\$1');
}

const start = '<!-- agent-decisions:start -->';
const end = '<!-- agent-decisions:end -->';
export function updateDecisionRecord(document, job) {
  const section = `${start}\n${renderDecisions(job)}${end}`;
  const begin = document.indexOf(start);
  const finish = document.indexOf(end);
  if (begin < 0 && finish < 0) return `${document.trimEnd()}\n\n${section}\n`;
  if (begin < 0 || finish < begin || document.indexOf(start, begin + start.length) >= 0)
    throw new Error('Ambiguous decision record markers; inspect before updating');
  return document.slice(0, begin) + section + document.slice(finish + end.length);
}

export function schedulingFromIssue(issue, authorization = {}) {
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const numeric = (prefix, fallback) => {
    const values = labels
      .map((l) => l?.match(new RegExp(`^${prefix}:(\\d+)$`))?.[1])
      .filter(Boolean);
    return values.length === 1 ? Number(values[0]) : fallback;
  };
  const dependencies = new Set(
    labels.flatMap((l) => l?.match(/^depends-on:#?(\d+)$/)?.slice(1) || []),
  );
  for (const line of (issue.body || '').split('\n')) {
    if (/^\s*(?:[-*]\s*)?(?:depends on|dependencies|의존성)\s*:/i.test(line)) {
      for (const match of line.matchAll(/#(\d+)/g)) dependencies.add(match[1]);
    }
  }
  return {
    authorized: authorization.authorized === true,
    requirementsConfirmed: authorization.requirementsConfirmed === true,
    kind:
      [3, 20].includes(issue.number) ||
      labels.some((l) => /^(?:roadmap|aggregate|type:roadmap|type:aggregate)$/.test(l))
        ? 'aggregate'
        : 'feature',
    priority: numeric('priority', 100),
    order: numeric('order', issue.number),
    dependencies: [...dependencies].map((id) => ({ issue: Number(id), merged: false })),
    authorization: 'Explicit coordinator enqueue; no automatic discovery or authorization by title',
  };
}

export function renderDecisions(job, { compact = false } = {}) {
  const records = [
    ...(job.decisions || []),
    ...(job.pendingDecision ? [{ question: job.pendingDecision }] : []),
  ];
  if (!records.length)
    return '## 판단 기록\n\n미결 사용자 질문 없음. 통상 구현 판단과 근거는 변경 기록 참고.\n';
  return (
    '## 판단 기록\n\n' +
    records
      .map(({ question: q, response: r }) => {
        const adopted = r
          ? (q.options.find((o) => o.id === r.answer.optionId)?.label || '') +
            (r.answer.text ? `\n${r.answer.text}` : '')
          : '미결 (unresolved); 추천안 미채택';
        return (
          `### ${safeMarkdown(q.id)}\n\n질문: ${safeMarkdown(q.question)}\n\n` +
          (compact
            ? ''
            : q.options
                .map(
                  (o) =>
                    `- ${safeMarkdown(o.label)} — 장점: ${safeMarkdown(o.pros.join('; '))}; 단점: ${safeMarkdown(o.cons.join('; '))}\n`,
                )
                .join('') + '\n') +
          `추천: ${safeMarkdown(q.recommendation.optionId)} — ${safeMarkdown(q.recommendation.reason)}\n\n실제 채택: ${safeMarkdown(adopted)}\n\n결정 주체: ${r ? '사용자 (user)' : '미결'}\n\n영향: ${safeMarkdown(q.impact)}\n\n`
        );
      })
      .join('')
  );
}

export function renderPrDecisions(job) {
  const full = renderDecisions(job);
  if (full.length <= 24000) return full;
  const short = structuredClone(job);
  for (const d of short.decisions || []) {
    if (d.response.answer.text?.length > 1000)
      d.response.answer.text =
        d.response.answer.text.slice(0, 1000) + '\n[전체 자유 입력은 변경 기록 참고]';
  }
  const compact = renderDecisions(short, { compact: true });
  if (compact.length > 48000)
    throw new Error('Decision history exceeds PR limit; split the issue before publishing');
  return compact;
}

export function appendEvent(job, kind, result) {
  job.events ??= [];
  const questionId = kind === 'awaiting_user' ? job.pendingDecision?.id : undefined;
  const key = JSON.stringify([
    job.id,
    kind,
    job.commit || job.baseSha,
    questionId,
    kind === 'blocked' ? result : null,
  ]);
  const id = createHash('sha256').update(key).digest('hex');
  if (job.events.some((e) => e.id === id)) return;
  job.events.push({
    id,
    kind,
    issue: { number: job.issue.number, title: job.issue.title },
    result,
    prUrl: job.results.delivery?.url || null,
    verification: job.results.verification?.summary || 'Verification not completed',
    remaining:
      kind === 'completed'
        ? ['User review and merge']
        : kind === 'awaiting_user'
          ? ['Actual user answer required']
          : ['CI verification or blocked recovery', 'User review and merge'],
    ...(questionId ? { questionId, question: structuredClone(job.pendingDecision) } : {}),
    createdAt: new Date().toISOString(),
    delivery: { status: 'pending', attempts: 0 },
  });
}

export async function flushEvents(job, { target, save, send }) {
  if (target?.project !== project || !text(target?.threadId, 200) || typeof send !== 'function')
    return;
  for (const event of job.events || []) {
    if (event.delivery.status === 'delivered') continue;
    if (event.delivery.target && JSON.stringify(event.delivery.target) !== JSON.stringify(target))
      continue;
    event.delivery.target = structuredClone(target);
    event.delivery.status = 'pending';
    event.delivery.attempts += 1;
    await save(job); // Never send before the outbox and attempt are durable.
    try {
      const receipt = await send(structuredClone(event), target);
      if (
        receipt?.acknowledged !== true ||
        receipt.eventId !== event.id ||
        receipt.threadId !== target.threadId
      )
        throw new Error('No matching chat acknowledgement');
      event.delivery.status = 'delivered';
      event.delivery.receipt = receipt;
      delete event.delivery.error;
    } catch (error) {
      event.delivery.status = 'pending';
      event.delivery.error = redact(error.message);
    }
    try {
      await save(job);
    } catch (error) {
      event.delivery.status = 'pending';
      throw error;
    }
  }
}
