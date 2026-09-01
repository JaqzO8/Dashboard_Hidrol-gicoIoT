const THINGSPEAK_API = "https://api.thingspeak.com";
const REQUEST_TIMEOUT_MS = 10000;

function feedEndpoint(channel, suffix) {
  if (!/^\d+$/.test(String(channel))) throw new Error("El ID del canal debe contener solo números");
  return new URL(`/channels/${encodeURIComponent(channel)}/feeds/${suffix}`, THINGSPEAK_API);
}

function withApiKey(url, apiKey) {
  if (apiKey?.trim()) url.searchParams.set("api_key", apiKey.trim());
  return url;
}

export function buildFeedUrl(channel, results, apiKey = "") {
  const url = new URL(`/channels/${encodeURIComponent(channel)}/feeds.json`, THINGSPEAK_API);
  url.searchParams.set("results", String(Math.min(8000, Math.max(1, Number(results) || 100))));
  return withApiKey(url, apiKey).toString();
}

export function buildLatestFeedUrl(channel, apiKey = "") {
  return withApiKey(feedEndpoint(channel, "last.json"), apiKey).toString();
}

export function buildIncrementalFeedUrl(channel, lastEntryId, apiKey = "") {
  const url = new URL(`/channels/${encodeURIComponent(channel)}/feeds.json`, THINGSPEAK_API);
  if (lastEntryId) {
    url.searchParams.set("start", String(Number(lastEntryId) + 1));
  }
  return withApiKey(url, apiKey).toString();
}

export function buildFieldUrl(channel, fieldNumber, results = 100, apiKey = "") {
  const url = new URL(`/channels/${encodeURIComponent(channel)}/fields/${encodeURIComponent(fieldNumber)}.json`, THINGSPEAK_API);
  url.searchParams.set("results", String(Math.min(8000, Math.max(1, Number(results) || 100))));
  return withApiKey(url, apiKey).toString();
}

export function buildStatusUrl(channel, apiKey = "") {
  const url = new URL(`/channels/${encodeURIComponent(channel)}/status.json`, THINGSPEAK_API);
  return withApiKey(url, apiKey).toString();
}

async function getJson(url, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: combined,
  });
  if (!response.ok) throw new Error(`ThingSpeak respondió ${response.status}`);
  return response.json();
}

export function fetchSnapshot({ channel, results, apiKey }, signal) {
  return getJson(buildFeedUrl(channel, results, apiKey), signal);
}

export function fetchLatest({ channel, apiKey }, signal) {
  return getJson(buildLatestFeedUrl(channel, apiKey), signal);
}

export function fetchIncremental({ channel, lastEntryId, apiKey }, signal) {
  return getJson(buildIncrementalFeedUrl(channel, lastEntryId, apiKey), signal);
}

export function fetchField({ channel, fieldNumber, results, apiKey }, signal) {
  return getJson(buildFieldUrl(channel, fieldNumber, results, apiKey), signal);
}

export function fetchStatus({ channel, apiKey }, signal) {
  return getJson(buildStatusUrl(channel, apiKey), signal);
}

