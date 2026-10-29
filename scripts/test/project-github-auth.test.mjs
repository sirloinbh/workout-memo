import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { test } from 'node:test';

const windows = process.platform === 'win32';
// Hosted Windows runners can take over 20 seconds to start the first PowerShell process.
// Keep a bounded startup allowance without retrying or changing behavior assertions.
const processTimeoutMs = 60000;
// Harness scripts never embed the checkout path. Windows PowerShell 5.1 reads a
// BOM-less .ps1 as the system ANSI code page, and cmd.exe treats a UTF-8 BOM as a
// command instead of skipping it, so a non-ASCII checkout path breaks either
// interpreter. The paths travel through the environment, which stays UTF-16 end to
// end, and the harness bodies stay ASCII-only.
const harnesses = {
  restore: `
$beforeConfig=$env:GH_CONFIG_DIR
$beforeGh=$env:GH_TOKEN
$beforeGithub=$env:GITHUB_TOKEN
$result=& $env:TEST_WRAPPER api user
$status=$LASTEXITCODE
@{status=$status;restored=($env:GH_CONFIG_DIR -eq $beforeConfig -and $env:GH_TOKEN -eq $beforeGh -and $env:GITHUB_TOKEN -eq $beforeGithub);result=($result | ConvertFrom-Json)} | ConvertTo-Json -Depth 5
`,
  restoreFailure: `
$beforeConfig=$env:GH_CONFIG_DIR
$beforeGh=$env:GH_TOKEN
$beforeGithub=$env:GITHUB_TOKEN
$beforeCodex=$env:CODEX_HOME
$failed=$false
try { $result=& $env:TEST_WRAPPER api user; $status=$LASTEXITCODE } catch { $failed=$true; $status=1 }
@{status=$status;failed=$failed;restored=($env:GH_CONFIG_DIR -eq $beforeConfig -and $env:GH_TOKEN -eq $beforeGh -and $env:GITHUB_TOKEN -eq $beforeGithub -and $env:CODEX_HOME -eq $beforeCodex)} | ConvertTo-Json
`,
};
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'workout-gh-test-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const home = join(dir, 'home');
  mkdirSync(home);
  const capture = join(bin, 'capture.mjs');
  writeFileSync(
    capture,
    `const fs=await import('node:fs');const out={args:process.argv.slice(2),config:process.env.GH_CONFIG_DIR??null,ghToken:!!process.env.GH_TOKEN,githubToken:!!process.env.GITHUB_TOKEN,pinned:process.env.GH_TOKEN==="dummy-project-token",codex:process.env.CODEX_HOME??null};if(process.env.TEST_CAPTURE)fs.writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(out));else console.log(JSON.stringify(out));process.exit(Number(process.env.TEST_EXIT??0));`,
  );
  for (const name of ['gh'])
    writeFileSync(
      join(bin, name + '.cmd'),
      `@echo off\r\n${name === 'gh' ? 'if "%~1 %~2"=="auth token" (if not "%~5 %~6"=="--user sirloinbh" exit /b 19\r\nif defined GH_TOKEN exit /b 23\r\nif defined GITHUB_TOKEN exit /b 24\r\nif defined TEST_TOKEN_FAIL (exit /b 1) else (echo dummy-project-token& exit /b 0))\r\n' : ''}"${process.execPath}" "%~dp0capture.mjs" %*\r\nexit /b %errorlevel%\r\n`,
    );
  return {
    dir,
    env: {
      ...process.env,
      HOME: home,
      PATH: bin + delimiter + process.env.PATH,
      LOCALAPPDATA: join(dir, 'appdata'),
      APPDATA: join(dir, 'roaming'),
      USERPROFILE: home,
      CODEX_HOME: join(dir, 'original-codex'),
      GH_CONFIG_DIR: join(dir, 'original-gh'),
      GH_TOKEN: 'dummy-gh-token',
      GITHUB_TOKEN: 'dummy-github-token',
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
function runGh(f, args = [], extra = {}) {
  return spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resolve('scripts/gh-project.ps1'),
      ...args,
    ],
    { env: { ...f.env, ...extra }, encoding: 'utf8', timeout: processTimeoutMs },
  );
}
test(
  'project gh selects its config, clears inherited tokens and preserves arguments',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = runGh(f, ['api', 'user', '--jq', '.login']);
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, join(f.env.USERPROFILE, '.config', 'gh-personal'));
      assert.equal(got.ghToken, true);
      assert.equal(got.pinned, true);
      assert.equal(got.githubToken, false);
      assert.deepEqual(got.args, ['api', 'user', '--jq', '.login']);
      assert.equal(f.env.GH_TOKEN, 'dummy-gh-token');
    } finally {
      f.cleanup();
    }
  },
);
test('project gh propagates command failures', { skip: !windows }, () => {
  const f = fixture();
  try {
    const r = runGh(f, ['api', 'user'], { TEST_EXIT: '17' });
    assert.ifError(r.error);
    assert.equal(r.status, 17, r.stderr);
  } finally {
    f.cleanup();
  }
});
test('project gh forwards Git credential requests through stdin', { skip: !windows }, () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.dir, 'bin', 'capture.mjs'),
      `let input='';for await(const chunk of process.stdin)input+=chunk;console.log(JSON.stringify({input,args:process.argv.slice(2)}));`,
    );
    const r = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('scripts/gh-project.ps1'),
        'auth',
        'git-credential',
        'get',
      ],
      {
        env: f.env,
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8',
        timeout: processTimeoutMs,
      },
    );
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout.trim());
    assert.match(got.input, /host=github.com/);
    assert.deepEqual(got.args, ['auth', 'git-credential', 'get']);
  } finally {
    f.cleanup();
  }
});

test('project gh restores the calling PowerShell environment', { skip: !windows }, () => {
  const f = fixture();
  try {
    const harness = join(f.dir, 'restore.ps1');
    writeFileSync(harness, harnesses.restore);
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
      {
        env: { ...f.env, TEST_WRAPPER: resolve('scripts/gh-project.ps1') },
        encoding: 'utf8',
        timeout: processTimeoutMs,
      },
    );
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout.trim());
    assert.equal(got.status, 0);
    assert.equal(got.restored, true);
    assert.equal(got.result.ghToken, true);
    assert.equal(got.result.pinned, true);
    assert.equal(got.result.githubToken, false);
  } finally {
    f.cleanup();
  }
});

test(
  'project gh refuses to use another account when sirloinbh is unavailable',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = runGh(f, ['api', 'user'], { TEST_TOKEN_FAIL: '1' });
      assert.ifError(r.error);
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout.trim(), '');
      assert.match(r.stderr, /sirloinbh/);
    } finally {
      f.cleanup();
    }
  },
);

test('harness scripts stay ASCII-only so a non-ASCII checkout path still runs them', () => {
  const checkout = resolve('.');
  for (const [name, body] of Object.entries(harnesses)) {
    const nonAscii = [...body].find((character) => character.codePointAt(0) > 0x7f);
    assert.equal(nonAscii, undefined, name + ' harness must stay ASCII-only');
    assert.ok(!body.includes(checkout), name + ' harness must not embed the checkout path');
    assert.match(
      body,
      /%TEST_(LAUNCHER|OTHER_PROJECT)%|\$env:TEST_(WRAPPER|TERMINAL_INIT)\b/,
      name + ' harness must read its paths from the environment',
    );
  }
  // Inline harness templates would bypass the checks above, so every harness write
  // must come from the shared constant.
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  // Prettier wraps long calls, so the arguments may span several lines.
  const writes = [...source.matchAll(/writeFileSync\(\s*harness\s*,\s*([\s\S]*?)\s*,?\s*\);/g)].map(
    (match) => match[1],
  );
  assert.ok(writes.length >= Object.keys(harnesses).length, 'harness writes were not found');
  for (const content of writes) {
    assert.match(content, /^harnesses\.\w+$/, 'harness content must come from harnesses');
  }
});

for (const mode of ['command failure', 'missing personal account', 'unset parent']) {
  test(`project wrapper restores parent environment after ${mode}`, { skip: !windows }, () => {
    const f = fixture();
    try {
      const harness = join(f.dir, 'restore-failure.ps1');
      writeFileSync(harness, harnesses.restoreFailure);
      const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
        {
          env: {
            ...f.env,
            TEST_WRAPPER: resolve('scripts/gh-project.ps1'),
            ...(mode === 'command failure'
              ? { TEST_EXIT: '17' }
              : mode === 'missing personal account'
                ? { TEST_TOKEN_FAIL: '1' }
                : { GH_CONFIG_DIR: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined }),
          },
          encoding: 'utf8',
          timeout: processTimeoutMs,
        },
      );
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.restored, true);
      assert.equal(
        got.status,
        mode === 'command failure' ? 17 : mode === 'missing personal account' ? 1 : 0,
      );
      assert.equal(got.failed, mode === 'missing personal account');
    } finally {
      f.cleanup();
    }
  });
}
