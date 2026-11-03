# A build's progress, as it happens, for whoever is watching: only the lines saying how far each step is and how long it has left,
# and the world's steps as they start.
# Usage: & src/projects/aland-drive/pipeline/watch.ps1 <the build's log>
param([Parameter(Mandatory)][string]$Log)
Get-Content -Path $Log -Wait -Encoding UTF8 | Where-Object { $_ -match '^\[\w+ \d+/\d+\]|^world' }
