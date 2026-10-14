import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TelemetryStore } from "../backend/src/database.js";
import { validateTelemetry } from "../backend/src/validation.js";
import { configFromEnv } from "../backend/src/config.js";
import { reading } from "./fixtures.mjs";

test("contrato rechaza secuencia faltante, tipos falsos y estación ajena", () => {
  assert.equal(validateTelemetry(reading(), "tingomaria-01").levelCm, 7.42);
  for (const invalid of [{ sequence: undefined }, { stationId: "other" }, { levelCm: "7.42" }, { rainDetected: 1 }, { humidityPct: 110 }, { state: "NORMAL" }, { levelCm: null }]) {
    assert.throws(() => validateTelemetry(reading(invalid), "tingomaria-01"));
  }
  const invalidSensor = reading({ levelCm: null, distanceCm: null, quality: { levelValid: false } });
  assert.equal(validateTelemetry(invalidSensor, "tingomaria-01").levelCm, null);
});
test("SQLite persiste, deduplica y distingue reinicios sin admitir sesiones retiradas", () => {
  const dir = mkdtempSync(join(tmpdir(), "sitpa-test-"));
  const path = join(dir, "test.sqlite");
  let store = new TelemetryStore(path);
  try {
    const first = store.save(reading({ sequence: 100 })); assert.ok(first.id);
    assert.equal(store.save(reading({ sequence: 100 })), null);
    assert.equal(store.save(reading({ sequence: 99 })), null);
    assert.ok(store.save(reading({ bootId: "boot-2", sequence: 1 })));
    assert.equal(store.save(reading({ sequence: 101 })), null);
    store.close(); store = new TelemetryStore(path);
    assert.equal(store.latest("tingomaria-01").bootId, "boot-2");
    assert.equal(store.history("tingomaria-01", { limit: 500 }).rows.length, 2);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("agregaciones 1m/5m/1h excluyen nivel inválido y preservan extremos", () => {
  const store = new TelemetryStore();
  try {
    for (const [index, level] of [2, 4, 99].entries()) store.save(reading({ sequence: index + 1, serverTimestamp: 120000 + index * 1000, levelCm: level, quality: { levelValid: index < 2, climateValid: true } }));
    for (const resolution of ["1m", "5m", "1h"]) {
      const row = store.history("tingomaria-01", { resolution }).rows[0];
      assert.equal(row.samples, 3); assert.equal(row.validSamples, 2); assert.equal(row.levelCm, 3); assert.equal(row.levelMaxCm, 4);
    }
  } finally { store.close(); }
});
test("histórico paginado limita resultados sin enviar toda la BD", () => {
  const store = new TelemetryStore();
  try {
    for (let i = 1; i <= 12; i++) store.save(reading({ sequence: i, serverTimestamp: i * 1000 }));
    const first = store.history("tingomaria-01", { limit: 5 });
    const second = store.history("tingomaria-01", { limit: 5, before: first.nextBefore });
    assert.deepEqual(first.rows.map(x => x.sequence), [8, 9, 10, 11, 12]);
    assert.deepEqual(second.rows.map(x => x.sequence), [3, 4, 5, 6, 7]);
  } finally { store.close(); }
});
test("producción exige TLS y orígenes explícitos", () => {
  assert.throws(() => configFromEnv({ NODE_ENV: "production" }));
  const config = configFromEnv({ NODE_ENV: "production", MQTT_URL: "mqtts://broker.example", MQTT_USERNAME: "device", MQTT_PASSWORD: "test-value", CORS_ORIGIN: "https://example.org" });
  assert.equal(config.mqttOptions.rejectUnauthorized, true);
});
