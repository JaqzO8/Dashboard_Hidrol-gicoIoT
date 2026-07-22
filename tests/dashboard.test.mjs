import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedUrl, buildLatestFeedUrl, mergeLatestFeeds, normalizeFeed, riverMeta, stats } from "../app.js";
import { PERU_RIVERS } from "../data/peru-rivers.js";
import { LIVE_INTERVAL_MS } from "../src/core/live-feed.js";

test("construye la URL pública sin exponer una clave", () => { const url = buildFeedUrl("3420787", 100); assert.match(url, /channels\/3420787\/feeds\.json/); assert.match(url, /results=100/); assert.doesNotMatch(url, /api_key/); });
test("agrega la clave solo cuando fue proporcionada", () => { assert.match(buildFeedUrl("1", 50, "abc123"), /api_key=abc123/); });
test("consulta la última entrada cada segundo", () => { assert.equal(LIVE_INTERVAL_MS, 1000); });
test("consulta solo la última entrada durante la sincronización incremental", () => { const url = buildLatestFeedUrl("3420787"); assert.match(url, /feeds\/last\.json/); assert.doesNotMatch(url, /results=/); });
test("normaliza una lectura de ThingSpeak", () => { const row = normalizeFeed({ created_at:"2026-07-16T14:13:16Z",entry_id:273,field1:"0.51074",field2:"0",field3:"23.8",field4:"78.5",field5:"0.10288",field6:"0.81939",field7:"0" }); assert.equal(row.level, .51074); assert.equal(row.status, 0); assert.equal(row.entryId, 273); });
test("calcula estadísticas ignorando valores ausentes", () => { assert.deepEqual(stats([1,null,3,NaN]), { avg:2,min:1,max:3 }); });
test("incluye el catálogo hidrográfico nacional", () => { assert.ok(PERU_RIVERS.length > 900); assert.ok(PERU_RIVERS.includes("Río Huallaga")); });
test("asocia el canal actual con el Río Huallaga", () => { assert.deepEqual(riverMeta("Río Huallaga"), { name:"Río Huallaga",region:"Amazonas",locality:"Huánuco, San Martín y Loreto",channel:"3420787" }); });
test("integra una lectura nueva sin duplicar y conserva la ventana", () => { const base = [{entryId:1,date:new Date(1)},{entryId:2,date:new Date(2)}]; const next = {entryId:3,date:new Date(3)}; assert.deepEqual(mergeLatestFeeds(base,next,2).map(x=>x.entryId), [2,3]); assert.strictEqual(mergeLatestFeeds(base,base[1],2), base); });
