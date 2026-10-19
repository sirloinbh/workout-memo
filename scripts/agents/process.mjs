import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { commandFailureKind } from './failure.mjs';

// No shell: prompts, issue bodies and filenames never become shell source.
export function command(
  executable,
  args,
  { cwd, env = process.env, input, log, onThread, onUsage, timeout = 30 * 60 * 1000 } = {},
) {
  return new Promise((resolve, reject) => {
    const stream = log ? fs.createWriteStream(log, { flags: 'a', mode: 0o600 }) : null;
    const secret = env.TEST_DATABASE_URL;
    const redact = (value) =>
      secret ? value.replaceAll(secret, '[REDACTED_TEST_DATABASE_URL]') : value;
    // Keep an overlap so a connection string split across pipe chunks cannot leak.
    const logger = () => {
      const decoder = new StringDecoder('utf8');
      let pending = '';
      return (data, end = false) => {
        pending += end ? decoder.end() : decoder.write(data);
        const keep = end ? 0 : (secret?.length || 1) - 1;
        let boundary = Math.max(0, pending.length - keep);
        if (secret) {
          const start = pending.lastIndexOf(secret, boundary);
          if (start >= 0 && start + secret.length > boundary) boundary = start;
        }
        stream?.write(redact(pending.slice(0, boundary)));
        pending = pending.slice(boundary);
      };
    };
    const stdoutLog = logger(),
      stderrLog = logger();
    const child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const capture = () => ({ head: '', tail: '', length: 0, decoder: new StringDecoder('utf8') });
    const stdoutCapture = capture(),
      stderrCapture = capture();
    const append = (target, data, end = false) => {
      const value = end ? target.decoder.end() : target.decoder.write(data);
      target.length += value.length;
      target.head = (target.head + value).slice(0, 2 * 1024 * 1024);
      target.tail = (target.tail + value).slice(-4 * 1024 * 1024);
    };
    const excerpt = (name, target) => {
      if (!target.length) return '';
      // Redact before shortening: a secret crossing an excerpt boundary must not leak.
      const head = redact(target.head),
        tail = redact(target.tail);
      if (target.length <= 1200) return `${head} [${name}]`;
      const omitted = target.length - 1200;
      return `${head.slice(0, 600)}\n[truncated: ${name}, ${omitted} source characters omitted]\n${tail.slice(-600)}`;
    };
    const decoder = new StringDecoder('utf8');
    let events = '',
      threadId = null;
    const captureEvents = (data, end = false) => {
      events += end ? decoder.end() : decoder.write(data);
      const lines = events.split('\n');
      events = end ? '' : lines.pop();
      for (const line of lines) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
          threadId = redact(event.thread_id);
          onThread?.(threadId);
        }
        if (event.type === 'turn.completed' && event.usage) onUsage?.(event.usage);
      }
    };
    const failure = (message) =>
      Object.assign(new Error(message), { threadId, failureKind: commandFailureKind({ message }) });
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => child.kill());
        killer.on('close', (code) => {
          if (code !== 0) child.kill();
        });
      } else child.kill();
      captureEvents(null, true);
      reject(failure(`${executable} timed out; inspect the worktree before retrying.`));
    }, timeout);
    child.stdout.on('data', (data) => {
      append(stdoutCapture, data);
      stdoutLog(data);
      captureEvents(data);
    });
    child.stderr.on('data', (data) => {
      append(stderrCapture, data);
      stderrLog(data);
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      stdoutLog(null, true);
      stderrLog(null, true);
      stream?.end();
      reject(Object.assign(error, { failureKind: 'environment' }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      captureEvents(null, true);
      stdoutLog(null, true);
      stderrLog(null, true);
      stream?.end();
      append(stdoutCapture, null, true);
      append(stderrCapture, null, true);
      const stdout = stdoutCapture.tail,
        stderr = stderrCapture.tail;
      if (code !== 0)
        reject(
          Object.assign(
            failure(
              `${executable} exited ${code}: ${[excerpt('stderr', stderrCapture), excerpt('stdout', stdoutCapture)].filter(Boolean).join('\n')}\n${
                log
                  ? `Full redacted output: ${redact(log)}`
                  : 'Full output was not logged; rerun with a local log to inspect omitted details.'
              }`,
            ),
            {
              failureKind: commandFailureKind({
                message: `${stderrCapture.head}\n${stderr}\n${stdoutCapture.head}\n${stdout}`,
              }),
              exitCode: code,
            },
          ),
        );
      else resolve(redact(stdout).trim());
    });
    child.stdin.end(input);
  });
}
