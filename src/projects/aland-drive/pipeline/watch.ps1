# A build's progress, as it happens, for whoever is watching: only the lines saying how many tiles are done and how long is left.
# Usage: & src/projects/aland-drive/pipeline/watch.ps1 <the build's log>
param([Parameter(Mandatory)][string]$Log)
Get-Content -Path $Log -Wait -Encoding UTF8 | Where-Object { $_ -match '^\[\d+/\d+\]|^world ' }
