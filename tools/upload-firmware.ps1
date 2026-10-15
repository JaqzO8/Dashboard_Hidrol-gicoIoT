param(
  [Parameter(Mandatory = $true)][ValidatePattern('^COM[0-9]+$')][string]$Port,
  [string]$Fqbn = 'esp32:esp32:esp32:FlashMode=dio,FlashFreq=40',
  [string]$Cli
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath "$PSScriptRoot/..").Path
if (-not $Cli) { $Cli = Join-Path $repoRoot '.tools/arduino-cli/arduino-cli.exe' }
if ($Port -notin [System.IO.Ports.SerialPort]::GetPortNames()) { throw "El puerto $Port no está presente. Conecte y confirme la placa antes de cargar." }
& (Join-Path $PSScriptRoot 'compile-firmware.ps1') -UseLocalSecrets -Fqbn $Fqbn -Cli $Cli
if ($LASTEXITCODE -ne 0) { throw 'Compilación configurada fallida; no se cargó la placa' }
& $Cli upload --port $Port --fqbn $Fqbn --input-dir (Join-Path $repoRoot '.tools/firmware-ready') (Join-Path $repoRoot '.tools/sketch/09_Codigo_Final_Proyecto')
if ($LASTEXITCODE -ne 0) { throw 'Falló la carga; revisar placa, cable USB, COM y botón BOOT' }
Write-Output "Firmware SITPA cargado en $Port. Verificar sensores y alarma local con monitor serie a 115200."
