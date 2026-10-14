export function reading(overrides = {}) {
  return { schemaVersion: 1, stationId: "tingomaria-01", bootId: "boot-1", sequence: 1, deviceTimestamp: 0,
    levelCm: 7.42, distanceCm: 12.58, rainDetected: true, rainRaw: 2480,
    temperatureC: 28.4, humidityPct: 82.1, riseRateCmMin: 0.32, edgePredictionCm: 8.38, edgePredictionMinutes: 3,
    stateCode: 1, state: "MEDIO", rssi: -61, quality: { levelValid: true, climateValid: true },
    sensorAgeMs: { level: 20, climate: 1000, rain: 100 }, serverTimestamp: Date.now(), ...overrides };
}
