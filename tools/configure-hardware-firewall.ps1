# Ejecutar en PowerShell como administrador, una vez, para el banco ESP32 en la LAN.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath "$PSScriptRoot/..").Path
$config = Get-Content -LiteralPath (Join-Path $repoRoot '.local-mqtt/broker.json') -Raw | ConvertFrom-Json
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'La regla MQTT requiere PowerShell como administrador. No se cambió el firewall.'
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$ruleName = 'SITPA-MQTT-TLS-Local'
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) { $existing | Remove-NetFirewallRule }
New-NetFirewallRule -Name $ruleName -DisplayName 'SITPA MQTT TLS — solo subred local' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8883 -LocalAddress $config.host -RemoteAddress LocalSubnet -Program $nodePath -Profile Any | Out-Null
Write-Output "Regla creada: Node / TCP 8883 / IP $($config.host) / solo subred local. No se abrieron HTTP, SSH ni el puerto MQTT sin TLS."
