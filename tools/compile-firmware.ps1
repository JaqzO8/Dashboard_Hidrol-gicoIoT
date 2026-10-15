param([string]$Fqbn = 'esp32:esp32:esp32:FlashMode=dio,FlashFreq=40', [string]$Cli, [switch]$UseLocalSecrets)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath "$PSScriptRoot/..").Path
if (-not $Cli) { $Cli = Join-Path $repoRoot '.tools/arduino-cli/arduino-cli.exe' }
New-Item -ItemType Directory -Path (Join-Path $repoRoot '.tools') -Force | Out-Null
# Una ruta estable permite reutilizar las librerías compiladas. Impedir dos compilaciones simultáneas.
$compileLock = [System.IO.File]::Open((Join-Path $repoRoot '.tools/firmware-compile.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
$sourcePath = Join-Path $repoRoot 'iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino'
if (-not (Test-Path -LiteralPath $sourcePath)) { $sourcePath = Join-Path $repoRoot 'iot_code/09_Codigo_Final_Proyecto.ino' }
if (-not (Test-Path -LiteralPath $sourcePath)) { throw 'No se encontró el archivo fuente del firmware' }
$variant = if ($UseLocalSecrets) { 'configured' } else { 'check' }
$sketchPath = Join-Path $repoRoot '.tools/sketch/09_Codigo_Final_Proyecto'
$outputPath = Join-Path $repoRoot $(if ($UseLocalSecrets) { '.tools/firmware-ready' } else { '.tools/firmware-build' })
New-Item -ItemType Directory -Path $sketchPath -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $sketchPath
Copy-Item -LiteralPath (Join-Path $repoRoot 'iot_code/edge_logic.h') -Destination $sketchPath
$secretsPath = Join-Path $repoRoot $(if ($UseLocalSecrets) { 'iot_code/secrets.h' } else { 'iot_code/secrets.example.h' })
if ($UseLocalSecrets) {
  & node (Join-Path $PSScriptRoot 'check-hardware.mjs') --configuration-only
  if ($LASTEXITCODE -ne 0) { throw 'La configuración local no está completa' }
}
Copy-Item -LiteralPath $secretsPath -Destination (Join-Path $sketchPath 'secrets.h')
& $Cli compile --jobs 2 --fqbn $Fqbn --output-dir $outputPath $sketchPath
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación ESP32' }
$manifest = @{
  fqbn = $Fqbn; configured = [bool]$UseLocalSecrets; compiledAt = [DateTimeOffset]::UtcNow.ToString('o')
  sourceSha256 = (Get-FileHash -LiteralPath (Join-Path $sketchPath '09_Codigo_Final_Proyecto.ino') -Algorithm SHA256).Hash
  logicSha256 = (Get-FileHash -LiteralPath (Join-Path $sketchPath 'edge_logic.h') -Algorithm SHA256).Hash
  secretsSha256 = (Get-FileHash -LiteralPath (Join-Path $sketchPath 'secrets.h') -Algorithm SHA256).Hash
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputPath 'sitpa-build.json') -Encoding utf8
Write-Output "Compilación $variant finalizada. No se ha cargado ninguna placa."
} finally { $compileLock.Dispose() }
