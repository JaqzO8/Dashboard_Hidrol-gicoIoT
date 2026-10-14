export function validateApiBase(value, pageProtocol = "http:") {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("URL de backend inválida");
  if (pageProtocol === "https:" && url.protocol !== "https:") throw new Error("Esta página requiere un backend HTTPS");
  return url.href.replace(/\/$/, "");
}
export function websocketUrl({ apiBaseUrl, stationId, results = 100 }) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(stationId)) throw new Error("ID de estación inválido");
  const url = new URL(`${validateApiBase(apiBaseUrl)}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("stationId", stationId);
  url.searchParams.set("limit", String(Math.min(500, Math.max(1, results))));
  return url.href;
}
export async function fetchHistory(config, query = {}, signal) {
  const url = new URL(`${validateApiBase(config.apiBaseUrl)}/api/v1/stations/${encodeURIComponent(config.stationId)}/history`);
  for (const [key, value] of Object.entries({ limit: config.results || 100, ...query })) if (value !== undefined && value !== "") url.searchParams.set(key, value);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new Error(`Histórico no disponible (${response.status})`);
  return response.json();
}
export function telemetryFreshness(timestamp, now = Date.now(), { liveMs = 3000, staleMs = 10000 } = {}) {
  if (!Number.isFinite(timestamp) || timestamp > now + 1000) return "missing";
  const age = Math.max(0, now - timestamp);
  return age <= liveMs ? "live" : age <= staleMs ? "delayed" : "missing";
}
