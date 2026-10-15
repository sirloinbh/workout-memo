import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
// Hosted Windows runners can take over 20 seconds to start the first PowerShell process.
// Keep a bounded startup allowance without retrying or changing behavior assertions.
const processTimeoutMs = 60000;
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'workout-gh-test-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const capture = join(bin, 'capture.mjs');
  writeFileSync(
    capture,
    `const fs=await import('node:fs');const out={args:process.argv.slice(2),config:process.env.GH_CONFIG_DIR??null,ghToken:!!process.env.GH_TOKEN,githubToken:!!process.env.GITHUB_TOKEN,pinned:process.env.GH_TOKEN==="dummy-project-token",codex:process.env.CODEX_HOME??null};if(process.env.TEST_CAPTURE)fs.writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(out));else console.log(JSON.stringify(out));process.exit(Number(process.env.TEST_EXIT??0));`,
  );
  for (const name of ['gh', 'code'])
    writeFileSync(
      join(bin, name + '.cmd'),
      `@echo off\r\n${name === 'gh' ? 'if "%~1 %~2"=="auth token" (if not "%~5 %~6"=="--user sirloinbh" exit /b 19\r\nif defined GH_TOKEN exit /b 23\r\nif defined GITHUB_TOKEN exit /b 24\r\nif defined TEST_TOKEN_FAIL (exit /b 1) else (echo dummy-project-token& exit /b 0))\r\n' : ''}"${process.execPath}" "%~dp0capture.mjs" %*\r\nexit /b %errorlevel%\r\n`,
    );
  return {
    dir,
    env: {
      ...process.env,
      PATH: bin + delimiter + process.env.PATH,
      LOCALAPPDATA: join(dir, 'appdata'),
      APPDATA: join(dir, 'roaming'),
      USERPROFILE: join(dir, 'user'),
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
test(
  'account B launcher opens this project with company gh and personal Codex',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = spawnSync('cmd.exe', ['/d', '/c', resolve('scripts/open-vscode-account-b.cmd')], {
        env: f.env,
        encoding: 'utf8',
        timeout: processTimeoutMs,
      });
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, join(f.env.APPDATA, 'GitHub CLI'));
      assert.equal(got.ghToken, false);
      assert.equal(got.pinned, false);
      assert.equal(got.githubToken, false);
      assert.equal(got.codex, join(f.env.LOCALAPPDATA, 'Codex-Account-B'));
      assert.equal(got.args[1], join(f.env.LOCALAPPDATA, 'VSCode-Account-B-workout-memo'));
      assert.equal(got.args.at(-1), process.cwd());
    } finally {
      f.cleanup();
    }
  },
);
test(
  'account B launcher preserves another project authentication environment',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const other = join(f.dir, 'another-project');
      mkdirSync(other);
      const r = spawnSync(
        'cmd.exe',
        ['/d', '/c', resolve('scripts/open-vscode-account-b.cmd'), other],
        { env: f.env, encoding: 'utf8', timeout: processTimeoutMs },
      );
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, f.env.GH_CONFIG_DIR);
      assert.equal(got.ghToken, true);
      assert.equal(got.githubToken, true);
      assert.equal(got.args.at(-1), other);
      assert.equal(got.args[1], join(f.env.LOCALAPPDATA, 'VSCode-Account-B'));
    } finally {
      f.cleanup();
    }
  },
);

test('project gh restores the calling PowerShell environment', { skip: !windows }, () => {
  const f = fixture();
  try {
    const wrapper = resolve('scripts/gh-project.ps1').replaceAll("'", "''");
    const harness = join(f.dir, 'restore.ps1');
    writeFileSync(
      harness,
      `
$beforeConfig=$env:GH_CONFIG_DIR
$beforeGh=$env:GH_TOKEN
$beforeGithub=$env:GITHUB_TOKEN
$result=& '${wrapper}' api user
$status=$LASTEXITCODE
@{status=$status;restored=($env:GH_CONFIG_DIR -eq $beforeConfig -and $env:GH_TOKEN -eq $beforeGh -and $env:GITHUB_TOKEN -eq $beforeGithub);result=($result | ConvertFrom-Json)} | ConvertTo-Json -Depth 5
`,
    );
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
      { env: f.env, encoding: 'utf8', timeout: processTimeoutMs },
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

test(
  'profile-free project terminal separates company gh and personal ghp',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const installed = join(f.env.LOCALAPPDATA, 'gh-workout-memo');
      mkdirSync(installed, { recursive: true });
      writeFileSync(
        join(installed, 'gh-project.ps1'),
        readFileSync(resolve('scripts/gh-project.ps1')),
      );
      const init = resolve('scripts/project-terminal.ps1').replaceAll("'", "''");
      const harness = join(f.dir, 'terminal.ps1');
      writeFileSync(
        harness,
        `
. '${init}'
$company = gh api user --jq .login | ConvertFrom-Json
$personal = ghp api user --jq .login | ConvertFrom-Json
$after = gh api user --jq .login | ConvertFrom-Json
@{company=$company;personal=$personal;after=$after;ghFunction=[bool](Get-Command gh -CommandType Function -ErrorAction SilentlyContinue);ghpFunction=[bool](Get-Command ghp -CommandType Function -ErrorAction SilentlyContinue)} | ConvertTo-Json -Depth 5
`,
      );
      const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
        { env: f.env, encoding: 'utf8', timeout: processTimeoutMs },
      );
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.ghFunction, false);
      assert.equal(got.ghpFunction, true);
      for (const company of [got.company, got.after]) {
        assert.equal(company.config, join(f.env.APPDATA, 'GitHub CLI'));
        assert.equal(company.ghToken, false);
        assert.equal(company.githubToken, false);
        assert.equal(company.codex, join(f.env.LOCALAPPDATA, 'Codex-Account-B'));
        assert.deepEqual(company.args, ['api', 'user', '--jq', '.login']);
      }
      assert.equal(got.personal.config, join(f.env.USERPROFILE, '.config', 'gh-personal'));
      assert.equal(got.personal.pinned, true);
      assert.equal(got.personal.githubToken, false);
      assert.deepEqual(got.personal.args, ['api', 'user', '--jq', '.login']);
    } finally {
      f.cleanup();
    }
  },
);

test('VS Code terminal settings select company gh and personal Codex', () => {
  const settings = JSON.parse(readFileSync(resolve('.vscode/settings.json'), 'utf8'));
  const env = settings['terminal.integrated.env.windows'];
  assert.equal(env.GH_CONFIG_DIR, '${env:APPDATA}\\GitHub CLI');
  assert.equal(env.GH_TOKEN, null);
  assert.equal(env.GITHUB_TOKEN, null);
  assert.equal(env.CODEX_HOME, '${env:LOCALAPPDATA}\\Codex-Account-B');
  assert.ok(
    settings['terminal.integrated.profiles.windows']['Workout Memo PowerShell'].args.includes(
      '${env:LOCALAPPDATA}\\gh-workout-memo\\project-terminal.ps1',
    ),
  );
});

test(
  'project launcher needs no personal GitHub login and propagates code failure',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = spawnSync(
        'cmd.exe',
        ['/d', '/c', resolve('scripts/open-vscode-account-b.cmd'), process.cwd()],
        {
          env: { ...f.env, TEST_TOKEN_FAIL: '1', TEST_EXIT: '17' },
          encoding: 'utf8',
          timeout: processTimeoutMs,
        },
      );
      assert.ifError(r.error);
      assert.equal(r.status, 17, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, join(f.env.APPDATA, 'GitHub CLI'));
      assert.equal(got.ghToken, false);
      assert.equal(got.githubToken, false);
      assert.equal(got.codex, join(f.env.LOCALAPPDATA, 'Codex-Account-B'));
      assert.equal(got.args.at(-1), process.cwd());
    } finally {
      f.cleanup();
    }
  },
);

test(
  'launcher preserves another project even with the previous project GitHub config',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const other = join(f.dir, 'other project');
      mkdirSync(other);
      const config = join(f.env.LOCALAPPDATA, 'gh-workout-memo');
      const harness = join(f.dir, 'other-project.cmd');
      writeFileSync(
        harness,
        `@echo off\r\ncall "${resolve('scripts/open-vscode-account-b.cmd')}" "${other}"\r\nexit /b %errorlevel%\r\n`,
      );
      const r = spawnSync('cmd.exe', ['/d', '/c', harness], {
        env: { ...f.env, GH_CONFIG_DIR: config },
        encoding: 'utf8',
        timeout: processTimeoutMs,
      });
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, config);
      assert.equal(got.ghToken, true);
      assert.equal(got.githubToken, true);
      assert.equal(got.args.at(-1), other);
    } finally {
      f.cleanup();
    }
  },
);

for (const mode of ['command failure', 'missing personal account']) {
  test(`project wrapper restores parent environment after ${mode}`, { skip: !windows }, () => {
    const f = fixture();
    try {
      const wrapper = resolve('scripts/gh-project.ps1').replaceAll("'", "''");
      const harness = join(f.dir, 'restore-failure.ps1');
      writeFileSync(
        harness,
        `
$beforeConfig=$env:GH_CONFIG_DIR
$beforeGh=$env:GH_TOKEN
$beforeGithub=$env:GITHUB_TOKEN
$beforeCodex=$env:CODEX_HOME
$failed=$false
try { $result=& '${wrapper}' api user; $status=$LASTEXITCODE } catch { $failed=$true; $status=1 }
@{status=$status;failed=$failed;restored=($env:GH_CONFIG_DIR -eq $beforeConfig -and $env:GH_TOKEN -eq $beforeGh -and $env:GITHUB_TOKEN -eq $beforeGithub -and $env:CODEX_HOME -eq $beforeCodex)} | ConvertTo-Json
`,
      );
      const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
        {
          env: {
            ...f.env,
            ...(mode === 'command failure' ? { TEST_EXIT: '17' } : { TEST_TOKEN_FAIL: '1' }),
          },
          encoding: 'utf8',
          timeout: processTimeoutMs,
        },
      );
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.restored, true);
      assert.equal(got.status, mode === 'command failure' ? 17 : 1);
      assert.equal(got.failed, mode === 'missing personal account');
    } finally {
      f.cleanup();
    }
  });
}

test(
  'ghp preserves spaced arguments, exit code and terminal environment after failure',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const installed = join(f.env.LOCALAPPDATA, 'gh-workout-memo');
      mkdirSync(installed, { recursive: true });
      writeFileSync(
        join(installed, 'gh-project.ps1'),
        readFileSync(resolve('scripts/gh-project.ps1')),
      );
      const init = resolve('scripts/project-terminal.ps1').replaceAll("'", "''");
      const harness = join(f.dir, 'ghp-failure.ps1');
      writeFileSync(
        harness,
        `
$ErrorActionPreference='Stop'
. '${init}'
$personal=ghp api user --jq '.login + suffix' | ConvertFrom-Json
$status=$LASTEXITCODE
@{status=$status;personal=$personal;config=$env:GH_CONFIG_DIR;ghToken=[bool]$env:GH_TOKEN;githubToken=[bool]$env:GITHUB_TOKEN;codex=$env:CODEX_HOME} | ConvertTo-Json -Depth 5
`,
      );
      const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
        {
          env: { ...f.env, TEST_EXIT: '17' },
          encoding: 'utf8',
          timeout: processTimeoutMs,
        },
      );
      assert.ifError(r.error);
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.status, 17);
      assert.deepEqual(got.personal.args, ['api', 'user', '--jq', '.login + suffix']);
      assert.equal(got.config, join(f.env.APPDATA, 'GitHub CLI'));
      assert.equal(got.ghToken, false);
      assert.equal(got.githubToken, false);
      assert.equal(got.codex, join(f.env.LOCALAPPDATA, 'Codex-Account-B'));
    } finally {
      f.cleanup();
    }
  },
);
