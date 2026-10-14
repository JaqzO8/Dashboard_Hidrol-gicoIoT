import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { root, localDirectory, stationId, newAccount, readFirmwareSecrets, prepareCertificates, protectLocalDirectory, protectLocalFile, verifyPassword } from "./hardware-config.mjs";

const args = process.argv.slice(2);
const host = args[0] === "--host" && args.length === 2 ? args[1] : null;
if (!host) throw new Error("Uso: node tools/prepare-hardware.mjs --host <IPv4 LAN de este equipo>");
if (!Object.values(networkInterfaces()).flat().some(entry => entry?.family === "IPv4" && !entry.internal && entry.address === host)) throw new Error("La dirección elegida no pertenece a una interfaz LAN activa de este equipo");
const wifi = readFirmwareSecrets();
if (!wifi.WIFI_SSID || Buffer.byteLength(wifi.WIFI_SSID) > 32 || !wifi.WIFI_PASSWORD || Buffer.byteLength(wifi.WIFI_PASSWORD) < 8) throw new Error("Complete localmente WIFI_SSID y WIFI_PASSWORD en iot_code/secrets.h; no se muestran claves");
protectLocalDirectory(localDirectory);
const configPath = resolve(localDirectory, "broker.json");
const existing = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : null;
if (existing && (!verifyPassword(wifi.MQTT_PASSWORD, existing.accounts?.[stationId]) || !existsSync(resolve(localDirectory, "backend.env")))) throw new Error("Credenciales locales incompletas o cambiadas; no se sobrescriben automáticamente");
// Copia privada recuperable antes de cambiar la configuración inicial.
if (!existsSync(resolve(localDirectory, "secrets.before-local.h"))) copyFileSync(resolve(root, "iot_code/secrets.h"), resolve(localDirectory, "secrets.before-local.h"));
const publisher = existing ? null : newAccount("station"), backend = existing ? null : newAccount("backend");
const certificates = prepareCertificates(localDirectory, host);
const config = { host, port: 8883, stationId, accounts: existing?.accounts || { [stationId]: publisher.account, "sitpa-backend": backend.account } };
writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
const stationPassword = publisher?.password || wifi.MQTT_PASSWORD;
writeFileSync(resolve(root, "iot_code/secrets.h"), `#pragma once\n// Configuración privada local. No publicar ni compartir el binario configurado.\n#define WIFI_SSID ${JSON.stringify(wifi.WIFI_SSID)}\n#define WIFI_PASSWORD ${JSON.stringify(wifi.WIFI_PASSWORD)}\n#define MQTT_HOST ${JSON.stringify(host)}\n#define MQTT_PORT 8883\n#define MQTT_USERNAME ${JSON.stringify(stationId)}\n#define MQTT_PASSWORD ${JSON.stringify(stationPassword)}\n#define MQTT_USE_TLS 1\n#define MQTT_CA_CERT R"SITPA_CA(${certificates.ca.toString().trim()}\n)SITPA_CA"\n`, { mode: 0o600 });
if (backend) {
  const env = `MQTT_URL=mqtts://${host}\nMQTT_PORT=8883\nMQTT_USERNAME=sitpa-backend\nMQTT_PASSWORD=${backend.password}\nMQTT_CA_FILE=${resolve(localDirectory, "ca.crt").replaceAll("\\", "/")}\nDATABASE_URL=sqlite:./data/sitpa.sqlite\nHOST=127.0.0.1\nPORT=8787\nCORS_ORIGIN=http://localhost:4173,http://127.0.0.1:4173\nSTATION_IDS=${stationId}\nLIVE_THRESHOLD_MS=3000\nSTALE_THRESHOLD_MS=10000\nRAW_RETENTION_DAYS=7\nFORECAST_VALIDATION_FILE=\n`;
  writeFileSync(resolve(localDirectory, "backend.env"), env, { mode: 0o600 });
} else {
  const envPath = resolve(localDirectory, "backend.env");
  writeFileSync(envPath, readFileSync(envPath, "utf8").replace(/^MQTT_URL=.*$/m, `MQTT_URL=mqtts://${host}`), { mode: 0o600 });
}
// La carpeta que Arduino IDE creó es ahora el sketch fuente. Los headers se sincronizan aquí.
const sketch = resolve(root, "iot_code/09_Codigo_Final_Proyecto");
if (!existsSync(resolve(sketch, "09_Codigo_Final_Proyecto.ino"))) throw new Error("No se encontró el sketch en su carpeta Arduino");
for (const file of ["edge_logic.h", "secrets.h", "secrets.example.h"]) copyFileSync(resolve(root, "iot_code", file), resolve(sketch, file));
protectLocalFile(resolve(root, "iot_code/secrets.h"));
protectLocalFile(resolve(sketch, "secrets.h"));
protectLocalDirectory(resolve(root, ".tools/firmware-ready"));
protectLocalDirectory(resolve(root, ".tools/sketch-configured"));
protectLocalDirectory(resolve(root, ".tools/sketch"));
console.log(`Preparación local terminada: MQTTS ${host}:8883, CA local y dos cuentas separadas. Claves ocultas; Wi-Fi conservado.`);
