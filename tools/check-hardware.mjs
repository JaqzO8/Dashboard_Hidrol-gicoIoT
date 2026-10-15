import { readFileSync, existsSync } from "node:fs";
import { X509Certificate, createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { networkInterfaces } from "node:os";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { root, localDirectory, stationId, readFirmwareSecrets, verifyPassword } from "./hardware-config.mjs";

if (existsSync(resolve(localDirectory, 'azure.json'))) {
  try { (await import('./check-azure-hardware.mjs')).checkAzureHardware(process.argv.includes('--configuration-only')); }
  catch (error) { console.error('FALTA · Preparación Azure: ' + error.message); process.exit(1); }
  process.exit(0);
}

const checks = [];
function check(label, valid) { checks.push({ check: label, ok: !!valid }); }
try {
  const secretsPath = resolve(root, "iot_code/secrets.h"), secrets = readFirmwareSecrets(secretsPath);
  const source = resolve(root, "iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino");
  const config = JSON.parse(readFileSync(resolve(localDirectory, "broker.json"), "utf8"));
  const backend = parseEnv(readFileSync(resolve(localDirectory, "backend.env"), "utf8"));
  const caPem = readFileSync(resolve(localDirectory, "ca.crt"), "utf8").trim();
  const cert = new X509Certificate(readFileSync(resolve(localDirectory, "server.crt")));
  const ca = new X509Certificate(caPem);
  const privateKey = createPrivateKey(readFileSync(resolve(localDirectory, "server.key")));
  const hostPresent = Object.values(networkInterfaces()).flat().some(x => x?.address === config.host);
  check("Sketch Arduino disponible", existsSync(source));
  check("Wi-Fi guardado (autenticación física pendiente)", secrets.WIFI_SSID && secrets.WIFI_PASSWORD && Buffer.byteLength(secrets.WIFI_PASSWORD) >= 8);
  check("IPv4 del broker presente en este equipo", hostPresent && config.host === secrets.MQTT_HOST);
  check("TLS obligatorio y puerto 8883", /^#define\s+MQTT_USE_TLS\s+1\s*$/m.test(readFileSync(secretsPath, "utf8")) && /^#define\s+MQTT_PORT\s+8883\s*$/m.test(readFileSync(secretsPath, "utf8")));
  check("CA incluida en firmware", readFileSync(secretsPath, "utf8").includes(caPem));
  check("Certificado vigente y válido para la IP", cert.checkIP(config.host) && cert.verify(ca.publicKey) && Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now() + 86400000 && Date.parse(ca.validTo) > Date.now());
  check("Clave privada coincide con certificado", cert.publicKey.equals(createPublicKey(privateKey)));
  check("Credencial de estación coherente", secrets.MQTT_USERNAME === stationId && verifyPassword(secrets.MQTT_PASSWORD, config.accounts[stationId]));
  check("Credencial del backend coherente y distinta", backend.MQTT_USERNAME === "sitpa-backend" && verifyPassword(backend.MQTT_PASSWORD, config.accounts["sitpa-backend"]) && backend.MQTT_PASSWORD !== secrets.MQTT_PASSWORD);
  check("Backend usa TLS y la misma CA", backend.MQTT_URL === `mqtts://${config.host}` && backend.MQTT_PORT === "8883" && readFileSync(backend.MQTT_CA_FILE, "utf8").trim() === caPem && backend.STATION_IDS === stationId);
  for (const file of ["edge_logic.h", "secrets.h", "secrets.example.h"]) check(`Arduino IDE: ${file} sincronizado`, readFileSync(resolve(root, "iot_code", file)).equals(readFileSync(resolve(root, "iot_code/09_Codigo_Final_Proyecto", file))));
  if (!process.argv.includes("--configuration-only")) {
    const output = resolve(root, ".tools/firmware-ready");
    if (!existsSync(resolve(output, "sitpa-build.json"))) check("Firmware configurado compilado", false);
    else {
      const manifest = JSON.parse(readFileSync(resolve(output, "sitpa-build.json"), "utf8").replace(/^\uFEFF/, ""));
      const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
      check("Binario configurado actual (ESP32 clásico)", manifest.configured && manifest.fqbn === "esp32:esp32:esp32" && manifest.sourceSha256 === sha(source) && manifest.logicSha256 === sha(resolve(root, "iot_code/edge_logic.h")) && manifest.secretsSha256 === sha(secretsPath) && existsSync(resolve(output, "09_Codigo_Final_Proyecto.ino.bin")));
    }
  }
} catch { check("Archivos de preparación completos y legibles", false); }
for (const item of checks) console.log(`${item.ok ? "OK" : "FALTA"} · ${item.check}`);
if (checks.some(x => !x.ok)) process.exitCode = 1;
console.log("Este chequeo no verifica cableado, COM, conexión Wi-Fi del ESP32 ni acceso a través del firewall desde otro equipo.");
