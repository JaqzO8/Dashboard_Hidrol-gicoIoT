import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedUrl, normalizeFeed, stats } from "../app.js";

test("construye la URL pública sin exponer una clave", () => { const url = buildFeedUrl("3420787", 100); assert.match(url, /channels\/3420787\/feeds\.json/); assert.match(url, /results=100/); assert.doesNotMatch(url, /api_key/); });
test("agrega la clave solo cuando fue proporcionada", () => { assert.match(buildFeedUrl("1", 50, "abc123"), /api_key=abc123/); });
test("normaliza una lectura de ThingSpeak", () => { const row = normalizeFeed({ created_at:"2026-07-16T14:13:16Z",entry_id:273,field1:"0.51074",field2:"0",field3:"23.8",field4:"78.5",field5:"0.10288",field6:"0.81939",field7:"0" }); assert.equal(row.level, .51074); assert.equal(row.status, 0); assert.equal(row.entryId, 273); });
test("calcula estadísticas ignorando valores ausentes", () => { assert.deepEqual(stats([1,null,3,NaN]), { avg:2,min:1,max:3 }); });
