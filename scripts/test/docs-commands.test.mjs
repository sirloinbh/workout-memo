// #55: Windows PowerShell 5.1 re-encodes text piped to or captured from native programs
// (ASCII out, console code page in), which corrupted Korean SQL and backups. Command
// examples in PowerShell blocks must use files (`psql -f`, `docker compose cp`) instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Past change records and daily notes quote the old commands as history.
const skipped = ['node_modules', '.git', '.local', 'docs/changes', 'docs/daily'];

function markdownFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (skipped.some((s) => rel === s || rel.startsWith(s + '/'))) return [];
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [rel] : [];
  });
}

// Lines inside ```powershell / ```ps1 fences.
export function powershellLines(markdown) {
  const lines = [];
  let inside = false;
  for (const [i, line] of markdown.split(/\r?\n/).entries()) {
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      inside = !inside && /^(powershell|ps1|pwsh)$/i.test(fence[1]);
      continue;
    }
    if (inside) lines.push({ number: i + 1, text: line });
  }
  return lines;
}

// A pipe into a native database/container command, or reading a file into such a pipe.
export const unsafe = (line) =>
  /\|\s*(docker|psql|pg_restore)\b/.test(line) || /Get-Content[^|]*\|\s*(docker|psql)/.test(line);

test('PowerShell command examples never pipe text into docker or psql', () => {
  const problems = [];
  for (const file of markdownFiles()) {
    const markdown = fs.readFileSync(path.join(root, file), 'utf8');
    for (const { number, text } of powershellLines(markdown))
      if (unsafe(text)) problems.push(`${file}:${number}: ${text.trim()}`);
  }
  assert.deepEqual(problems, []);
});

test('the check catches the old pattern and allows file-based commands', () => {
  const sample = [
    '```powershell',
    'Get-Content -Raw -Encoding UTF8 database/migrations/001_initial.sql | docker compose exec -T db psql -U workout -d workout',
    'docker compose exec -T db psql -U workout -d workout -f /docker-entrypoint-initdb.d/001_initial.sql',
    'docker compose cp backups/FILE.sql db:/tmp/restore.sql',
    'npm run db:migrate | Select-Object -Last 1',
    '```',
    '```bash',
    'gunzip -c dump.sql.gz | docker compose exec -T db psql',
    '```',
  ].join('\n');
  const flagged = powershellLines(sample)
    .filter((l) => unsafe(l.text))
    .map((l) => l.number);
  assert.deepEqual(flagged, [2]);
});

test('backup.ps1 copies the dump file instead of capturing pg_dump output', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/backup.ps1'), 'utf8');
  assert.match(script, /pg_dump[^\n]*-f /);
  assert.match(script, /docker compose cp /);
  assert.doesNotMatch(script, /=\s*&\s*docker[^\n]*pg_dump/);
  // Windows PowerShell 5.1 reads a BOM-less script as ANSI: keep it ASCII.
  assert.ok(
    [...script].every((ch) => ch.charCodeAt(0) < 128),
    'backup.ps1 is ASCII only',
  );
});
