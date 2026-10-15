import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { redact } from './security.mjs';

export function fingerprintFiles(directory, names) {
  const hash = createHash('sha256');
  for (const name of [...new Set(names)].sort()) {
    const file = path.resolve(directory, name);
    const relative = path.relative(directory, file);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('File is outside the worktree.');
    hash.update(name + '\0');
    if (!fs.existsSync(file)) hash.update('deleted\0');
    else {
      if (fs.lstatSync(file).isSymbolicLink())
        throw new Error(`Symlink requires manual inspection: ${name}`);
      hash.update(fs.readFileSync(file));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

export function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(redact(value), null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function readJson(file) {
  return redact(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
}

export function listJobs(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((id) => /^\d+$/.test(id))
    .flatMap((id) => {
      try {
        return [readJson(path.join(directory, id, 'job.json'))];
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    });
}

export function acquireLock(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'worker.lock');
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = Number(fs.readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(owner) || owner < 1)
      throw new Error('Invalid worker lock; inspect it manually.', { cause: error });
    try {
      process.kill(owner, 0);
    } catch (lookupError) {
      if (lookupError.code !== 'ESRCH') throw lookupError;
      const recovery = `${file}.recovery`;
      let handle;
      try {
        handle = fs.openSync(recovery, 'wx');
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === String(owner))
          fs.unlinkSync(file);
      } finally {
        if (handle !== undefined) {
          fs.closeSync(handle);
          fs.unlinkSync(recovery);
        }
      }
      return acquireLock(directory);
    }
    throw new Error(`Worker already running (PID ${owner}).`, { cause: error });
  }
  return () => {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === String(process.pid))
      fs.unlinkSync(file);
  };
}
