import mqtt from "mqtt";
const stationId = process.env.STATION_ID || "sim-tingomaria-01";
if (!stationId.startsWith("sim-")) throw new Error("El simulador solo publica estaciones sim-*");
const mode = process.env.SIM_MODE || "normal";
const base = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const prefix = `sitpa/v1/stations/${stationId}`;
const client = mqtt.connect(base, { clientId: `sim-${crypto.randomUUID()}`, will: { topic: `${prefix}/status`, payload: "offline", qos: 1, retain: true } });
const bootId = crypto.randomUUID();
let sequence = 0, timer;
client.on("connect", () => {
  client.publish(`${prefix}/status`, "online", { retain: true });
  clearInterval(timer);
  timer = setInterval(() => {
    sequence++;
    const levelCm = mode === "critical" ? 11 : 3 + Math.sin(sequence / 60) * 0.2;
    const row = { schemaVersion: 1, stationId, bootId, sequence, deviceTimestamp: Date.now(), uptimeMs: sequence * 1000,
      levelCm, distanceCm: 20 - levelCm, rainDetected: false, rainRaw: 3500, temperatureC: 25, humidityPct: 70,
      riseRateCmMin: 0, edgePredictionCm: levelCm, edgePredictionMinutes: 3,
      stateCode: mode === "critical" ? 3 : 0, state: mode === "critical" ? "CRITICO" : "NORMAL", rssi: -55,
      quality: { levelValid: mode !== "invalid", climateValid: true }, sensorAgeMs: { level: 20, climate: 1000, rain: 100 }, simulation: true };
    client.publish(`${prefix}/telemetry`, JSON.stringify(row));
    if (sequence % 10 === 0) client.publish(`${prefix}/status`, "online", { retain: true });
  }, 1000);
});
client.on("error", () => console.error("Simulador: broker no disponible"));
console.log(`SIMULACIÓN EXPLÍCITA: ${stationId}, modo=${mode}, objetivo=1 Hz. No son mediciones.`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  clearInterval(timer); await client.publishAsync(`${prefix}/status`, "offline", { retain: true }); await client.endAsync(); process.exit(0);
});
