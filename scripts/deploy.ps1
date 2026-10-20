<#
.SYNOPSIS
Deploys a git ref to the Lightsail server, or rolls back to the previous deployment (#73).
.EXAMPLE
./scripts/deploy.ps1 -Server 3.35.0.10 -Ref origin/main
./scripts/deploy.ps1 -Server 3.35.0.10 -Rollback
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Ref = 'origin/main',
  [switch]$Rollback,
  [string]$Key = (Join-Path $HOME '.ssh/workout-memo-lightsail')
)
$ErrorActionPreference = 'Stop'
if ($Ref -notmatch '^[A-Za-z0-9._/-]+$') { throw "Unsupported ref: $Ref" }
$action = if ($Rollback) { 'rollback' } else { "deploy $Ref" }
# The server script comes from the fetched checkout, so it matches the deployed commit.
$remote = 'cloud-init status --wait > /dev/null && cd /opt/workout-memo && ' +
  'git fetch --quiet --tags origin && git checkout --quiet --detach ' +
  $(if ($Rollback) { 'HEAD' } else { $Ref }) +
  " && bash deploy/remote-deploy.sh $action"
& ssh -i $Key -o StrictHostKeyChecking=accept-new "ubuntu@$Server" $remote
if ($LASTEXITCODE -ne 0) { throw "Remote $action failed with exit code $LASTEXITCODE" }
