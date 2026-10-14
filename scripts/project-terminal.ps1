# This function exists only in this project's PowerShell terminal.
function global:gh {
    & (Join-Path $env:LOCALAPPDATA 'gh-workout-memo/gh-project.ps1') @args
}
