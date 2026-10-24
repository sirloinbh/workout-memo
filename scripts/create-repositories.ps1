param([Parameter(Mandatory = $true)][string]$Owner)
$ErrorActionPreference = 'Stop'
$login = & gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $login -ne $Owner) { throw "Authenticate as $Owner before creating repositories." }
function Run-Git { & git @args; if ($LASTEXITCODE -ne 0) { throw "git failed: $args" } }
$repos = @{ frontend='workout-memo-frontend'; backend='workout-memo-backend'; database='workout-memo-db' }
Run-Git init -b main
Run-Git add .
Run-Git commit -m 'Build FORM workout tracker with PostgreSQL, Docker and CI'
foreach ($part in $repos.Keys) {
    $name = "$Owner/$($repos[$part])"
    & gh repo create $name --private --description "FORM workout tracker: $part"
    if ($LASTEXITCODE -ne 0) { throw "Repository creation failed: $name" }
    Run-Git remote add $part "https://github.com/$name.git"
    Run-Git subtree split --prefix=$part --branch="export/$part" --rejoin
    Run-Git push $part "export/${part}:main"
}
& gh repo create "$Owner/workout-memo" --private --description 'FORM workout tracker umbrella monorepo: React, Express, PostgreSQL and Docker'
if ($LASTEXITCODE -ne 0) { throw 'Umbrella repository creation failed' }
Run-Git remote add origin "https://github.com/$Owner/workout-memo.git"
Run-Git push -u origin main
