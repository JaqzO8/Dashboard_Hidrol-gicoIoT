import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import mqtt from "mqtt";
import { WebSocket } from "ws";
import { prepareCertificates, newAccount, stationTopics, stationId } from "../tools/hardware-config.mjs";
import { startHardwareBroker } from "../tools/hardware-broker.mjs";
import { createBackend } from "../backend/src/server.js";
import { reading } from "./fixtures.mjs";

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!await predicate()) { if (Date.now() > deadline) throw new Error("Timeout en comprobación TLS"); await pause(25); }
}
test("Banco ESP32: TLS, identidades, permisos y backend completo", { timeout: 60000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "sitpa-tls-test-"));
  t.after(() => {
    // Solo borrar el directorio temporal creado por este test.
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error("Directorio temporal fuera del alcance esperado");
    rmSync(directory, { recursive: true, force: true });
  });
  const certificates = prepareCertificates(directory, "127.0.0.1");
  const station = newAccount("station"), backendAccount = newAccount("backend");
  const config = { host: "127.0.0.1", port: 0, stationId, accounts: { [stationId]: station.account, "sitpa-backend": backendAccount.account } };
  const broker = await startHardwareBroker({ config, ...certificates });
  const url = `mqtts://127.0.0.1:${broker.port}`;
  const auth = { ca: certificates.ca, username: stationId, password: station.password, rejectUnauthorized: true, reconnectPeriod: 0, connectTimeout: 2000 };
  const clients = [];
  let backend, ws;
  t.after(async () => {
    ws?.terminate();
    await Promise.all(clients.map(client => client.endAsync(true)));
    await backend?.close(); await broker.close();
  });
  const connect = async options => { const client = await mqtt.connectAsync(url, { ...auth, ...options }); clients.push(client); client.on("error", () => {}); return client; };

  await t.test("rechaza clave incorrecta y conexión sin confianza en la CA", async () => {
    await assert.rejects(mqtt.connectAsync(url, { ...auth, password: "incorrecta" }));
    await assert.rejects(mqtt.connectAsync(url, { ...auth, ca: undefined }));
    await assert.rejects(mqtt.connectAsync(url, { ...auth, servername: "otro-host.invalid" }));
  });
  await t.test("rechaza Last Will fuera del tópico de estado y Last Will del lector", async () => {
    await assert.rejects(mqtt.connectAsync(url, { ...auth, will: { topic: "sitpa/v1/stations/otra/status", payload: "offline", qos: 1 } }));
    await assert.rejects(mqtt.connectAsync(url, { ...auth, username: "sitpa-backend", password: backendAccount.password, will: { topic: stationTopics.at(-1), payload: "offline", qos: 1 } }));
  });
  await t.test("estación no puede suscribirse y backend no puede leer cualquier tópico", async () => {
    const publisher = await connect();
    await assert.rejects(publisher.subscribeAsync(stationTopics[0]));
    const reader = await connect({ username: "sitpa-backend", password: backendAccount.password });
    await assert.rejects(reader.subscribeAsync("#"));
    const grants = await reader.subscribeAsync(stationTopics[0]);
    assert.notEqual(grants[0].qos, 128);
  });
  await t.test("estación no publica en otra estación y backend no publica", async () => {
    const publisher = await connect();
    const rejectedStation = once(publisher, "close");
    publisher.publish("sitpa/v1/stations/otra/telemetry", "{}", { qos: 0 });
    await rejectedStation;
    const reader = await connect({ username: "sitpa-backend", password: backendAccount.password });
    const rejectedReader = once(reader, "close");
    reader.publish(stationTopics[0], "{}", { qos: 0 });
    await rejectedReader;
  });
  await t.test("MQTTS → SQLite → WebSocket con CA verificada y Last Will offline", async () => {
    backend = await createBackend({ mqttUrl: url, mqttOptions: { ca: certificates.ca, username: "sitpa-backend", password: backendAccount.password, rejectUnauthorized: true },
      databasePath: ":memory:", host: "127.0.0.1", port: 0, origins: ["http://localhost:4173"], stationIds: [stationId], liveMs: 3000, staleMs: 10000, rawRetentionDays: 7 });
    const base = `http://127.0.0.1:${backend.address.port}`;
    await until(async () => (await fetch(`${base}/healthz`)).ok);
    ws = new WebSocket(`ws://127.0.0.1:${backend.address.port}/ws?stationId=${stationId}`, { origin: "http://localhost:4173" });
    const messages = [];
    ws.on("message", data => messages.push(JSON.parse(data)));
    await once(ws, "open");
    const publisher = await connect({ will: { topic: stationTopics.at(-1), payload: "offline", qos: 1, retain: true } });
    assert.equal(publisher.stream.authorized, true);
    await publisher.publishAsync(stationTopics[0], JSON.stringify(reading({ sequence: 1, simulation: true })));
    await until(() => messages.some(x => x.type === "telemetry"));
    assert.equal(messages.find(x => x.type === "telemetry").reading.simulation, true);
    publisher.stream.destroy();
    await until(async () => !(await (await fetch(`${base}/api/v1/stations/${stationId}/status`)).json()).stationOnline);
  });
});
