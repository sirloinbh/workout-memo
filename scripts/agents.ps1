param(
    [ValidateSet('start', 'stop', 'status', 'doctor', 'smoke', 'enqueue', 'retry', 'accept-requirements', 'cancel')]
    [string]$Action = 'status',
    [int]$Issue = 0
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local/agent-workflow'
$cliPath = Join-Path $projectRoot 'scripts/agents/cli.mjs'
$pinnedNode = Join-Path $projectRoot '.local/node-v24.21.0-win-x64/node.exe'
$nodeExecutable = if (Test-Path -LiteralPath $pinnedNode) { $pinnedNode } else { (Get-Command node.exe -ErrorAction Stop).Source }
if (-not $env:CODEX_HOME) { $env:CODEX_HOME = Join-Path $env:LOCALAPPDATA 'Codex-Account-B' }
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
if ($Action -eq 'start') {
    & $nodeExecutable $cliPath doctor
    if ($LASTEXITCODE -ne 0) { throw 'Doctor failed; worker was not started.' }
    $lockPath = Join-Path $localRoot 'worker.lock'
    if (Test-Path -LiteralPath $lockPath) {
        $ownerPid = [int](Get-Content -LiteralPath $lockPath -Raw)
        if (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue) { throw "Worker already running (PID $ownerPid)." }
    }
    $stopPath = Join-Path $localRoot 'stop'
    if (Test-Path -LiteralPath $stopPath) { Remove-Item -LiteralPath $stopPath }
    $workerProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $cliPath + '"', 'work') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'worker.stdout.log') -RedirectStandardError (Join-Path $localRoot 'worker.stderr.log')
    Write-Output "Worker launched (PID $($workerProcess.Id)). Use scripts/agents.ps1 status to inspect jobs."
} elseif ($Action -in @('enqueue', 'retry', 'accept-requirements', 'cancel')) {
    if ($Issue -lt 1) { throw '-Issue must be a positive GitHub issue number.' }
    & $nodeExecutable $cliPath $Action $Issue
    if ($LASTEXITCODE -ne 0) { throw "$Action failed." }
} else {
    & $nodeExecutable $cliPath $Action
    if ($LASTEXITCODE -ne 0) { throw "$Action failed." }
}
