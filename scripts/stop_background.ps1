$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectManifestPath = Join-Path $projectRoot 'app\data\network\server_process.json'
if (-not (Test-Path -LiteralPath $projectManifestPath)) {
    Write-Host 'Nenhuma execucao em segundo plano registrada. Para a janela do run.bat, use Ctrl+C.'
    exit 0
}
$projectManifest = Get-Content -LiteralPath $projectManifestPath -Raw | ConvertFrom-Json
$projectServerId = [int]$projectManifest.process_id
$projectLauncher = Get-CimInstance Win32_Process -Filter "ProcessId=$projectServerId"
if ($null -eq $projectLauncher) {
    Write-Host 'O servidor registrado ja foi encerrado.'
    exit 0
}
$projectExpectedScript = Join-Path $projectRoot 'scripts\run_local.py'
if ($null -eq $projectLauncher.CommandLine -or
    $projectLauncher.CommandLine.IndexOf($projectExpectedScript, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw 'O processo registrado nao corresponde a este projeto. Nenhum processo foi encerrado.'
}
taskkill /PID $projectServerId /T /F
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel encerrar a execucao registrada.' }
Write-Host 'Servidores locais do projeto encerrados. Nenhum banco foi removido.'
