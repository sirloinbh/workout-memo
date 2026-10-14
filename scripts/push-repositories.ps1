$ErrorActionPreference = 'Stop'
$repos = @{ frontend='workout-memo-frontend'; backend='workout-memo-backend'; database='workout-memo-db'; infrastructure='shared-aws-infrastructure' }
foreach ($part in $repos.Keys) {
    $branch = "export/$part"
    & git subtree split --prefix=$part --branch=$branch --rejoin
    if ($LASTEXITCODE -ne 0) { throw "Split failed: $part" }
    & git push $part "${branch}:main"
    if ($LASTEXITCODE -ne 0) { throw "Push failed: $part" }
}
& git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Umbrella push failed' }
