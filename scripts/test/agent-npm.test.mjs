import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { npmCommand } from '../agents/npm.mjs';
import { command } from '../agents/process.mjs';

for (const platform of ['linux', 'win32']) {
  test(`explicit npm CLI is executed with Node on ${platform}`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-npm-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const cli = path.join(root, 'custom npm.cjs');
    fs.writeFileSync(cli, 'console.log(JSON.stringify(process.argv.slice(2)))', 'utf8');
    const [bin, prefix] = npmCommand({ npmCli: cli }, platform);
    assert.equal(bin, process.execPath);
    assert.deepEqual(prefix, [cli]);
    assert.deepEqual(JSON.parse(await command(bin, [...prefix, 'run', 'check'])), ['run', 'check']);
    assert.throws(
      () => npmCommand({ npmCli: path.join(root, 'missing.cjs') }, platform),
      /Set npmCli/,
      'an invalid explicit CLI must fail instead of silently selecting PATH npm',
    );
  });
}

test('unconfigured POSIX npm keeps PATH lookup and Windows keeps the adjacent CLI', (t) => {
  assert.deepEqual(npmCommand({}, 'linux'), ['npm', []]);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-npm-default-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const node = path.join(root, 'node.exe');
  const adjacent = path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js');
  assert.throws(() => npmCommand({}, 'win32', node), /Set npmCli/);
  fs.mkdirSync(path.dirname(adjacent), { recursive: true });
  fs.writeFileSync(adjacent, '', 'utf8');
  assert.deepEqual(npmCommand({}, 'win32', node), [node, [adjacent]]);
});
