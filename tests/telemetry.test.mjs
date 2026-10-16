import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFeed, stats, mergeLatestFeeds, deriveAlertLevel, riverMeta } from "../app.js";
import { telemetryFreshness, websocketUrl, validateApiBase } from "../src/services/realtime.js";
import { RealtimeFeedController } from "../src/core/realtime-feed.js";
import { PERU_RIVERS } from "../data/peru-rivers.js";
import { prototypeOutlook, onsiteAlert } from "../shared/prototype.js";

test("normalización convierte cm a m sin atribuir milímetros al FC-37", () => {
  const row = normalizeFeed({ id: 1, serverTimestamp: 1000, levelCm: 7.4234567, rainDetected: true, rainRaw: 2300, riseRateCmMin: 0.32, edgePredictionCm: 8.38 });
  assert.equal(row.level, 0.074234567); assert.equal(row.rain, 1); assert.equal(row.speed, 0.32);
  assert.ok(Math.abs(row.prediction - 0.0838) < 1e-12); assert.equal(row.rainRaw, 2300);
  assert.equal(normalizeFeed({ serverTimestamp: 1000, levelCm: null }).level, null);
});
test("la bajada muestra cero de subida y conserva la predicción descendente", () => {
  const falling = normalizeFeed({ serverTimestamp: 1000, levelCm: 5, riseRateCmMin: -0.5 });
  assert.equal(falling.speed, 0);
  const outlook = prototypeOutlook(falling.level * 100, falling.levelRate);
  assert.equal(outlook.trend, "bajando");
  assert.equal(outlook.projectedCm, 3.5);
  assert.equal(onsiteAlert(5, 0, falling.levelRate), null);
  const rising = normalizeFeed({ serverTimestamp: 2000, levelCm: 5, riseRateCmMin: 0.5 });
  assert.equal(rising.speed, 0.5);
  assert.equal(onsiteAlert(5, 0, rising.levelRate).severity, "attention");
  for (const rate of [null, undefined, NaN, Infinity]) {
    const missing = normalizeFeed({ serverTimestamp: 3000, riseRateCmMin: rate });
    assert.equal(missing.speed, null);
    assert.equal(prototypeOutlook(5, missing.levelRate), null);
  }
  assert.equal(Object.is(normalizeFeed({ serverTimestamp: 4000, riseRateCmMin: -0 }).speed, -0), false);
});
test("estadísticas y catálogo originales", () => {
  assert.deepEqual(stats([1, null, 3, NaN]), { avg: 2, min: 1, max: 3 });
  assert.ok(PERU_RIVERS.length > 900); assert.equal(riverMeta("Río Huallaga").stationId, "tingomaria-01");
  assert.equal(riverMeta("Río Rímac").stationId, "");
});
test("ventana acotada, duplicados y orden por ID persistido del servidor", () => {
  const base = [{ entryId: 1, date: new Date(1000) }, { entryId: 2, date: new Date(2000) }];
  assert.equal(mergeLatestFeeds(base, base[1]), base);
  assert.deepEqual(mergeLatestFeeds(base, { entryId: 3, date: new Date(3000) }, 2).map(x => x.entryId), [2, 3]);
});
test("umbrales web coinciden con el prototipo 8 y 10 cm", () => {
  assert.equal(deriveAlertLevel(0, 0.08), "warning"); assert.equal(deriveAlertLevel(0, 0.10), "critical");
  assert.equal(deriveAlertLevel(3, 0.01), "critical"); assert.equal(deriveAlertLevel(0, null), null);
});
test("freshness distingue 0–3 s, 3–10 s y más de 10 s", () => {
  assert.equal(telemetryFreshness(7000, 10000), "live");
  assert.equal(telemetryFreshness(6999, 10000), "delayed");
  assert.equal(telemetryFreshness(0, 10000), "delayed");
  assert.equal(telemetryFreshness(0, 10001), "missing");
  assert.equal(telemetryFreshness(null, 10000), "missing");
  assert.equal(telemetryFreshness(6000, 10000, { liveMs: 5000, staleMs: 20000 }), "live");
});
test("URL WebSocket segura y límite 500", () => {
  assert.match(websocketUrl({ apiBaseUrl: "https://example.org", stationId: "tingomaria-01", results: 800 }), /^wss:.*limit=500/);
  assert.throws(() => validateApiBase("https://user:secret@example.org"));
  assert.throws(() => validateApiBase("http://example.org", "https:"));
});
test("suscripción recibe nuevos datos, ignora otra estación y cierra al cambiar", () => {
  const sockets = [], received = [], states = [];
  class Socket { constructor(url) { this.url = url; sockets.push(this); } close() { this.closed = true; } }
  const feed = new RealtimeFeedController({ getConfig: () => ({ apiBaseUrl: "http://localhost", stationId: "a" }), WebSocketImpl: Socket, onLatest: x => received.push(x), onState: x => states.push(x) });
  feed.refresh(); sockets[0].onopen();
  sockets[0].onmessage({ data: JSON.stringify({ type: "telemetry", stationId: "a", reading: { sequence: 1 } }) });
  sockets[0].onmessage({ data: JSON.stringify({ type: "telemetry", stationId: "b", reading: { sequence: 2 } }) });
  assert.equal(received.length, 1); assert.equal(feed.connected, true);
  feed.refresh(); assert.equal(sockets[0].closed, true); assert.equal(sockets[0].onmessage, null);
  feed.stop(); assert.equal(sockets[1].closed, true); assert.ok(states.includes("connected"));
});
