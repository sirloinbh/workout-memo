import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { redact, sensitivePath } from './security.mjs';

export const SUMMARY_LIMIT = 4000;
export const HANDOFF_LIMIT = 18000;
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function requirements(job) {
  const result = { database: false, browser: false, ...job.validationRequirements };
  for (const key of Object.keys(result))
    if (!['database', 'browser'].includes(key) || typeof result[key] !== 'boolean')
      throw new Error('Invalid validation requirements.');
  return result;
}

// No secrets or hash dictionaries are sent to models. A changed environment
// invalidates host checks, but an environment repair alone can retain code review.
export function codeEvidence(job, files) {
  return digest({
    files,
    branch: job.branch,
    baseSha: job.baseSha,
    issue: job.issue,
    routing: [job.taskKind, job.reviewRole, job.testComplexity],
    requirements: requirements(job),
    tests: job.results.tests?.testHashes,
  });
}

export function checkEvidence(job, files, npmCommand, config, host = {}) {
  return digest({
    code: codeEvidence(job, files),
    command: [...npmCommand, 'run', 'check'],
    runtime: process.version,
    platform: process.platform,
    environment: digest({
      db: process.env.TEST_DATABASE_URL || null,
      path: process.env.PATH,
      nodeOptions: process.env.NODE_OPTIONS,
      ci: process.env.CI,
    }),
    config,
    host,
  });
}

export function retryStage(job, files) {
  const evidence = codeEvidence(job, files);
  if (job.failureKind === 'environment') {
    if (
      job.blockedStage === 'review' &&
      job.results.implementation?.blocked === false &&
      job.implementationEvidence === evidence
    )
      return 'review';
    if (
      ['verification', 'delivery', 'ci'].includes(job.blockedStage) &&
      job.results.review?.approved === true &&
      job.reviewEvidence === evidence
    )
      // Review evidence proves the code, not the current host validation.
      // Verification compares the command/environment key before reusing checks.
      return 'verification';
  }
  return ['verification', 'delivery', 'ci', 'review'].includes(job.blockedStage)
    ? 'implementation'
    : job.blockedStage;
}

export function preserveRetryFailure(job, details) {
  if (!job.error) return;
  const failure = redact({
    stage: job.blockedStage,
    kind: job.failureKind,
    summary: job.error,
  });
  if (JSON.stringify(failure).length > SUMMARY_LIMIT)
    throw new Error(`Retry failure exceeds ${SUMMARY_LIMIT} characters; reconcile ${details}.`);
  job.latestFailure = failure;
  job.resultHistory ??= [];
  job.resultHistory.push({ stage: 'failure', result: failure });
}

function failureConditions(logs) {
  const selected = [];
  for (const log of logs) {
    // GitHub's repeated step/timestamp prefix is transport metadata. Keep the
    // original log locally and use the diagnostic text within the handoff cap.
    const lines = String(log)
      .split('\n')
      .map((line) => line.replace(/^.*\t\uFEFF?\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/, ''));
    const indices = new Set();
    let assertion = false;
    for (const [index, line] of lines.entries()) {
      if (/\bAssertionError\b|\bERR_ASSERTION\b/.test(line)) {
        assertion = true;
        for (let context = Math.max(0, index - 2); context < index; context++) indices.add(context);
      }
      if (
        assertion ||
        /\b(error|failed|failure|regression|assertion|rollback)\b|\bexit(?:[_ :]\w*)?/i.test(line)
      )
        indices.add(index);
      if (assertion && line.trim() === '}') assertion = false;
    }
    selected.push(...[...indices].sort((a, b) => a - b).map((index) => lines[index]));
  }
  // Shared assertion scaffolding need not be repeated. Every distinct failure
  // and actual/expected value remains; oversized critical detail still blocks.
  return [...new Set(selected)];
}

export function compactHandoff(job, role, paths, details, review = { mode: 'full' }) {
  const relevant =
    role === 'tests'
      ? ['review', 'ci', 'tests']
      : role === 'implementation'
        ? ['tests', 'review', 'ci', 'verification']
        : ['tests', 'implementation', 'review', 'verification', 'ci'];
  const results = {};
  for (const stage of relevant) {
    const result = job.results[stage];
    if (!result) continue;
    // Do not silently truncate failure codes, regression conditions or findings.
    // Oversized critical summaries block before a model call, with a detail path.
    if (typeof result.summary === 'string' && result.summary.length > SUMMARY_LIMIT)
      throw new Error(`Handoff summary exceeds ${SUMMARY_LIMIT} characters; reconcile ${details}.`);
    results[stage] = {
      summary: result.summary,
      approved: result.approved,
      failed: result.failed,
      blocked: result.blocked,
    };
  }
  const handoff = {
    role,
    baseSha: job.baseSha,
    changedPaths: paths,
    latestResults: results,
    latestChecks: (job.results.ci?.checks || []).map(({ name, conclusion, state, detailsUrl }) => ({
      name,
      conclusion,
      state,
      detailsUrl,
    })),
    failureConditions: failureConditions(job.results.ci?.logs || []),
    review,
    error: job.error,
    latestFailure: job.latestFailure,
    details,
    omitted:
      'Full logs, hash dictionaries, prior runs and diagnostic history omitted; read safe local details if needed. Do not read credentials or sensitive paths.',
  };
  if (JSON.stringify(handoff.failureConditions).length > SUMMARY_LIMIT)
    throw new Error(
      `CI failure conditions exceed ${SUMMARY_LIMIT} characters; reconcile ${details}.`,
    );
  const text = JSON.stringify(redact(handoff));
  if (text.length > HANDOFF_LIMIT)
    throw new Error(`Handoff exceeds ${HANDOFF_LIMIT} characters; reconcile ${details}.`);
  return text;
}

export async function databaseProbe(directory) {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Database requires dedicated TEST_DATABASE_URL.');
  const require = createRequire(path.join(directory, 'package.json'));
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });
  try {
    await client.connect();
    const result = await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('brands','machines','workouts','sets','goals')`);
    const tables = new Set(result.rows.map((row) => row.table_name));
    if (['brands', 'machines', 'workouts', 'sets', 'goals'].some((name) => !tables.has(name)))
      throw new Error('Database required schema missing.');
    const columns =
      await client.query(`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('brands','machines','workouts','sets','goals')`);
    const available = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const requiredColumns = {
      brands: ['id', 'name'],
      machines: ['id', 'brand_id', 'name', 'base_weight', 'notes'],
      workouts: ['id', 'date', 'title', 'notes', 'created_at'],
      sets: ['id', 'workout_id', 'exercise', 'machine_id', 'weight', 'reps', 'position', 'notes'],
      goals: ['id', 'exercise', 'target_weight', 'target_reps', 'start_date', 'deadline'],
    };
    if (
      Object.entries(requiredColumns).some(([table, names]) =>
        names.some((name) => !available.has(`${table}.${name}`)),
      )
    )
      throw new Error('Database required schema columns missing.');
    return { connected: true, schema: true };
  } finally {
    await client.end();
  }
}

export async function preflight({
  job,
  directory,
  command,
  npmCommand,
  codexCommand,
  lock,
  browserExecutable,
  browserCheckArgs,
  checkDependencies = true,
}) {
  const record = { at: new Date().toISOString(), ready: false, kind: 'environment', checks: {} };
  try {
    record.checks.node = await command(process.execPath, ['--version'], { cwd: directory });
    record.checks.git = await command(
      process.platform === 'win32' ? 'git.exe' : 'git',
      ['--version'],
      { cwd: directory },
    );
    const [npm, npmPrefix] = npmCommand();
    record.checks.npm = await command(npm, [...npmPrefix, '--version'], { cwd: directory });
    const [codex, prefix] = codexCommand();
    record.checks.codex = await command(codex, [...prefix, '--version'], { cwd: directory });
    if (lock && fs.readFileSync(lock, 'utf8') !== String(process.pid))
      throw new Error('Worker lock ownership changed.');
    record.checks.lock = lock ? 'owned' : 'independent diagnostic lock';
    for (const name of checkDependencies
      ? ['package.json', 'package-lock.json', 'node_modules']
      : []) {
      const file = path.join(directory, name);
      if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink())
        throw new Error(`Dependencies not ready: ${name}. Coordinator must prepare dependencies.`);
    }
    record.checks.dependencies = checkDependencies
      ? 'present; no installation attempted'
      : 'not required for tool-only smoke';
    const required = requirements(job);
    record.checks.database = required.database
      ? await databaseProbe(directory)
      : { required: false };
    if (required.browser) {
      if (!browserExecutable) throw new Error('Required browser executable is not configured.');
      if (
        !Array.isArray(browserCheckArgs) ||
        !browserCheckArgs.length ||
        browserCheckArgs.some((arg) => typeof arg !== 'string')
      )
        throw new Error(
          'Required browserCheckArgs must specify the completion validation command.',
        );
      record.checks.browser = await command(browserExecutable, ['--version'], { cwd: directory });
    } else record.checks.browser = { required: false };
    record.ready = true;
  } catch (error) {
    record.error = redact(error.message);
  }
  return record;
}

export function fileSnapshot(directory, names) {
  return Object.fromEntries(
    names
      .filter((name) => !sensitivePath(name))
      .map((name) => {
        const file = path.resolve(directory, name);
        const relative = path.relative(directory, file);
        if (relative.startsWith('..') || path.isAbsolute(relative))
          throw new Error('Unsafe snapshot path.');
        if (!fs.existsSync(file)) return [name, null];
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink requires inspection.');
        return [name, createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
      }),
  );
}

export function reviewPlan(job, current) {
  const previous = job.reviewSnapshot;
  if (
    !previous ||
    previous.requirements !== digest(job.issue) ||
    previous.baseSha !== job.baseSha ||
    previous.branch !== job.branch ||
    job.reviewRole === 'highRiskReview'
  )
    return { mode: 'full', reason: 'First review or changed requirements/base.' };
  const delta = [...new Set([...Object.keys(previous.files), ...Object.keys(current)])].filter(
    (name) => previous.files[name] !== current[name],
  );
  const expanded = delta.some((name) => !previous.scope?.includes(name));
  const security = delta.some((name) =>
    /auth|security|permission|infra|migration|agents|package|\.github/i.test(name),
  );
  return expanded || security
    ? { mode: 'full', reason: 'Expanded scope or security impact.', delta }
    : {
        mode: 'delta',
        delta,
        instruction:
          'Prioritize unresolved findings and delta. Confirm ALL acceptance criteria and the complete final diff before approval. If semantic scope expanded or security impact exists, perform a full review before approval.',
      };
}

export function eventUsage(output) {
  const usage = [];
  for (const line of output.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'turn.completed' && event.usage) {
        const values = {};
        for (const name of ['input_tokens', 'cached_input_tokens', 'output_tokens'])
          if (Number.isSafeInteger(event.usage[name]) && event.usage[name] >= 0)
            values[name] = event.usage[name];
        usage.push(values);
      }
    } catch {
      /* CLI text */
    }
  }
  return usage;
}
