<#
.SYNOPSIS
  Create an agent worktree at .claude\worktrees\<Name> on a new branch from the
  main checkout's HEAD, ready to run with no install.

.EXAMPLE
  .\.claude\skills\worktree\setup.ps1 -Name portrait-bg -Branch art/portrait-bg
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Branch = $Name
)
$ErrorActionPreference = 'Stop'

# The main checkout is the parent of the shared .git folder, so this works when run from a worktree too.
$commonDir = git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir
$root = Split-Path -Parent ($commonDir -replace '/', '\')
$target = Join-Path $root ".claude\worktrees\$Name"
if (Test-Path -LiteralPath $target) { throw "already exists: $target" }

# HEAD, not origin/main: work landed locally but not yet pushed must be in the branch.
git -C $root worktree add $target -b $Branch HEAD
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

# Gitignored, so a fresh worktree has none; anything touching Supabase needs it.
$envFile = Join-Path $root '.env.local'
if (Test-Path -LiteralPath $envFile) { Copy-Item -LiteralPath $envFile -Destination $target }
else { Write-Warning "no .env.local in $root to copy" }

# next-env.d.ts is gitignored and written by Next; without it `npm run typecheck` can't type image imports.
Push-Location $target
try {
  npx next typegen | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "next typegen failed" }
}
finally { Pop-Location }

Write-Host "worktree $target"
Write-Host "branch   $Branch (from $(git -C $root rev-parse --short HEAD))"
