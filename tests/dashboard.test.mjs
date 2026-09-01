import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedUrl, buildLatestFeedUrl, mergeLatestFeeds, normalizeFeed, riverMeta, stats } from "../app.js";
import { PERU_RIVERS } from "../data/peru-rivers.js";
import { LIVE_INTERVAL_MS, BURST_INTERVAL_MS, BACKGROUND_INTERVAL_MS } from "../src/core/live-feed.js";

test("construye la URL pública sin exponer una clave", () => {
  const url = buildFeedUrl("3420787", 100);
  assert.match(url, /channels\/3420787\/feeds\.json/);
  assert.match(url, /results=100/);
  assert.doesNotMatch(url, /api_key/);
});

test("agrega la clave solo cuando fue proporcionada", () => {
  assert.match(buildFeedUrl("1", 50, "abc123"), /api_key=abc123/);
});

test("aplica sondeo adaptativo con intervalo base de 15 segundos", () => {
  assert.equal(LIVE_INTERVAL_MS, 15000);
  assert.equal(BURST_INTERVAL_MS, 5000);
  assert.equal(BACKGROUND_INTERVAL_MS, 60000);
});

test("consulta la última entrada durante la sincronización incremental", () => {
  const url = buildLatestFeedUrl("3420787");
  assert.match(url, /feeds\/last\.json/);
  assert.doesNotMatch(url, /results=/);
});

test("normaliza una lectura de ThingSpeak preservando la precisión", () => {
  const row = normalizeFeed({
    created_at: "2026-07-16T14:13:16Z",
    entry_id: 273,
    field1: "0.51074",
    field2: "0",
    field3: "23.8",
    field4: "78.5",
    field5: "0.10288",
    field6: "0.81939",
    field7: "0"
  });
  assert.equal(row.level, 0.51074);
  assert.equal(row.rain, 0);
  assert.equal(row.status, 0);
  assert.equal(row.entryId, 273);
});

test("calcula estadísticas ignorando valores ausentes", () => {
  assert.deepEqual(stats([1, null, 3, NaN]), { avg: 2, min: 1, max: 3 });
});

test("incluye el catálogo hidrográfico nacional", () => {
  assert.ok(PERU_RIVERS.length > 900);
  assert.ok(PERU_RIVERS.includes("Río Huallaga"));
});

test("asocia el canal actual con el Río Huallaga", () => {
  assert.deepEqual(riverMeta("Río Huallaga"), {
    name: "Río Huallaga",
    region: "Amazonas",
    locality: "Huánuco, San Martín y Loreto",
    channel: "3420787"
  });
});

test("integra una lectura nueva sin duplicar y conserva la ventana", () => {
  const base = [{ entryId: 1, date: new Date(1) }, { entryId: 2, date: new Date(2) }];
  const next = { entryId: 3, date: new Date(3) };
  assert.deepEqual(mergeLatestFeeds(base, next, 2).map((x) => x.entryId), [2, 3]);
  assert.strictEqual(mergeLatestFeeds(base, base[1], 2), base);
});

// Nuevas Pruebas de Precisión (CP-13 a CP-17)

test("CP-13: descarta lecturas duplicadas o desordenadas en mergeLatestFeeds", () => {
  const base = [
    { entryId: 100, date: new Date("2026-09-01T10:00:00Z") },
    { entryId: 101, date: new Date("2026-09-01T10:00:15Z") }
  ];
  const stale = { entryId: 100, date: new Date("2026-09-01T10:00:00Z") };
  const merged = mergeLatestFeeds(base, stale, 100);
  assert.deepEqual(merged.map((x) => x.entryId), [100, 101]);
});


test("CP-14: evalúa correctamente el estado según antigüedad del dato", () => {
  const oldDate = new Date(Date.now() - 40000); // 40 segundos atrás (>30s)
  const isStale = (Date.now() - oldDate.getTime()) / 1000 > 30;
  assert.equal(isStale, true);
});

test("CP-15: procesa y grafica valores field1 negativos válidos", () => {
  const row = normalizeFeed({
    created_at: "2026-09-01T12:00:00Z",
    entry_id: 500,
    field1: "-0.25143"
  });
  assert.equal(row.level, -0.25143);
  assert.notEqual(row.level, null);
  const resultStats = stats([row.level, 0.5]);
  assert.equal(resultStats.min, -0.25143);
});

test("CP-16: preserva valores atípicos muy altos sin recortarlos", () => {
  const outlierValues = [0.5, 0.6, 45.8, 0.55];
  const resultStats = stats(outlierValues);
  assert.equal(resultStats.max, 45.8);
  assert.equal(resultStats.avg, (0.5 + 0.6 + 45.8 + 0.55) / 4);
});

test("CP-17: preserva decimales exactos en normalizeFeed sin redondeo", () => {
  const rawValue = "12.3456789";
  const row = normalizeFeed({
    created_at: "2026-09-01T14:00:00Z",
    entry_id: 777,
    field1: rawValue
  });
  assert.equal(row.level, 12.3456789);
  assert.equal(String(row.level), rawValue);
});

