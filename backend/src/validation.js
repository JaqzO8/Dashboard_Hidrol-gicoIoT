export const STATES = ["NORMAL", "MEDIO", "ALTO", "CRITICO"];
export const STATION_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const numericFields = {
  levelCm: [0, 100000], distanceCm: [0, 100000], temperatureC: [-50, 100],
  humidityPct: [0, 100], riseRateCmMin: [-100000, 100000], edgePredictionCm: [-1000000, 1000000],
};
export function validateTelemetry(input, stationId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_object");
  if (input.schemaVersion !== 1 || input.stationId !== stationId || !STATION_PATTERN.test(stationId)) throw new Error("invalid_station_or_version");
  for (const field of ["sequence", "deviceTimestamp"]) {
    if (!Number.isSafeInteger(input[field]) || input[field] < 0) throw new Error(`invalid_${field}`);
  }
  if (input.deviceTimestamp > Date.now() + 60000) throw new Error("future_device_timestamp");
  const bootId = input.bootId ?? "legacy";
  if (typeof bootId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(bootId)) throw new Error("invalid_boot_id");
  if (!Number.isInteger(input.stateCode) || STATES[input.stateCode] !== input.state) throw new Error("invalid_state");
  if (typeof input.rainDetected !== "boolean" || !Number.isInteger(input.rainRaw) || input.rainRaw < 0 || input.rainRaw > 4095) throw new Error("invalid_rain");
  if (input.edgePredictionMinutes !== 3) throw new Error("invalid_edge_horizon");
  const result = { schemaVersion: 1, stationId, bootId, sequence: input.sequence, deviceTimestamp: input.deviceTimestamp,
    stateCode: input.stateCode, state: input.state, rainDetected: input.rainDetected, rainRaw: input.rainRaw, edgePredictionMinutes: 3 };
  for (const [field, [min, max]] of Object.entries(numericFields)) {
    const value = input[field];
    if (value !== null && (!Number.isFinite(value) || value < min || value > max)) throw new Error(`invalid_${field}`);
    result[field] = value;
  }
  if (input.rssi !== undefined && (!Number.isFinite(input.rssi) || input.rssi > 0 || input.rssi < -127)) throw new Error("invalid_rssi");
  result.rssi = input.rssi ?? null;
  result.uptimeMs = Number.isSafeInteger(input.uptimeMs) && input.uptimeMs >= 0 ? input.uptimeMs : null;
  result.quality = { levelValid: false, climateValid: false };
  result.sensorAgeMs = { level: null, climate: null, rain: null };
  // Sin información de calidad no se habilita una predicción.
  for (const key of ["levelValid", "climateValid"]) {
    if (input.quality?.[key] !== undefined && typeof input.quality[key] !== "boolean") throw new Error("invalid_quality");
    result.quality[key] = input.quality?.[key] === true;
  }
  for (const key of ["level", "climate", "rain"]) {
    const age = input.sensorAgeMs?.[key];
    if (age !== undefined && (!Number.isSafeInteger(age) || age < 0)) throw new Error("invalid_sensor_age");
    result.sensorAgeMs[key] = age ?? null;
  }
  if (result.quality.levelValid && (result.levelCm === null || result.distanceCm === null || result.sensorAgeMs.level === null)) throw new Error("inconsistent_level_quality");
  result.simulation = input.simulation === true;
  return result;
}
