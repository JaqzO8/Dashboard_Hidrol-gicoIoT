import { readFileSync } from "node:fs";
export const HORIZONS = [5, 15, 30, 60, 120, 180, 240, 300];
export const MODEL = "Trend Baseline", VERSION = "1.0.0";
export const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted[middle] + sorted[sorted.length % 2 ? middle : middle - 1]) / 2 : null;
};
// Theil–Sen sobre agregados de un minuto. Una diferencia de dos puntos no basta.
export function robustTrend(rows) {
  const points = rows.filter(r => Number.isFinite(r.levelCm));
  if (points.length < 3) throw new Error("insufficient_trend_points");
  const origin = points.at(-1).serverTimestamp;
  const slopes = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const dt = (points[j].serverTimestamp - points[i].serverTimestamp) / 60000;
    if (dt > 0) slopes.push((points[j].levelCm - points[i].levelCm) / dt);
  }
  const slope = median(slopes);
  if (!Number.isFinite(slope)) throw new Error("invalid_trend");
  const intercept = median(points.map(p => p.levelCm - slope * (p.serverTimestamp - origin) / 60000));
  return { slope, intercept, origin };
}
export function canPublishForecast({ horizon, modelValidated, sufficientHistory, recentTelemetry, sensorQuality, validationError }) {
  return [5, 15, 30].includes(horizon) && modelValidated === true && sufficientHistory === true && recentTelemetry === true && sensorQuality === true &&
    !!validationError && Number.isFinite(validationError.mae) && Number.isFinite(validationError.rmse) &&
    Number.isFinite(validationError.bias) && Number.isFinite(validationError.coverage) &&
    validationError.samples >= 30 && validationError.mae <= validationError.maxMae &&
    validationError.rmse <= validationError.maxRmse && validationError.coverage >= 0.8 && validationError.coverage <= 1;
}
export function unavailableForecast(reason, latest = null, now = Date.now()) {
  return { model: MODEL, version: VERSION, generatedAt: now, sourceTimestamp: latest?.serverTimestamp ?? null,
    currentLevelCm: latest?.levelCm ?? null, edge: { available: false, horizonMinutes: 3, reason },
    riseRateRaw: latest?.riseRateCmMin ?? null, riseRateSmoothed: null,
    dataUsed: null, quality: "insuficiente", confidence: "No evaluada", validatedHorizonMinutes: null,
    horizons: HORIZONS.map(horizonMinutes => ({ horizonMinutes, available: false, reason, model: MODEL, version: VERSION, metrics: null, confidence: "No evaluada" })) };
}
export class PredictionService {
  constructor({ validationFile = "", validation = null, liveMs = 3000 } = {}) {
    this.liveMs = liveMs;
    this.validation = validation;
    if (validationFile) {
      try { this.validation = JSON.parse(readFileSync(validationFile, "utf8")); }
      catch { this.loadError = true; }
    }
  }
  generate(latest, history, now = Date.now()) {
    if (this.loadError) throw new Error("validation_file_unavailable");
    const recent = latest && now - latest.serverTimestamp >= 0 && now - latest.serverTimestamp <= this.liveMs;
    const result = unavailableForecast(recent ? "Datos insuficientes o modelo sin validación temporal" : "Telemetría desactualizada", latest, now);
    if (!recent) return result;
    const quality = latest.quality?.levelValid === true && latest.sensorAgeMs?.level !== null && latest.sensorAgeMs?.level <= this.liveMs;
    if (!quality) {
      for (const h of result.horizons) h.reason = "Calidad del sensor insuficiente";
      result.edge.reason = "Calidad del sensor insuficiente";
      return result;
    }
    result.edge = { available: Number.isFinite(latest.edgePredictionCm), horizonMinutes: 3,
      levelCm: latest.edgePredictionCm, model: "Edge lineal", version: "1", confidence: "No validada", metrics: null,
      reason: "Extrapolación local; sin validación hidrológica", sourceTimestamp: latest.serverTimestamp };
    const rows = history.filter(r => r.serverTimestamp >= now - 31 * 60000 && r.serverTimestamp < Math.floor(now / 60000) * 60000);
    const validRows = rows.filter(r => r.validSamples >= 30 && r.validSamples / r.samples >= 0.95 && Number.isFinite(r.levelCm));
    const sufficient = validRows.length >= 30 && validRows.at(-1).serverTimestamp - validRows[0].serverTimestamp >= 29 * 60000;
    result.dataUsed = { from: validRows[0]?.serverTimestamp ?? null, to: validRows.at(-1)?.serverTimestamp ?? null, points: validRows.length, windowMinutes: 30 };
    result.quality = sufficient ? "suficiente" : "histórico insuficiente";
    const trend = validRows.length >= 3 ? robustTrend(validRows) : null;
    result.riseRateSmoothed = trend?.slope ?? null;
    for (const horizon of result.horizons) {
      const h = horizon.horizonMinutes;
      if (h > 30) { horizon.reason = "Modelo entrenado y validación individual no disponibles"; continue; }
      const v = this.validation;
      const entry = v?.horizons?.[h];
      const validated = v?.model === MODEL && v?.version === VERSION && v?.stationId === latest.stationId &&
        v?.simulation === false && latest.simulation !== true && v?.method === "rolling-origin-holdout" &&
        Number.isFinite(v?.evaluatedAt) && now >= v.evaluatedAt && now - v.evaluatedAt < 30 * 86400000 &&
        entry?.validated === true && Number.isFinite(entry?.intervalHalfWidthCm) && entry.intervalHalfWidthCm >= 0;
      if (!canPublishForecast({ horizon: h, modelValidated: validated, sufficientHistory: sufficient, recentTelemetry: recent, sensorQuality: quality, validationError: entry })) continue;
      const value = trend.intercept + trend.slope * ((now - trend.origin) / 60000 + h);
      if (!Number.isFinite(value) || value < 0) { horizon.reason = "Proyección fuera del dominio físico"; continue; }
      Object.assign(horizon, { available: true, reason: null, levelCm: value,
        lowerCm: Math.max(0, value - entry.intervalHalfWidthCm), upperCm: value + entry.intervalHalfWidthCm,
        metrics: { mae: entry.mae, rmse: entry.rmse, bias: entry.bias, coverage: entry.coverage, samples: entry.samples },
        confidence: "Validación empírica", intervalLabel: "Rango empírico; no es garantía" });
    }
    const enabled = result.horizons.filter(h => h.available);
    result.validatedHorizonMinutes = enabled.length ? Math.max(...enabled.map(h => h.horizonMinutes)) : null;
    result.confidence = enabled.length ? "Validación empírica por horizonte" : "No evaluada";
    return result;
  }
}
