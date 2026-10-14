import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import mqtt from "mqtt";
import { WebSocket } from "ws";
import { startLocalBroker } from "../tools/local-broker.mjs";
import { createBackend } from "../backend/src/server.js";
import { PredictionService } from "../backend/src/prediction.js";
import { reading } from "./fixtures.mjs";

async function until(predicate, timeout = 5000) {
  const start = Date.now();
  while (!await predicate()) { if (Date.now() - start > timeout) throw new Error("Timeout esperando condición de integración"); await pause(25); }
}
test("MQTT → SQLite → WebSocket/REST: cadencia, fallos, recuperación y Last Will", { timeout: 45000 }, async t => {
  const broker = await startLocalBroker(0);
  const model = new PredictionService();
  const backend = await createBackend({ mqttUrl: `mqtt://127.0.0.1:${broker.port}`, mqttOptions: {}, databasePath: ":memory:",
    host: "127.0.0.1", port: 0, origins: ["http://localhost:4173"], stationIds: ["tingomaria-01"], liveMs: 3000, staleMs: 10000, rawRetentionDays: 7 }, { predictions: model });
  const base = `http://127.0.0.1:${backend.address.port}`;
  const wsUrl = `ws://127.0.0.1:${backend.address.port}/ws?stationId=tingomaria-01`;
  const topic = "sitpa/v1/stations/tingomaria-01";
  const publisher = mqtt.connect(`mqtt://127.0.0.1:${broker.port}`, { reconnectPeriod: 0,
    will: { topic: `${topic}/status`, payload: "offline", qos: 1, retain: true } });
  let ws;
  t.after(async () => { ws?.terminate(); await publisher.endAsync(true); await backend.close(); await broker.close(); });
  await once(publisher, "connect");
  await until(async () => (await fetch(`${base}/healthz`)).ok);
  const messages = [];
  ws = new WebSocket(wsUrl, { origin: "http://localhost:4173" });
  ws.on("message", data => messages.push({ ...JSON.parse(data), receivedAt: Date.now() }));
  await once(ws, "open");
  await until(() => messages.some(m => m.type === "snapshot"));
  assert.equal(messages.find(m => m.type === "snapshot").status.stationOnline, false);
  await publisher.publishAsync(`${topic}/status`, "online", { retain: true });
  for (let sequence = 1; sequence <= 6; sequence++) {
    await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence, simulation: true })));
    if (sequence < 6) await pause(1000);
  }
  await until(() => messages.filter(m => m.type === "telemetry").length === 6);
  const live = messages.filter(m => m.type === "telemetry");
  const hz = 5 / ((live.at(-1).receivedAt - live[0].receivedAt) / 1000);
  assert.ok(hz > 0.7 && hz < 1.3, `Cadencia fuera de rango: ${hz}`);
  t.diagnostic(`Simulador MQTT medido: ${hz.toFixed(3)} Hz; 6 mensajes, ${(live.at(-1).receivedAt - live[0].receivedAt) / 1000} segundos`);
  assert.equal(live.at(-1).reading.simulation, true);
  assert.ok(live.at(-1).forecast.horizons.every(h => !h.available));
  await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence: 6 })));
  await publisher.publishAsync(`${topic}/telemetry`, "{invalid JSON");
  await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence: undefined })));
  await pause(100);
  let payload = await (await fetch(`${base}/api/v1/stations/tingomaria-01/history?limit=500`)).json();
  assert.equal(payload.rows.length, 6);
  assert.equal((await fetch(`${base}/api/v1/stations/tingomaria-01/history?limit=501`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/stations/tingomaria-01/latest`, { headers: { origin: "https://untrusted.example" } })).status, 403);
  payload = await (await fetch(`${base}/api/v1/stations/tingomaria-01/history?resolution=1m`)).json();
  assert.equal(payload.rows.reduce((sum, r) => sum + r.samples, 0), 6);
  const generate = model.generate;
  model.generate = () => { throw new Error("injected model failure"); };
  await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence: 7, stateCode: 3, state: "CRITICO", levelCm: 11 })));
  await until(() => messages.some(m => m.reading?.sequence === 7));
  const failedModel = messages.find(m => m.reading?.sequence === 7);
  assert.equal(failedModel.reading.levelCm, 11); assert.equal(failedModel.forecast.edge.available, false);
  assert.match(failedModel.forecast.horizons[0].reason, /Fallo del modelo/);
  model.generate = generate;
  const save = backend.store.save;
  backend.store.save = () => { throw new Error("injected database failure"); };
  await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence: 8 })));
  await until(() => messages.some(m => m.type === "error"));
  assert.equal(backend.store.latest("tingomaria-01").sequence, 7);
  backend.store.save = save;
  await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence: 9, quality: { levelValid: false, climateValid: true } })));
  await until(() => messages.some(m => m.reading?.sequence === 9));
  assert.equal(messages.find(m => m.reading?.sequence === 9).forecast.edge.available, false);
  ws.terminate(); await once(ws, "close");
  ws = new WebSocket(wsUrl, { origin: "http://localhost:4173" });
  const reconnected = [];
  ws.on("message", data => reconnected.push(JSON.parse(data)));
  await once(ws, "open"); await until(() => reconnected.some(m => m.type === "snapshot"));
  assert.equal(reconnected.find(m => m.type === "snapshot").rows.at(-1).sequence, 9);
  backend.client.stream.destroy();
  await until(() => reconnected.some(m => m.type === "backend" && m.brokerConnected === false));
  await until(async () => (await fetch(`${base}/healthz`)).ok);
  await publisher.publishAsync(`${topic}/telemetry`, JSON.stringify(reading({ sequence: 10 })));
  await until(() => reconnected.some(m => m.reading?.sequence === 10));
  publisher.stream.destroy();
  await until(async () => (await (await fetch(`${base}/api/v1/stations/tingomaria-01/status`)).json()).stationOnline === false);
  const events = backend.store.db.prepare("SELECT DISTINCT type FROM events").all().map(x => x.type);
  for (const event of ["telemetry_received", "message_rejected", "alert", "prediction_failure", "mqtt_disconnected", "station_disconnected"]) assert.ok(events.includes(event), event);
});
