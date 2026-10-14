import test from "node:test";
import assert from "node:assert/strict";
import { PredictionService, robustTrend, canPublishForecast, MODEL, VERSION, HORIZONS } from "../backend/src/prediction.js";
import { reading } from "./fixtures.mjs";
import { evaluateForecast } from "../tools/validate-forecast.mjs";
const now = 1800000000000;
const history = Array.from({ length: 30 }, (_, i) => ({ serverTimestamp: now - (30 - i) * 60000, levelCm: 1 + i * 0.01, samples: 60, validSamples: 60 }));
const evidence = { mae: 0.1, rmse: 0.15, bias: 0.01, coverage: 0.9, samples: 50, maxMae: 0.2, maxRmse: 0.3, intervalHalfWidthCm: 0.2, validated: true };
const validation = { model: MODEL, version: VERSION, stationId: "tingomaria-01", evaluatedAt: now - 10000, simulation: false, method: "rolling-origin-holdout", horizons: { 5: evidence, 15: evidence, 30: evidence } };
test("Theil–Sen resiste un pico aislado", () => {
  const contaminated = history.map((row, i) => ({ ...row, levelCm: i === 10 ? 100 : row.levelCm }));
  assert.ok(Math.abs(robustTrend(contaminated).slope - 0.01) < 1e-9);
});
test("sin evidencia todos los horizontes quedan bloqueados; edge se identifica aparte", () => {
  const result = new PredictionService().generate(reading({ serverTimestamp: now }), history, now);
  assert.equal(result.edge.available, true); assert.equal(result.edge.confidence, "No validada");
  assert.deepEqual(result.horizons.map(x => x.horizonMinutes), HORIZONS);
  assert.ok(result.horizons.every(x => !x.available && x.metrics === null));
});
test("habilitación individual solo con evidencia, histórico y calidad", () => {
  const service = new PredictionService({ validation });
  const row = reading({ serverTimestamp: now });
  const result = service.generate(row, history, now);
  assert.deepEqual(result.horizons.filter(h => h.available).map(h => h.horizonMinutes), [5, 15, 30]);
  assert.equal(result.validatedHorizonMinutes, 30);
  assert.ok(service.generate(row, history.slice(15), now).horizons.every(h => !h.available));
  assert.ok(service.generate({ ...row, simulation: true }, history, now).horizons.every(h => !h.available));
  assert.ok(service.generate({ ...row, quality: { levelValid: false } }, history, now).horizons.every(h => !h.available));
});
test("telemetría retrasada retira también edge y no reutiliza una predicción", () => {
  const result = new PredictionService({ validation }).generate(reading({ serverTimestamp: now - 4000 }), history, now);
  assert.equal(result.edge.available, false); assert.ok(result.horizons.every(h => !h.available));
  assert.match(result.horizons[0].reason, /desactualizada/);
});
test("no habilita métricas faltantes ni horizontes de 1–5 horas", () => {
  for (const horizon of HORIZONS) {
    assert.ok(!canPublishForecast({ horizon, modelValidated: true, sufficientHistory: true, recentTelemetry: true, sensorQuality: true, validationError: {} }));
    if (horizon >= 60) assert.ok(!canPublishForecast({ horizon, modelValidated: true, sufficientHistory: true, recentTelemetry: true, sensorQuality: true, validationError: evidence }));
  }
});

test("el evaluador rechaza simulación y exige límites de error explícitos", () => {
  assert.throws(() => evaluateForecast([reading({ simulation: true })], { maxMae: 1, maxRmse: 1 }), /simulador/);
  assert.throws(() => evaluateForecast([reading()]), /umbrales/);
  const result = evaluateForecast([reading()], { maxMae: 1, maxRmse: 1 });
  assert.ok(Object.values(result.horizons).every(h => !h.validated));
});

test("evaluación temporal calcula métricas separadas sin habilitar 1–5 h", () => {
  // Fixture matemática exclusivamente para probar el evaluador. Nunca se guarda ni se instala como evidencia real.
  const rows = [];
  for (let minute = 0; minute < 2000; minute++) for (let sample = 0; sample < 30; sample++) {
    rows.push(reading({ sequence: rows.length + 1, serverTimestamp: now - (2000 - minute) * 60000 + sample * 1000,
      levelCm: 2 + minute * 0.0001 + Math.sin(minute / 20) * 0.01 }));
  }
  const result = evaluateForecast(rows, { maxMae: 0.2, maxRmse: 0.3, now });
  for (const horizon of [5, 15, 30]) {
    const metrics = result.horizons[horizon];
    assert.ok(Number.isFinite(metrics.mae)); assert.ok(Number.isFinite(metrics.rmse));
    assert.ok(Number.isFinite(metrics.bias)); assert.ok(metrics.coverage >= 0 && metrics.coverage <= 1);
    assert.ok(metrics.samples >= 30); assert.ok(metrics.evaluationStart >= metrics.calibrationEnd);
  }
  for (const horizon of [60, 120, 180, 240, 300]) assert.equal(result.horizons[horizon].validated, false);
});

test("archivo de validación ausente falla dentro del servicio sin impedir su construcción", () => {
  const service = new PredictionService({ validationFile: 'nonexistent-validation-file.json' });
  assert.throws(() => service.generate(reading(), []), /validation_file_unavailable/);
});
