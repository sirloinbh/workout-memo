import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
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
  for (const name of ['gh', 'code'])
    writeFileSync(
      join(bin, name + '.cmd'),
      `@echo off\r\n${name === 'gh' ? 'if "%~1 %~2"=="auth token" (if not "%~5 %~6"=="--user sirloinbh" exit /b 19\r\nif defined TEST_TOKEN_FAIL (exit /b 1) else (echo dummy-project-token& exit /b 0))\r\n' : ''}"${process.execPath}" "%~dp0capture.mjs" %*\r\nexit /b %errorlevel%\r\n`,
    );
  return {
    dir,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PATH: bin + delimiter + process.env.PATH,
      LOCALAPPDATA: join(dir, 'appdata'),
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
    { env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 20000 },
  );
}
test(
  'project gh selects its config, clears inherited tokens and preserves arguments',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = runGh(f, ['api', 'user', '--jq', '.login']);
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
        timeout: 20000,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout.trim());
    assert.match(got.input, /host=github.com/);
    assert.deepEqual(got.args, ['auth', 'git-credential', 'get']);
  } finally {
    f.cleanup();
  }
});
test(
  'account B launcher opens this project with isolated gh environment',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = spawnSync('cmd.exe', ['/d', '/c', resolve('scripts/open-vscode-account-b.cmd')], {
        env: f.env,
        encoding: 'utf8',
        timeout: 20000,
      });
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, join(f.env.USERPROFILE, '.config', 'gh-personal'));
      assert.equal(got.ghToken, true);
      assert.equal(got.pinned, true);
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
        { env: f.env, encoding: 'utf8', timeout: 20000 },
      );
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
      { env: f.env, encoding: 'utf8', timeout: 20000 },
    );
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
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout.trim(), '');
      assert.match(r.stderr, /sirloinbh/);
    } finally {
      f.cleanup();
    }
  },
);

test('project terminal gh command uses the installed account wrapper', { skip: !windows }, () => {
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
    writeFileSync(harness, `. '${init}'\ngh api user --jq .login\n`);
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
      { env: f.env, encoding: 'utf8', timeout: 20000 },
    );
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout.trim());
    assert.equal(got.pinned, true);
    assert.equal(got.config, join(f.env.USERPROFILE, '.config', 'gh-personal'));
    assert.deepEqual(got.args, ['api', 'user', '--jq', '.login']);
  } finally {
    f.cleanup();
  }
});

// VS Code expands these environment placeholders when opening a project terminal.
test('project terminal uses personal authentication and keeps scripts in their install directory', () => {
  const settings = JSON.parse(readFileSync(resolve('.vscode/settings.json'), 'utf8'));
  const env = settings['terminal.integrated.env.windows'];
  assert.equal(
    env.GH_CONFIG_DIR.replaceAll('\\', '/'),
    '$' + '{env:USERPROFILE}/.config/gh-personal',
  );
  assert.equal(env.GH_TOKEN, null);
  assert.equal(env.GITHUB_TOKEN, null);
  const profile = settings['terminal.integrated.profiles.windows']['Workout Memo PowerShell'];
  assert.equal(
    profile.args.at(-1).replaceAll('\\', '/'),
    '$' + '{env:LOCALAPPDATA}/gh-workout-memo/project-terminal.ps1',
  );
});

test(
  'account B launcher selects personal authentication for an explicit project path',
  { skip: !windows },
  () => {
    const f = fixture();
    try {
      const r = spawnSync(
        'cmd.exe',
        ['/d', '/c', resolve('scripts/open-vscode-account-b.cmd'), process.cwd()],
        {
          env: f.env,
          encoding: 'utf8',
          timeout: 20000,
        },
      );
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.config, join(f.env.USERPROFILE, '.config', 'gh-personal'));
      assert.equal(got.pinned, true);
      assert.equal(got.githubToken, false);
      assert.equal(got.args.at(-1), process.cwd());
    } finally {
      f.cleanup();
    }
  },
);

for (const config of ['absent', 'personal']) {
  test(
    'account B launcher preserves another project with ' + config + ' configuration',
    { skip: !windows },
    () => {
      const f = fixture();
      try {
        const other = join(f.dir, 'another-project');
        mkdirSync(other);
        const env = { ...f.env };
        if (config === 'absent') delete env.GH_CONFIG_DIR;
        else env.GH_CONFIG_DIR = join(f.env.USERPROFILE, '.config', 'gh-personal');
        const r = spawnSync(
          'cmd.exe',
          ['/d', '/c', resolve('scripts/open-vscode-account-b.cmd'), other],
          {
            env,
            encoding: 'utf8',
            timeout: 20000,
          },
        );
        assert.equal(r.status, 0, r.stderr);
        const got = JSON.parse(r.stdout.trim());
        assert.equal(got.config, env.GH_CONFIG_DIR ?? null);
        assert.equal(got.pinned, false);
        assert.equal(got.ghToken, true);
        assert.equal(got.githubToken, true);
        assert.equal(got.args.at(-1), other);
      } finally {
        f.cleanup();
      }
    },
  );
}

for (const scenario of ['command-failure', 'missing-account', 'unset-parent']) {
  test('project gh restores its caller after ' + scenario, { skip: !windows }, () => {
    const f = fixture();
    try {
      const env = { ...f.env };
      if (scenario === 'command-failure') env.TEST_EXIT = '17';
      if (scenario === 'missing-account') env.TEST_TOKEN_FAIL = '1';
      if (scenario === 'unset-parent') {
        delete env.GH_CONFIG_DIR;
        delete env.GH_TOKEN;
        delete env.GITHUB_TOKEN;
      }
      const wrapper = resolve('scripts/gh-project.ps1').replaceAll("'", "''");
      const harness = join(f.dir, 'restore-failure.ps1');
      writeFileSync(
        harness,
        `
$beforeConfig=$env:GH_CONFIG_DIR
$beforeGh=$env:GH_TOKEN
$beforeGithub=$env:GITHUB_TOKEN
$failed=$false
try { $null=& '${wrapper}' api user; $status=$LASTEXITCODE } catch { $failed=$true; $status=1 }
@{status=$status;failed=$failed;restored=($env:GH_CONFIG_DIR -eq $beforeConfig -and $env:GH_TOKEN -eq $beforeGh -and $env:GITHUB_TOKEN -eq $beforeGithub)} | ConvertTo-Json
`,
      );
      const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
        {
          env,
          encoding: 'utf8',
          timeout: 20000,
        },
      );
      assert.equal(r.status, 0, r.stderr);
      const got = JSON.parse(r.stdout.trim());
      assert.equal(got.restored, true);
      assert.equal(
        got.status,
        scenario === 'command-failure' ? 17 : scenario === 'missing-account' ? 1 : 0,
      );
      assert.equal(got.failed, scenario === 'missing-account');
    } finally {
      f.cleanup();
    }
  });
}
