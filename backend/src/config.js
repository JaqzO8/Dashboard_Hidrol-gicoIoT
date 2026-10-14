import { readFileSync } from "node:fs";
export function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === "production";
  const url = new URL(env.MQTT_URL || "mqtt://127.0.0.1");
  if (!["mqtt:", "mqtts:"].includes(url.protocol)) throw new Error("MQTT_URL requiere mqtt:// o mqtts://");
  if (url.username || url.password) throw new Error("Use MQTT_USERNAME y MQTT_PASSWORD, no credenciales en URL");
  if (env.MQTT_PORT) url.port = env.MQTT_PORT;
  const origins = (env.CORS_ORIGIN || "http://localhost:4173,http://localhost:5173,http://127.0.0.1:4173,http://127.0.0.1:5173").split(",").map(x => x.trim());
  if (production && (url.protocol !== "mqtts:" || !env.MQTT_USERNAME || !env.MQTT_PASSWORD || origins.some(x => !x.startsWith("https://") || x.includes("*")))) throw new Error("Producción requiere MQTTS, credenciales y orígenes HTTPS explícitos");
  const database = env.DATABASE_URL || "sqlite:./data/sitpa.sqlite";
  if (!database.startsWith("sqlite:")) throw new Error("DATABASE_URL admite sqlite: en esta versión");
  return { production, mqttUrl: url.href, mqttOptions: { username: env.MQTT_USERNAME, password: env.MQTT_PASSWORD,
    ...(env.MQTT_CA_FILE ? { ca: readFileSync(env.MQTT_CA_FILE) } : {}), rejectUnauthorized: true },
    databasePath: database.slice(7), port: Number(env.PORT || 8787), host: env.HOST || "127.0.0.1", origins,
    stationIds: (env.STATION_IDS || "tingomaria-01,sim-tingomaria-01").split(","),
    liveMs: Number(env.LIVE_THRESHOLD_MS || 3000), staleMs: Number(env.STALE_THRESHOLD_MS || 10000),
    validationFile: env.FORECAST_VALIDATION_FILE || "", rawRetentionDays: Number(env.RAW_RETENTION_DAYS || 7) };
}
