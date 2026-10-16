import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

// No shell: prompts, issue bodies and filenames never become shell source.
export function command(
  executable,
  args,
  { cwd, env = process.env, input, log, onThread, timeout = 30 * 60 * 1000 } = {},
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
    let stdout = '',
      stderr = '';
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
      }
    };
    const failure = (message) => Object.assign(new Error(message), { threadId });
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
      stdout = (stdout + data).slice(-4 * 1024 * 1024);
      stdoutLog(data);
      captureEvents(data);
    });
    child.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-4 * 1024 * 1024);
      stderrLog(data);
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      stdoutLog(null, true);
      stderrLog(null, true);
      stream?.end();
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      captureEvents(null, true);
      stdoutLog(null, true);
      stderrLog(null, true);
      stream?.end();
      if (code !== 0)
        reject(failure(`${executable} exited ${code}: ${redact(stderr).slice(-2000)}`));
      else resolve(redact(stdout).trim());
    });
    child.stdin.end(input);
  });
}
