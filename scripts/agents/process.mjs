import { spawn } from 'node:child_process';
import fs from 'node:fs';

// No shell: prompts, issue bodies and filenames never become shell source.
export function command(
  executable,
  args,
  { cwd, env = process.env, input, log, timeout = 30 * 60 * 1000 } = {},
) {
  return new Promise((resolve, reject) => {
    const stream = log ? fs.createWriteStream(log, { flags: 'a', mode: 0o600 }) : null;
    const child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
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
      reject(new Error(`${executable} timed out; inspect the worktree before retrying.`));
    }, timeout);
    child.stdout.on('data', (data) => {
      stdout = (stdout + data).slice(-4 * 1024 * 1024);
      stream?.write(data);
    });
    child.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-4 * 1024 * 1024);
      stream?.write(data);
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      stream?.end();
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      stream?.end();
      if (code !== 0) reject(new Error(`${executable} exited ${code}: ${stderr.slice(-2000)}`));
      else resolve(stdout.trim());
    });
    child.stdin.end(input);
  });
}
