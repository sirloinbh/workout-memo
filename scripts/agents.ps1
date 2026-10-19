param(
    [ValidateSet('start', 'stop', 'status', 'doctor', 'smoke', 'enqueue', 'configure', 'diagnose', 'retry', 'accept-requirements', 'cancel', 'handoff-tests', 'respond')]
    [string]$Action = 'status',
    [int]$Issue = 0,
    [string]$ResponseFile,
    [ValidateSet('code', 'documentation')][string]$TaskKind,
    [ValidateSet('review', 'highRiskReview')][string]$ReviewRole,
    [ValidateSet('simple', 'complex')][string]$TestComplexity,
    [ValidateSet('true', 'false')][string]$RequireDatabase,
    [ValidateSet('true', 'false')][string]$RequireBrowser,
    [ValidateSet('planning', 'debugging', 'highRiskReview', 'tests', 'implementation', 'review', 'research', 'documentation')][string]$Role
)
$ErrorActionPreference = 'Stop'
if (($TaskKind -or $ReviewRole -or $TestComplexity -or $RequireDatabase -or $RequireBrowser) -and $Action -notin @('enqueue', 'configure')) { throw 'Routing options require enqueue or configure.' }
if ($Role -and $Action -ne 'smoke') { throw '-Role requires smoke.' }
if ($ResponseFile -and $Action -ne 'respond') { throw '-ResponseFile requires respond.' }
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
} elseif ($Action -in @('enqueue', 'configure', 'diagnose', 'retry', 'accept-requirements', 'cancel', 'handoff-tests', 'respond')) {
    if ($Issue -lt 1) { throw '-Issue must be a positive GitHub issue number.' }
    $cliArguments = @($Action, "$Issue")
    if ($Action -eq 'respond') {
        if (-not $ResponseFile) { throw '-ResponseFile is required for an actual user response.' }
        $cliArguments += @($ResponseFile)
    }
    if ($TaskKind) { $cliArguments += @('--task-kind', $TaskKind) }
    if ($ReviewRole) { $cliArguments += @('--review-role', $ReviewRole) }
    if ($TestComplexity) { $cliArguments += @('--test-complexity', $TestComplexity) }
    if ($RequireDatabase) { $cliArguments += @('--require-database', $RequireDatabase) }
    if ($RequireBrowser) { $cliArguments += @('--require-browser', $RequireBrowser) }
    & $nodeExecutable $cliPath @cliArguments
    if ($LASTEXITCODE -ne 0) { throw "$Action failed." }
} else {
    $cliArguments = @($Action)
    if ($Role) { $cliArguments += @('--role', $Role) }
    & $nodeExecutable $cliPath @cliArguments
    if ($LASTEXITCODE -ne 0) { throw "$Action failed." }
}
