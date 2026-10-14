import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { robustTrend, MODEL, VERSION, HORIZONS } from "../backend/src/prediction.js";

export function evaluateForecast(rows, { maxMae, maxRmse, now = Date.now() } = {}) {
  if (!(maxMae > 0 && maxRmse > 0)) throw new Error("Defina umbrales de error aceptable en cm; no se inventan por defecto");
  if (!Array.isArray(rows) || !rows.length || rows.some(r => r.simulation === true)) throw new Error("Se requieren mediciones reales; no se valida con el simulador");
  const stationId = rows[0].stationId;
  if (rows.some(r => r.stationId !== stationId || !Number.isFinite(r.serverTimestamp))) throw new Error("Dataset inválido o mezcla de estaciones");
  const buckets = new Map(), unique = new Set();
  for (const row of rows) {
    const key = `${row.bootId}:${row.sequence}`;
    if (unique.has(key)) continue;
    unique.add(key);
    const time = Math.floor(row.serverTimestamp / 60000) * 60000;
    if (!buckets.has(time)) buckets.set(time, []);
    buckets.get(time).push(row);
  }
  const points = [...buckets].sort(([a], [b]) => a - b).map(([serverTimestamp, samples]) => {
    const valid = samples.filter(r => r.quality?.levelValid && Number.isFinite(r.levelCm) && Number.isFinite(r.sensorAgeMs?.level) && r.sensorAgeMs.level <= 3000);
    return { serverTimestamp, samples: samples.length, validSamples: valid.length,
      levelCm: valid.length >= 30 && valid.length / samples.length >= 0.95 ? valid.reduce((sum, r) => sum + r.levelCm, 0) / valid.length : null };
  });
  const byTime = new Map(points.map(p => [p.serverTimestamp, p]));
  const horizons = {};
  for (const horizon of HORIZONS) {
    if (horizon > 30) { horizons[horizon] = { validated: false, reason: "Requiere un modelo entrenado y validación propia", mae: null, rmse: null }; continue; }
    const errors = [];
    let lastOrigin = 0;
    for (let i = 30; i < points.length; i++) {
      const origin = points[i].serverTimestamp;
      if (origin - lastOrigin < horizon * 60000) continue; // Orígenes sin solapamiento por horizonte.
      const train = points.slice(i - 30, i);
      const target = byTime.get(origin + horizon * 60000);
      if (!target || target.levelCm === null || train.some(p => p.levelCm === null) || train.at(-1).serverTimestamp - train[0].serverTimestamp !== 29 * 60000) continue;
      const trend = robustTrend(train);
      const estimate = trend.intercept + trend.slope * ((origin - trend.origin) / 60000 + horizon);
      errors.push({ origin, targetAt: target.serverTimestamp, error: estimate - target.levelCm });
      lastOrigin = origin;
    }
    // Primera mitad calibra intervalos; segunda mitad es evaluación temporal retenida.
    const split = Math.floor(errors.length / 2);
    const calibration = errors.slice(0, split), holdout = errors.slice(split);
    if (calibration.length < 30 || holdout.length < 30) {
      horizons[horizon] = { validated: false, reason: "Mínimo 30 orígenes de calibración y 30 de evaluación", samples: holdout.length, mae: null, rmse: null, bias: null, coverage: null }; continue;
    }
    const residuals = calibration.map(e => Math.abs(e.error)).sort((a, b) => a - b);
    const intervalHalfWidthCm = residuals[Math.min(residuals.length - 1, Math.ceil((residuals.length + 1) * 0.9) - 1)];
    const mean = fn => holdout.reduce((sum, e) => sum + fn(e.error), 0) / holdout.length;
    const mae = mean(Math.abs), rmse = Math.sqrt(mean(e => e * e)), bias = mean(e => e);
    const coverage = mean(e => Number(Math.abs(e) <= intervalHalfWidthCm));
    horizons[horizon] = { validated: mae <= maxMae && rmse <= maxRmse && coverage >= 0.8,
      mae, rmse, bias, coverage, intervalHalfWidthCm, maxMae, maxRmse, samples: holdout.length,
      calibrationSamples: calibration.length, calibrationEnd: calibration.at(-1).targetAt, evaluationStart: holdout[0].origin, evaluationEnd: holdout.at(-1).targetAt };
  }
  return { model: MODEL, version: VERSION, stationId, simulation: false, evaluatedAt: now,
    method: "rolling-origin-holdout", units: "cm", inputSamples: unique.size, windowMinutes: 30,
    sourceStart: points[0]?.serverTimestamp, sourceEnd: points.at(-1)?.serverTimestamp, horizons };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, mae, rmse] = process.argv.slice(2);
  if (!input || !output) throw new Error("Uso: node tools/validate-forecast.mjs datos-reales.json validacion.json maxMAEcm maxRMSEcm");
  const report = evaluateForecast(JSON.parse(readFileSync(input, "utf8")), { maxMae: Number(mae), maxRmse: Number(rmse) });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Validación guardada. Horizontes habilitables: ${Object.entries(report.horizons).filter(([, h]) => h.validated).map(([h]) => h).join(", ") || "ninguno"}`);
}
