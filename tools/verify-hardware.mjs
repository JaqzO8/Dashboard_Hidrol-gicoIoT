// Ensayo aislado de las credenciales reales: loopback, puertos efímeros y SQLite en memoria.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import mqtt from "mqtt";
import { localDirectory, stationId, readFirmwareSecrets, stationTopics } from "./hardware-config.mjs";
import { startHardwareBroker, hardwareBrokerOptions } from "./hardware-broker.mjs";
import { configFromEnv } from "../backend/src/config.js";
import { createBackend } from "../backend/src/server.js";

let broker, backend, publisher;
try {
  const options = hardwareBrokerOptions(), secrets = readFirmwareSecrets();
  broker = await startHardwareBroker({ ...options, host: "127.0.0.1", port: 0 });
  const url = `mqtts://127.0.0.1:${broker.port}`;
  const env = parseEnv(readFileSync(resolve(localDirectory, "backend.env"), "utf8"));
  backend = await createBackend(configFromEnv({ ...env, MQTT_URL: url, MQTT_PORT: String(broker.port), PORT: "0", DATABASE_URL: "sqlite::memory:" }));
  const base = `http://127.0.0.1:${backend.address.port}`;
  const until = async predicate => {
    const deadline = Date.now() + 6000;
    while (!await predicate()) { if (Date.now() > deadline) throw new Error("timeout"); await pause(50); }
  };
  await until(async () => (await fetch(`${base}/healthz`)).ok);
  publisher = await mqtt.connectAsync(url, { username: secrets.MQTT_USERNAME, password: secrets.MQTT_PASSWORD,
    ca: options.ca, rejectUnauthorized: true, reconnectPeriod: 0, connectTimeout: 3000,
    will: { topic: stationTopics.at(-1), payload: "offline", qos: 1, retain: true } });
  assert.equal(publisher.stream.authorized, true);
  publisher.on("error", () => {});
  await publisher.publishAsync(stationTopics.at(-1), "online", { qos: 1, retain: true });
  await until(async () => (await (await fetch(`${base}/api/v1/stations/${stationId}/status`)).json()).stationOnline);
  publisher.stream.destroy();
  await until(async () => !(await (await fetch(`${base}/api/v1/stations/${stationId}/status`)).json()).stationOnline);
  console.log("OK · Certificado local, clave del ESP32, clave del backend, estado online y Last Will offline verificados mediante MQTTS real.");
  console.log("Ensayo sin sensores, sin datos de nivel y sin modificar la base persistente. Acceso desde la LAN pendiente de placa y firewall.");
} catch {
  console.error("FALLO · No se completó la conexión TLS con las credenciales locales; ejecutar check:hardware y revisar preparación. No se imprimen secretos.");
  process.exitCode = 1;
} finally {
  await publisher?.endAsync(true); await backend?.close(); await broker?.close();
}
