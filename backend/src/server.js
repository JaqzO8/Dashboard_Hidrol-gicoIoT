import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import mqtt from "mqtt";
import { TelemetryStore } from "./database.js";
import { validateTelemetry, STATION_PATTERN } from "./validation.js";
import { configFromEnv } from "./config.js";
import { PredictionService, unavailableForecast } from "./prediction.js";

export async function createBackend(config, dependencies = {}) {
  if (!(config.liveMs > 0 && config.staleMs > config.liveMs)) throw new Error("Umbrales de freshness inválidos");
  const store = dependencies.store || new TelemetryStore(config.databasePath);
  const predictions = dependencies.predictions || new PredictionService({ validationFile: config.validationFile, liveMs: config.liveMs });
  const statuses = new Map();
  const disconnectedStations = new Set();
  let brokerConnected = false, databaseHealthy = true, closed = false;
  const audit = (type, station = null, data = {}) => {
    try { store.audit(type, station, data); } catch { databaseHealthy = false; console.error("SITPA: audit_storage_failure"); }
  };
  const origins = new Set(config.origins);
  const allowedStations = new Set(config.stationIds);
  const stationAllowed = id => STATION_PATTERN.test(id) && allowedStations.has(id);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  function broadcast(message, station) {
    const encoded = JSON.stringify(message);
    for (const ws of wss.clients) {
      if (station && ws.station !== station) continue;
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > 256000) { ws.close(1013, "Slow consumer"); continue; }
      ws.send(encoded);
    }
  }
  function status(station, now = Date.now()) {
    const tracked = statuses.get(station);
    const latest = store.latest(station);
    const ageMs = latest ? Math.max(0, now - latest.serverTimestamp) : null;
    return { stationId: station, brokerConnected, stationOnline: brokerConnected && tracked?.online === true && now - tracked.at < 30000,
      telemetry: ageMs === null || ageMs > config.staleMs ? "missing" : ageMs > config.liveMs ? "delayed" : "live",
      ageMs, lastTelemetryAt: latest?.serverTimestamp ?? null, liveMs: config.liveMs, staleMs: config.staleMs };
  }
  function forecast(station, latest = store.latest(station)) {
    if (!brokerConnected || !databaseHealthy) return unavailableForecast("Comunicación o almacenamiento no disponible", latest);
    try {
      return predictions.generate(latest, store.predictionWindow(station, Date.now() - 120 * 60000));
    } catch {
      audit("prediction_failure", station);
      return unavailableForecast("Fallo del modelo", latest);
    }
  }
  const sendJson = (res, code, value) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(value));
  };
  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return sendJson(res, 403, { error: "origin_not_allowed" });
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET"); return sendJson(res, 204, null); }
    if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/healthz") {
        try { databaseHealthy = store.healthy(); } catch { databaseHealthy = false; }
        return sendJson(res, databaseHealthy && brokerConnected ? 200 : 503, { service: "SITPA", database: databaseHealthy, mqtt: brokerConnected });
      }
      const match = url.pathname.match(/^\/api\/v1\/stations\/([a-z0-9-]+)\/(latest|history|status|forecast)$/);
      if (!match || !stationAllowed(match[1])) return sendJson(res, 404, { error: "not_found" });
      const [, station, action] = match;
      if (action === "latest") return sendJson(res, 200, { reading: store.latest(station) });
      if (action === "status") return sendJson(res, 200, status(station));
      if (action === "forecast") return sendJson(res, 200, forecast(station));
      const getNumber = (key, fallback) => url.searchParams.has(key) ? Number(url.searchParams.get(key)) : fallback;
      const options = { limit: getNumber("limit", 100), from: getNumber("from", 0), to: getNumber("to", Date.now()),
        before: getNumber("before", Number.MAX_SAFE_INTEGER), resolution: url.searchParams.get("resolution") || "raw" };
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500 ||
        ![options.from, options.to, options.before].every(x => Number.isSafeInteger(x) && x >= 0) || options.from > options.to ||
        !["raw", "1m", "5m", "1h"].includes(options.resolution)) return sendJson(res, 400, { error: "invalid_history_query" });
      return sendJson(res, 200, store.history(station, options));
    } catch { databaseHealthy = false; return sendJson(res, 503, { error: "storage_unavailable" }); }
  });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    const station = url.searchParams.get("stationId");
    const limit = Number(url.searchParams.get("limit") || 100);
    if (url.pathname !== "/ws" || !origins.has(req.headers.origin) || !stationAllowed(station || "") || !Number.isInteger(limit) || limit < 1 || limit > 500 || wss.clients.size >= 100) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.station = station; ws.alive = true;
      ws.on("pong", () => { ws.alive = true; });
      ws.on("error", () => {});
      try {
        ws.send(JSON.stringify({ type: "snapshot", stationId: station, rows: store.history(station, { limit }).rows, status: status(station), forecast: forecast(station) }));
      } catch { ws.send(JSON.stringify({ type: "error", error: "storage_unavailable" })); }
    });
  });
  const client = dependencies.mqttClient || mqtt.connect(config.mqttUrl, {
    ...config.mqttOptions, reconnectPeriod: 1000, connectTimeout: 5000, clean: true, queueQoSZero: false,
    clientId: `sitpa-backend-${crypto.randomUUID()}`, resubscribe: true,
  });
  client.on("connect", () => {
    client.subscribe(["telemetry", "state", "alert", "status"].map(kind => `sitpa/v1/stations/+/${kind}`), { qos: 1 }, error => {
      brokerConnected = !error;
      audit(error ? "mqtt_subscription_failure" : "mqtt_connected");
      broadcast({ type: "backend", brokerConnected });
    });
  });
  client.on("close", () => {
    if (!brokerConnected) return;
    brokerConnected = false; statuses.clear(); audit("mqtt_disconnected");
    broadcast({ type: "backend", brokerConnected });
    for (const station of allowedStations) broadcast({ type: "forecast", stationId: station, forecast: unavailableForecast("Broker desconectado") }, station);
  });
  client.on("error", () => { /* Evitar credenciales/URLs en logs; close gestiona el estado. */ });
  client.on("message", (topic, payload, packet) => {
    const match = topic.match(/^sitpa\/v1\/stations\/([a-z0-9-]+)\/(telemetry|state|alert|status)$/);
    if (!match || !stationAllowed(match[1]) || payload.length > 8192) return;
    const [, station, kind] = match;
    if (kind === "status") {
      const value = payload.toString();
      if (!["online", "offline"].includes(value)) { audit("message_rejected", station, { reason: "invalid_status" }); return; }
      // Un online retenido puede ser de una conexión muerta antes de reiniciar el broker.
      if (packet.retain && value === "online") return;
      const previous = statuses.get(station)?.online;
      statuses.set(station, { online: value === "online", at: Date.now() });
      if (value === "online") disconnectedStations.delete(station);
      if (previous !== (value === "online")) audit(value === "online" ? "station_reconnected" : "station_disconnected", station);
      try { broadcast({ type: "status", status: status(station) }, station); } catch { databaseHealthy = false; }
      return;
    }
    if (packet.retain) return; // Nunca rejuvenecer telemetría/alertas históricas retenidas.
    let reading;
    try {
      reading = validateTelemetry(JSON.parse(payload.toString()), station);
      if (config.production && reading.simulation) throw new Error("simulation_forbidden");
    } catch (error) { audit("message_rejected", station, { reason: error instanceof SyntaxError ? "invalid_json" : error.message }); return; }
    if (kind !== "telemetry") { audit(kind, station, { stateCode: reading.stateCode, sequence: reading.sequence }); return; }
    reading.serverTimestamp = Date.now();
    // Un mensaje con reloj válido antiguo no cuenta como telemetría recién medida.
    if (reading.deviceTimestamp && reading.serverTimestamp - reading.deviceTimestamp > config.staleMs) { audit("stale_message_rejected", station); return; }
    try {
      const previous = store.latest(station);
      const saved = store.save(reading);
      if (!saved) { audit("duplicate_or_out_of_order", station); return; }
      databaseHealthy = true;
      statuses.set(station, { online: true, at: Date.now() });
      disconnectedStations.delete(station);
      if (previous?.stateCode !== saved.stateCode) audit("state_changed", station, { from: previous?.stateCode ?? null, to: saved.stateCode });
      if (saved.stateCode >= 2 && previous?.stateCode !== saved.stateCode) audit("alert", station, { stateCode: saved.stateCode });
      const prediction = forecast(station, saved);
      if (prediction.horizons.some(h => h.available)) audit("forecast_generated", station, { model: prediction.model, version: prediction.version });
      broadcast({ type: "telemetry", stationId: station, reading: saved, status: status(station), forecast: prediction }, station);
    } catch {
      databaseHealthy = false; console.error("SITPA: telemetry_storage_failure");
      broadcast({ type: "error", error: "storage_unavailable" });
    }
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  }, 15000);
  const freshness = setInterval(() => {
    for (const [station, tracked] of statuses) {
      if (tracked.online && Date.now() - tracked.at >= 30000 && !disconnectedStations.has(station)) {
        disconnectedStations.add(station); audit("station_disconnected", station, { reason: "heartbeat_timeout" });
      }
    }
    for (const station of new Set([...wss.clients].map(ws => ws.station))) {
      try {
        const current = status(station);
        broadcast({ type: "status", status: current }, station);
        if (current.telemetry !== "live") broadcast({ type: "forecast", stationId: station, forecast: unavailableForecast("Telemetría desactualizada", store.latest(station)) }, station);
      } catch { databaseHealthy = false; }
    }
  }, 1000);
  const retention = setInterval(() => { try { store.prune(config.rawRetentionDays); } catch { databaseHealthy = false; } }, 3600000);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(config.port, config.host, resolve); });
  return { server, store, client, address: server.address(), status,
    async close() {
      if (closed) return; closed = true;
      clearInterval(heartbeat); clearInterval(freshness); clearInterval(retention);
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      await client.endAsync(true);
      await new Promise(resolve => server.close(resolve));
      store.close();
    } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backend = await createBackend(configFromEnv());
  console.log(`SITPA backend: http://${backend.address.address}:${backend.address.port}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await backend.close(); process.exit(0); });
}
