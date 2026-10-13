<#
.SYNOPSIS
  Remove an agent worktree under .claude\worktrees\ and its branch, without
  following any link inside it into the main checkout.

.PARAMETER Force
  Discard uncommitted changes, and delete the branch even if it isn't merged.

.EXAMPLE
  .\.claude\skills\worktree\teardown.ps1 -Name portrait-bg
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [switch]$KeepBranch,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'

$commonDir = git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir
$root = Split-Path -Parent ($commonDir -replace '/', '\')
$target = Join-Path $root ".claude\worktrees\$Name"

# Only a worktree git knows about, so a mistyped name can never aim the delete elsewhere.
$branch = $null
$listed = $false
foreach ($line in git -C $root worktree list --porcelain) {
  if ($line -like 'worktree *') { $listed = $listed -or (($line.Substring(9) -replace '/', '\') -eq $target); $current = ($line.Substring(9) -replace '/', '\') }
  elseif ($line -like 'branch *' -and $current -eq $target) { $branch = $line.Substring(7) -replace '^refs/heads/', '' }
}
if (-not $listed) { throw "git does not list $target as a worktree" }

$dirty = git -C $target status --porcelain
if ($dirty -and -not $Force) {
  $dirty | Select-Object -First 20 | Write-Host
  throw "uncommitted changes (above): commit them, or pass -Force to discard"
}

# `git worktree remove` follows a junction and deletes the real files behind it. None should exist, but a
# build can make some (Turbopack links bundled-around packages into .next\node_modules, as junctions on
# Windows without Developer Mode). `rmdir /s` removes a junction it meets without entering it.
cmd /c "rmdir /s /q `"$target`""
if (Test-Path -LiteralPath $target) { throw "could not delete ${target}: stop any dev server or build running in it, then rerun" }
git -C $root worktree prune

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\next\package.json'))) {
  throw "the main checkout's node_modules\next is missing after the delete: check node_modules before anything else"
}
Write-Host "removed $target"

if ($branch -and -not $KeepBranch) {
  git -C $root branch $(if ($Force) { '-D' } else { '-d' }) $branch
  if ($LASTEXITCODE -ne 0) { throw "branch $branch kept: it isn't merged (pass -Force to delete it anyway)" }
}
