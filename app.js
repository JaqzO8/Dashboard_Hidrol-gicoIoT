import "./src/ui/shell.js";
import { PERU_RIVERS } from "./data/peru-rivers.js";
import { RealtimeFeedController } from "./src/core/realtime-feed.js";
import { fetchHistory, telemetryFreshness, validateApiBase } from "./src/services/realtime.js";
import { renderForecast } from "./src/ui/forecast.js";

const DEFAULT_STATION = "tingomaria-01";
const DEFAULT_RIVER = "Río Huallaga";
const RIVER_DETAILS = {
  "Río Huallaga": { region: "Amazonas", locality: "Huánuco, San Martín y Loreto", stationId: DEFAULT_STATION },
  "Río Amazonas": { region: "Amazonas", locality: "Loreto" },
  "Río Marañón": { region: "Amazonas", locality: "Huánuco, Áncash, Cajamarca, Amazonas y Loreto" },
  "Río Ucayali": { region: "Amazonas", locality: "Ucayali y Loreto" },
  "Río Apurímac": { region: "Amazonas", locality: "Arequipa, Cusco, Apurímac y Ayacucho" },
  "Río Urubamba": { region: "Amazonas", locality: "Cusco y Ucayali" },
  "Río Mantaro": { region: "Amazonas", locality: "Pasco, Junín, Huancavelica y Ayacucho" },
  "Río Madre de Dios": { region: "Amazonas", locality: "Madre de Dios" },
  "Río Napo": { region: "Amazonas", locality: "Loreto" },
  "Río Putumayo": { region: "Amazonas", locality: "Loreto" },
  "Río Purús": { region: "Amazonas", locality: "Ucayali" },
  "Río Tumbes": { region: "Pacífico", locality: "Tumbes" },
  "Río Chira": { region: "Pacífico", locality: "Piura" },
  "Río Piura": { region: "Pacífico", locality: "Piura" },
  "Río Jequetepeque": { region: "Pacífico", locality: "Cajamarca y La Libertad" },
  "Río Chicama": { region: "Pacífico", locality: "Cajamarca y La Libertad" },
  "Río Santa": { region: "Pacífico", locality: "Áncash y La Libertad" },
  "Río Rímac": { region: "Pacífico", locality: "Lima" },
  "Río Chillón": { region: "Pacífico", locality: "Lima" },
  "Río Cañete": { region: "Pacífico", locality: "Lima" },
  "Río Ica": { region: "Pacífico", locality: "Huancavelica e Ica" },
  "Río Ocoña": { region: "Pacífico", locality: "Ayacucho y Arequipa" },
  "Río Camaná": { region: "Pacífico", locality: "Arequipa" },
  "Río Caplina": { region: "Pacífico", locality: "Tacna" },
  "Río Ramis": { region: "Titicaca", locality: "Puno" },
  "Río Coata": { region: "Titicaca", locality: "Puno" },
  "Río Ilave": { region: "Titicaca", locality: "Puno" },
  "Río Huancané": { region: "Titicaca", locality: "Puno" },
  "Río Suches": { region: "Titicaca", locality: "Puno y Bolivia" }
};
const STATUS = {
  0: { label: "Normal", description: "Condiciones estables", className: "status-0", color: "#16A34A" },
  1: { label: "Preventivo", description: "Requiere observación", className: "status-1", color: "#D97706" },
  2: { label: "Alto", description: "Nivel alto: active el protocolo preventivo", className: "status-2", color: "#DC2626" },
  3: { label: "Crítico", description: "Atención inmediata", className: "status-3", color: "#DC2626" }
};
const $ = (id) => document.getElementById(id);
let feeds = [];
let charts = [];
let echarts, chartRevision = 0;
let liveFeed;
let alertAudioContext;
let runtimeConfig = { apiBaseUrl: "", liveMs: 3000, staleMs: 10000 };
let operationalStatus = {}, lastForecast = null, historyRows = null, historyCursor = null;
let historyAbort;
const visibleRows = () => historyRows ?? feeds;

export function deriveAlertLevel(status, level) {
  if (status >= 3 || (Number.isFinite(level) && level >= 0.10)) return "critical";
  if (status >= 2 || (Number.isFinite(level) && level >= 0.08)) return "warning";
  return null;
}

export function riverMeta(name) {
  return { name, region: "Por validar", locality: "Localidad por asignar", stationId: "", ...(RIVER_DETAILS[name] || {}) };
}

export function normalizeFeed(feed) {
  const meters = value => Number.isFinite(value) ? value / 100 : null;
  const aggregate = Number.isInteger(feed.samples);
  return { date: new Date(feed.serverTimestamp), entryId: feed.id ?? feed.serverTimestamp,
    stationId: feed.stationId, sequence: feed.sequence ?? null, bootId: feed.bootId ?? null,
    deviceTimestamp: feed.deviceTimestamp ?? null, level: meters(feed.levelCm), distance: feed.distanceCm ?? null,
    rain: aggregate ? null : typeof feed.rainDetected === "boolean" ? Number(feed.rainDetected) : null,
    rainRaw: feed.rainRaw ?? null, temp: feed.temperatureC ?? null, hum: feed.humidityPct ?? null,
    speed: feed.riseRateCmMin ?? null, prediction: meters(feed.edgePredictionCm), status: feed.stateCode,
    quality: feed.quality ?? {}, sensorAgeMs: feed.sensorAgeMs ?? {}, simulation: feed.simulation === true,
    samples: feed.samples ?? null, min: meters(feed.levelMinCm), max: meters(feed.levelMaxCm), aggregate };
}

export function stats(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return { avg: null, min: null, max: null };
  return { avg: clean.reduce((a, b) => a + b, 0) / clean.length, min: Math.min(...clean), max: Math.max(...clean) };
}

export function mergeLatestFeeds(rows, latest, limit = 100) {
  if (!Number.isFinite(latest?.entryId) || Number.isNaN(latest?.date?.getTime?.())) return rows;
  if (rows.at(-1)?.entryId === latest.entryId) return rows;
  return [...rows.filter((row) => row.entryId !== latest.entryId), latest]
    .sort((a, b) => a.entryId - b.entryId)
    .slice(-limit);
}

const fmt = (value, digits = 3) => (Number.isFinite(value) ? value.toLocaleString("es-PE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—");

const fmtDate = (date, compact = false) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    ...(compact
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { dateStyle: "short", timeStyle: "medium" })
  }).format(date);
};

const selectedRiverName = () => sessionStorage.getItem("selectedRiver") || DEFAULT_RIVER;
const customStations = () => {
  try {
    return JSON.parse(sessionStorage.getItem("sitpaRiverStations") || "{}");
  } catch {
    return {};
  }
};

const currentConfig = () => {
  const river = selectedRiverName();
  const base = riverMeta(river);
  const custom = customStations()[river] || {};
  return { river, ...base, stationId: custom.stationId || base.stationId, apiBaseUrl: sessionStorage.getItem("sitpa.apiBaseUrl") || runtimeConfig.apiBaseUrl, results: Number($("rangeSelect")?.value || 100) };
};

async function loadData(showFeedback = false) {
  const { stationId, river } = currentConfig();
  historyAbort?.abort(); historyRows = null; historyCursor = null; feeds = []; lastForecast = null; operationalStatus = {}; renderForecast(null);
  if ($("alertBanner")) $("alertBanner").hidden = true;
  renderUnavailableRiver();
  if (!stationId) {
    liveFeed?.stop();
    renderRiverContext(river);
    renderUnavailableRiver();
    return;
  }
  await liveFeed.refresh({ notify: showFeedback });
}

function renderRiverContext(name) {
  const meta = riverMeta(name);
  const configuredStation = currentConfig().stationId;
  if ($("sideRiver")) $("sideRiver").textContent = name;
  if ($("sideChannel")) $("sideChannel").textContent = configuredStation ? `Estación ${configuredStation}` : "Estación pendiente";
  if ($("heroLocation")) $("heroLocation").textContent = `📍 ${name} · ${meta.locality}`;
  if ($("heroBasin")) $("heroBasin").textContent = `◷ Región hidrográfica ${meta.region}`;
  if ($("settingsRiver")) $("settingsRiver").textContent = name;
  if ($("settingsLocality")) $("settingsLocality").textContent = `${meta.locality} · ${meta.region}`;
  if ($("riverSelect") && $("riverSelect").value !== name) $("riverSelect").value = name;
}

function renderUnavailableRiver() {
  feeds = [];
  chartRevision++;
  setConnectionState("offline", "Estación pendiente de conexión");
  if ($("levelValue")) $("levelValue").textContent = "—";
  if ($("levelTrend")) $("levelTrend").textContent = "Esperando la conexión de la estación y sus sensores";
  if ($("systemStatus")) {
    $("systemStatus").textContent = currentConfig().stationId ? "Sin telemetría" : "Sin estación";
    $("systemStatus").style.color = "#88a8b3";
  }
  if ($("statusDescription")) $("statusDescription").textContent = "Sin lecturas disponibles. La estación debe estar conectada y publicar telemetría.";
  ["kpiLevel", "kpiRain", "kpiTemp", "kpiHum", "kpiSpeed", "avgLevel", "maxLevel"].forEach((id) => {
    if ($(id)) $(id).textContent = "—";
  });
  if ($("kpiLevelDelta")) $("kpiLevelDelta").textContent = "Telemetría pendiente";
  if ($("kpiRainState")) $("kpiRainState").textContent = "Sin lectura del sensor";
  if ($("insightTitle")) $("insightTitle").textContent = "Este río está listo para incorporarse.";
  if ($("insightText")) $("insightText").textContent = "Sin lecturas disponibles. La estación debe estar conectada y publicar telemetría.";
  if ($("lastUpdated")) $("lastUpdated").textContent = "—";
  if ($("entryCount")) $("entryCount").textContent = "0 lecturas";
  if ($("downloadCsv")) $("downloadCsv").textContent = "Exportar CSV (0 lecturas)";
  if ($("recordsBody")) {
    $("recordsBody").innerHTML = '<tr><td colspan="9" class="empty">Sin lecturas disponibles. La estación debe estar conectada y publicar telemetría.</td></tr>';
  }
  renderLimnimeter(null);
  charts.forEach((instance) => instance.clear());
}

function selectRiver(name, load = true) {
  sessionStorage.setItem("selectedRiver", name);
  renderRiverContext(name);
  renderRiverDirectory($("riverSearch")?.value || "");
  if (load) loadData(true);
}

function renderRiverDirectory(query = "") {
  const normalized = query.trim().toLocaleLowerCase("es-PE");
  const selected = selectedRiverName();
  const priority = [DEFAULT_RIVER, "Río Amazonas", "Río Marañón", "Río Ucayali", "Río Rímac"];
  const matches = PERU_RIVERS
    .filter((name) => !normalized || name.toLocaleLowerCase("es-PE").includes(normalized))
    .sort((a, b) => (priority.indexOf(a) === -1 ? 99 : priority.indexOf(a)) - (priority.indexOf(b) === -1 ? 99 : priority.indexOf(b)) || a.localeCompare(b, "es-PE"))
    .slice(0, 12);
  if ($("riverResults")) {
    $("riverResults").innerHTML = matches.length
      ? matches.map((name) => {
          const meta = riverMeta(name);
          const hasStation = Boolean(meta.stationId || customStations()[name]?.stationId);
          return `<button class="river-result ${name === selected ? "active" : ""}" type="button" data-river="${name.replaceAll('"', "&quot;")}"><span><strong>${name}</strong><small>${meta.locality} · ${meta.region}</small></span><span class="station-state ${hasStation ? "live" : ""}">${hasStation ? "CONFIGURADA" : "PENDIENTE"}</span></button>`;
        }).join("")
      : '<div class="empty">No se encontraron ríos con ese nombre.</div>';
    $("riverResults").querySelectorAll("[data-river]").forEach((button) => button.addEventListener("click", () => selectRiver(button.dataset.river)));
  }
}

function initializeRiverCatalog() {
  if ($("riverCount")) $("riverCount").textContent = PERU_RIVERS.length.toLocaleString("es-PE");
  if ($("activeStationCount")) $("activeStationCount").textContent = String(1 + Object.entries(customStations()).filter(([name, station]) => name !== DEFAULT_RIVER && station?.stationId).length);
  if ($("riverSelect")) {
    $("riverSelect").innerHTML = PERU_RIVERS.map((name) => `<option value="${name.replaceAll('"', "&quot;")}">${name}${name === DEFAULT_RIVER ? " · CONFIGURADA" : ""}</option>`).join("");
    $("riverSelect").value = selectedRiverName();
  }
  renderRiverContext(selectedRiverName());
  renderRiverDirectory();
}

function setConnectionState(mode, label, detail = "") {
  const dot = $("connectionDot");
  const connectionLabel = $("connectionLabel");
  const livePill = $("livePill");

  if (dot) {
    dot.className = mode;
  }
  if (connectionLabel) {
    connectionLabel.textContent = label;
  }
  if (livePill) {
    livePill.className = `live-pill ${mode}`;
    const modeText = mode === "online" ? "EN VIVO" : mode === "delayed" ? "RETRASADO" : "NO DISPONIBLE";
    livePill.innerHTML = `<span></span> TELEMETRÍA ${modeText} ${detail ? `<small>(${detail})</small>` : ""}`;
  }
}

function checkDataFreshness() {
  const latest = feeds.at(-1);
  const freshness = telemetryFreshness(latest?.date?.getTime(), Date.now(), operationalStatus.liveMs ? operationalStatus : runtimeConfig);
  const connected = liveFeed?.connected === true;
  const configured = Boolean(currentConfig().apiBaseUrl);
  if ($("connectionNotice")) $("connectionNotice").hidden = configured;
  if ($("historyLoad")) $("historyLoad").disabled = !configured;
  if ($("serverState")) $("serverState").textContent = !configured ? "CONEXIÓN EN PREPARACIÓN" : connected ? "SERVIDOR CONECTADO" : "SERVIDOR DESCONECTADO";
  if ($("stationState")) $("stationState").textContent = connected && operationalStatus.stationOnline ? "ESTACIÓN ONLINE" : "ESTACIÓN OFFLINE / SIN CONFIRMAR";
  if ($("telemetryState")) $("telemetryState").textContent = freshness === "live" ? "TELEMETRÍA EN VIVO" : freshness === "delayed" ? "TELEMETRÍA RETRASADA" : "SIN TELEMETRÍA";
  if ($("simulationState")) $("simulationState").hidden = !latest?.simulation;
  const validSensor = latest?.quality?.levelValid === true && latest.sensorAgeMs.level <= 3000;
  const climateValid = latest?.quality?.climateValid === true && latest.sensorAgeMs.climate <= 10000;
  for (const id of ["kpiTemp", "kpiHum"]) if ($(id)) $(id).title = climateValid ? "Última medición válida" : "Último valor conservado; sensor sin lectura válida reciente";
  if (latest && $("statusDescription")) $("statusDescription").textContent = !validSensor ? "Fallo o antigüedad del sensor de nivel: se conserva el último estado recibido." : freshness !== "live" ? "Último estado recibido; telemetría desactualizada." : (STATUS[latest.status]?.description || "Estado sin catalogar");
  if ($("sensorState")) $("sensorState").textContent = latest && !validSensor ? "SENSOR DE NIVEL SIN LECTURA VÁLIDA" : "";
  setConnectionState(freshness === "live" && connected ? "online" : freshness === "delayed" ? "delayed" : "offline",
    !configured ? "Estación pendiente de conexión" : !connected ? "Reconectando al servidor" : freshness === "live" ? "Telemetría en vivo" : freshness === "delayed" ? "Telemetría retrasada" : "Sin telemetría");
  if (!connected || freshness !== "live" || !validSensor) renderForecast(null, latest, !configured ? "Estación pendiente de conexión y mediciones reales" : "Telemetría desactualizada, sensor inválido o servidor desconectado");
  else renderForecast(lastForecast, latest);
  if ((!connected || freshness !== "live") && $("alertBanner")) $("alertBanner").hidden = true;
}

function renderLimnimeter(level) {
  const gauge = $("limnimeterGauge");
  if (!gauge) return;
  if (!Number.isFinite(level)) {
    gauge.style.setProperty("--level-percent", "0%");
    if ($("limnimeterPointer")) $("limnimeterPointer").textContent = "— m";
    return;
  }
  const maxRange = 0.20; // Prototipo original: fondo a 20 cm.
  const percent = Math.min(100, Math.max(0, (level / maxRange) * 100));
  gauge.style.setProperty("--level-percent", `${percent}%`);
  if ($("limnimeterPointer")) {
    $("limnimeterPointer").textContent = `${fmt(level)} m`;
    $("limnimeterPointer").style.bottom = `${percent}%`;
  }
}

function alertsAreEnabled() {
  return localStorage.getItem("sitpa.notifications") === "enabled" && typeof Notification !== "undefined" && Notification.permission === "granted";
}

function updateNotificationStatus() {
  const status = $("notificationStatus");
  const button = $("enableAlerts");
  if (!status || !button) return;
  if (alertsAreEnabled()) {
    status.textContent = "Alertas activas: aviso visual, sonido y notificación del navegador.";
    button.textContent = "Alertas activas";
    button.disabled = true;
  } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    status.textContent = "Notificaciones bloqueadas por el navegador. Habilítalas en los permisos del sitio.";
    button.textContent = "Permiso bloqueado";
    button.disabled = true;
  }
}

function soundAlert(level) {
  try {
    alertAudioContext ||= new AudioContext();
    const oscillator = alertAudioContext.createOscillator();
    const gain = alertAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = level === "critical" ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, alertAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, alertAudioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, alertAudioContext.currentTime + 0.65);
    oscillator.connect(gain).connect(alertAudioContext.destination);
    oscillator.start();
    oscillator.stop(alertAudioContext.currentTime + 0.7);
  } catch { /* El aviso visual y la notificación siguen disponibles. */ }
}

async function sendBrowserNotification(title, body, tag) {
  if (!alertsAreEnabled()) return;
  const registration = await navigator.serviceWorker?.ready.catch(() => null);
  if (registration) {
    await registration.showNotification(title, { body, icon: "sitpa-logo.jpg", tag, renotify: true });
  } else {
    new Notification(title, { body, icon: "sitpa-logo.jpg", tag });
  }
}

function evaluateAndEmitAlert(reading) {
  if (!liveFeed?.connected || telemetryFreshness(reading.date.getTime()) !== "live" || reading.quality.levelValid !== true) return;
  const alertLevel = deriveAlertLevel(reading.status, reading.level);
  const banner = $("alertBanner");
  if (!alertLevel) {
    localStorage.removeItem("sitpa.lastAlert");
    if (banner) banner.hidden = true;
    return;
  }

  const critical = alertLevel === "critical";
  const title = critical ? "ALERTA ROJA" : "ALERTA DE NIVEL ALTO";
  const body = `${currentConfig().river}: nivel ${fmt(reading.level)} m · Entry #${reading.entryId}. ${critical ? "Atención inmediata." : "Active el protocolo preventivo."}`;
  if (banner) {
    banner.hidden = false;
    banner.className = `alert-banner ${alertLevel}`;
    if ($("alertTitle")) $("alertTitle").textContent = title;
    if ($("alertMessage")) $("alertMessage").textContent = body;
  }

  const alertKey = `${currentConfig().stationId}:${alertLevel}`;
  if (alertsAreEnabled()) {
    if (localStorage.getItem("sitpa.lastAlert") === alertKey) return;
    localStorage.setItem("sitpa.lastAlert", alertKey);
    soundAlert(alertLevel);
    sendBrowserNotification(`SITPA · ${title}`, body, alertKey).catch(() => {});
  }
}

async function enableAlerts() {
  if (typeof Notification === "undefined") {
    toast("Este navegador no admite notificaciones del sistema", true);
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    localStorage.setItem("sitpa.notifications", "enabled");
    alertAudioContext ||= new AudioContext();
    await alertAudioContext.resume();
    updateNotificationStatus();
    toast("Alertas de SITPA activadas");
    if (feeds.length) evaluateAndEmitAlert(feeds.at(-1));
  } else {
    updateNotificationStatus();
    toast("No se concedió permiso para notificaciones", true);
  }
}

function render() {
  renderRiverContext(selectedRiverName());
  if (!feeds.length) {
    renderUnavailableRiver();
    return;
  }
  const last = feeds.at(-1);
  const previous = feeds.at(-2);
  const state = STATUS[last.status] || { label: `Código ${last.status ?? "—"}`, description: "Estado sin catalogar", color: "#88a8b3" };
  const delta = previous && Number.isFinite(last.level) && Number.isFinite(previous.level) ? last.level - previous.level : null;

  if ($("levelValue")) $("levelValue").textContent = fmt(last.level);
  if ($("levelTrend")) $("levelTrend").textContent = delta === null ? "Sin lectura anterior" : `${delta >= 0 ? "↑" : "↓"} ${fmt(Math.abs(delta))} m respecto a lectura previa`;
  if ($("systemStatus")) {
    $("systemStatus").textContent = state.label;
    $("systemStatus").style.color = state.color;
  }
  if ($("statusDescription")) $("statusDescription").textContent = state.description;

  if ($("kpiLevel")) $("kpiLevel").textContent = `${fmt(last.level)} m`;
  if ($("kpiLevelDelta")) $("kpiLevelDelta").textContent = delta === null ? "Sin comparación" : `${delta >= 0 ? "+" : ""}${fmt(delta)} m en última lectura`;

  if ($("kpiRain")) $("kpiRain").textContent = last.rain === 1 ? "Detectada" : last.rain === 0 ? "Sin lluvia" : "—";
  if ($("kpiRainState")) $("kpiRainState").textContent = last.rain !== null && last.rain > 0 ? "Evento detectado" : last.rain === 0 ? "Sin lluvia" : "Sin dato";

  if ($("kpiTemp")) $("kpiTemp").textContent = Number.isFinite(last.temp) ? `${fmt(last.temp, 1)} °C` : "—";
  if ($("kpiHum")) $("kpiHum").textContent = Number.isFinite(last.hum) ? `${fmt(last.hum, 1)} %` : "—";
  if ($("kpiSpeed")) $("kpiSpeed").textContent = Number.isFinite(last.speed) ? `${fmt(last.speed)} cm/min` : "—";

  if ($("lastUpdated")) {
    $("lastUpdated").textContent = fmtDate(last.date);
    $("lastUpdated").title = `UTC: ${last.date.toISOString()} | Entry ID: ${last.entryId}`;
  }
  if ($("entryCount")) $("entryCount").textContent = `${feeds.length} lecturas`;
  if ($("downloadCsv")) $("downloadCsv").textContent = `Exportar CSV (${visibleRows().length} registros)`;

  const levelStats = stats(feeds.map((f) => f.level));
  if ($("avgLevel")) $("avgLevel").textContent = `${fmt(levelStats.avg)} m`;
  if ($("maxLevel")) $("maxLevel").textContent = `${fmt(levelStats.max)} m`;

  const spread = levelStats.max !== null && levelStats.min !== null ? levelStats.max - levelStats.min : 0;
  if ($("insightTitle")) {
    $("insightTitle").textContent = state.label === "Crítico" ? "La estación exige atención inmediata." : spread > 5 ? "El nivel presenta alta variación." : "Resumen de las mediciones observadas.";
  }
  if ($("insightText")) {
    $("insightText").textContent = `En la ventana analizada de ${feeds.length} lecturas, el nivel osciló entre ${fmt(levelStats.min)} m y ${fmt(levelStats.max)} m. El último registro corresponde al Entry #${last.entryId} (${fmtDate(last.date)}).`;
  }

  renderLimnimeter(last.level);
  evaluateAndEmitAlert(last);
  checkDataFreshness();
  renderCharts();
  renderTable();
}

function baseChartOptions() {
  return {
    animationDuration: 650,
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: "#64748B" },
    grid: { left: 45, right: 20, top: 34, bottom: 40 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#FFFFFF",
      borderColor: "#CBD5E1",
      extraCssText: "box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);",
      textStyle: { color: "#0F172A", fontSize: 11, fontFamily: "Inter, system-ui, sans-serif" }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: visibleRows().map((f) => fmtDate(f.date, true)),
      axisLine: { lineStyle: { color: "#CBD5E1" } },
      axisLabel: { color: "#64748B", fontSize: 9, hideOverlap: true, fontFamily: "Inter, system-ui, sans-serif" },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: { lineStyle: { color: "#E2E8F0" } },
      axisLabel: { color: "#64748B", fontSize: 9, fontFamily: "Inter, system-ui, sans-serif" }
    }
  };
}

function lineSeries(name, data, color, area = true) {
  return {
    name,
    type: "line",
    data,
    smooth: 0.28,
    showSymbol: false,
    connectNulls: false,
    lineStyle: { width: 2, color },
    itemStyle: { color },
    areaStyle: area
      ? {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: `${color}00` }
            ]
          }
        }
      : undefined
  };
}

function chart(id, options) {
  const el = $(id);
  if (!el) return;
  let instance = echarts.getInstanceByDom(el);
  if (!instance) {
    instance = echarts.init(el);
    charts.push(instance);
  }
  instance.setOption(options, true);
}

async function renderCharts() {
  const revision = ++chartRevision;
  if (!["levelChart", "predictionChart", "speedChart", "climateChart", "eventsChart"].some(id => $(id))) return;
  try { echarts ||= (await import("./src/ui/charts.js")).echarts; }
  catch { if (revision === chartRevision) toast("No se pudieron cargar los gráficos. Recarga la página.", true); return; }
  if (revision !== chartRevision) return;
  chart("levelChart", { ...baseChartOptions(), series: [lineSeries("Nivel", visibleRows().map((f) => f.level), "#0284C7")] });
  chart("predictionChart", { ...baseChartOptions(), series: [lineSeries("Proyección edge +3 min (m)", visibleRows().map((f) => f.prediction), "#D97706")] });
  chart("speedChart", { ...baseChartOptions(), series: [lineSeries("Velocidad (cm/min)", visibleRows().map((f) => f.speed), "#16A34A")] });

  const climate = baseChartOptions();
  climate.legend = { data: ["Temperatura", "Humedad"], textStyle: { color: "#64748B", fontSize: 10 }, top: 4 };
  climate.yAxis = [
    { ...climate.yAxis, name: "°C", nameTextStyle: { color: "#64748B" } },
    { ...climate.yAxis, name: "%", nameTextStyle: { color: "#64748B" } }
  ];
  climate.series = [
    lineSeries("Temperatura", visibleRows().map((f) => f.temp), "#EA580C", false),
    { ...lineSeries("Humedad", visibleRows().map((f) => f.hum), "#0284C7", false), yAxisIndex: 1 }
  ];
  chart("climateChart", climate);

  const events = baseChartOptions();
  events.xAxis.boundaryGap = true;
  events.yAxis = {
    type: "value",
    min: 0,
    max: 3,
    interval: 1,
    axisLabel: { color: "#64748B", fontSize: 9, formatter: (value) => STATUS[value]?.label || value },
    splitLine: { lineStyle: { color: "#E2E8F0" } }
  };
  events.series = [
    {
      name: "Estado",
      type: "bar",
      data: visibleRows().map((f) => ({
        value: f.status,
        itemStyle: { color: (STATUS[f.status] || STATUS[0]).color, borderRadius: [4, 4, 0, 0] }
      })),
      barMaxWidth: 10
    }
  ];
  chart("eventsChart", events);
}

function renderTable() {
  if (!$("recordsBody")) return;
  $("recordsBody").innerHTML = [...visibleRows()]
    .reverse()
    .map((row) => {
      const state = STATUS[row.status] || { label: `Código ${row.status}`, className: "" };
      const utcTitle = `UTC: ${row.date.toISOString()}`;
      return `<tr>
        <td title="${utcTitle}">${fmtDate(row.date)}</td>
        <td><code>#${row.sequence ?? row.entryId}</code>${row.aggregate ? `<small>${row.samples} muestras</small>` : ""}</td>
        <td><strong>${fmt(row.level)}</strong> m</td>
        <td>${row.rain === 1 ? "Sí" : row.rain === 0 ? "No" : "—"}</td>
        <td>${fmt(row.temp, 1)} °C</td>
        <td>${fmt(row.hum, 1)} %</td>
        <td>${fmt(row.speed)}</td>
        <td>${fmt(row.prediction)}</td>
        <td><span class="status-chip ${state.className}">${state.label}</span></td>
      </tr>`;
    })
    .join("");
}

function toast(message, error = false) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.style.borderColor = error ? "rgba(220,38,38,.4)" : "";
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function exportCsv() {
  const config = currentConfig();
  const header = ["estacion", "rio", "server_timestamp_utc", "secuencia", "boot_id", "device_timestamp", "nivel_m", "distancia_cm", "lluvia_detectada", "lluvia_adc", "temperatura_c", "humedad_pct", "velocidad_cm_min", "edge_3min_m", "estado", "simulacion", "muestras", "min_m", "max_m"];
  const rows = visibleRows().map(f => [config.stationId, config.river, f.date.toISOString(), f.sequence, f.bootId, f.deviceTimestamp, f.level, f.distance, f.rain, f.rainRaw, f.temp, f.hum, f.speed, f.prediction, f.status, f.simulation, f.samples, f.min, f.max]);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  a.download = `sitpa-${config.stationId}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

async function loadHistory(older = false) {
  if (!currentConfig().apiBaseUrl) { toast("El histórico estará disponible cuando se conecte la estación."); return; }
  historyAbort?.abort();
  const controller = new AbortController(); historyAbort = controller;
  const query = { resolution: $("historyResolution")?.value || "raw" };
  for (const key of ["from", "to"]) {
    const value = $(key === "from" ? "historyFrom" : "historyTo")?.value;
    if (value) query[key] = new Date(value).getTime();
  }
  if (older && historyCursor) query.before = historyCursor;
  try {
    const payload = await fetchHistory(currentConfig(), query, controller.signal);
    if (controller.signal.aborted) return;
    historyRows = payload.rows.map(normalizeFeed); historyCursor = payload.nextBefore;
    if ($("historyOlder")) $("historyOlder").disabled = !historyCursor;
    if ($("historyStatus")) $("historyStatus").textContent = `Histórico · ${historyRows.length} registros · ${payload.resolution}. La tabla y las gráficas muestran esta página.`;
    if ($("downloadCsv")) $("downloadCsv").textContent = `Exportar CSV (${historyRows.length} registros)`;
    renderTable(); renderCharts();
  } catch (error) { if (error.name !== "AbortError") toast(error.message, true); }
}

function updateLiveState(state) {
  if ($("refreshStatus")) $("refreshStatus").textContent = state === "connected" ? "Suscripción WebSocket activa" : state === "unconfigured" ? "Estación pendiente de conexión" : state === "connecting" ? "Conectando al servidor…" : "Reconexión automática";
  checkDataFreshness();
}
function createLiveFeed() {
  return new RealtimeFeedController({
    getConfig: currentConfig,
    onSnapshot(payload) { feeds = payload.rows.map(normalizeFeed); if (feeds.length) render(); else renderUnavailableRiver(); },
    onLatest(raw) { const latest = normalizeFeed(raw); feeds = mergeLatestFeeds(feeds, latest, currentConfig().results); render(); },
    onStatus(value) { operationalStatus = { ...operationalStatus, ...value }; checkDataFreshness(); },
    onForecast(value) { lastForecast = value; checkDataFreshness(); },
    onState: updateLiveState,
    onError(error) { toast(error.message, true); }
  });
}

if (typeof document !== "undefined") {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  liveFeed = createLiveFeed();
  initializeRiverCatalog();
  if ($("rangeSelect")) $("rangeSelect").addEventListener("change", () => loadData());
  if ($("downloadCsv")) $("downloadCsv").addEventListener("click", exportCsv);
  if ($("riverSelect")) $("riverSelect").addEventListener("change", (event) => selectRiver(event.target.value));
  if ($("riverSearch")) $("riverSearch").addEventListener("input", (event) => renderRiverDirectory(event.target.value));

  const showSettings = () => {
    renderRiverContext(selectedRiverName());
    if ($("channelInput")) $("channelInput").value = currentConfig().stationId;
    if ($("apiKeyInput")) $("apiKeyInput").value = currentConfig().apiBaseUrl;
    if ($("settingsDialog")) $("settingsDialog").showModal();
  };
  if ($("openSettings")) $("openSettings").addEventListener("click", showSettings);
  if ($("mobileSettings")) $("mobileSettings").addEventListener("click", showSettings);
  if ($("enableAlerts")) $("enableAlerts").addEventListener("click", enableAlerts);
  if ($("dismissAlert")) $("dismissAlert").addEventListener("click", () => { $("alertBanner").hidden = true; });
  updateNotificationStatus();

  if ($("settingsForm")) {
    $("settingsForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.submitter?.value === "cancel") { $("settingsDialog").close(); return; }
      const river = selectedRiverName();
      const stations = customStations();
      try {
        const apiBaseUrl = validateApiBase($("apiKeyInput").value.trim(), location.protocol);
        const stationId = $("channelInput").value.trim();
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(stationId)) throw new Error("ID de estación inválido");
        stations[river] = { stationId };
        sessionStorage.setItem("sitpa.apiBaseUrl", apiBaseUrl);
      } catch (error) { toast(error.message, true); return; }
      sessionStorage.setItem("sitpaRiverStations", JSON.stringify(stations));
      if ($("settingsDialog")) $("settingsDialog").close();
      initializeRiverCatalog();
      loadData(true);
    });
  }

  window.addEventListener("resize", () => charts.forEach((c) => c.resize()));
  for (const [id, fn] of [["historyLoad", () => loadHistory()], ["historyOlder", () => loadHistory(true)], ["historyLive", () => { historyAbort?.abort(); historyRows = null; historyCursor = null; render(); if ($("historyStatus")) $("historyStatus").textContent = "Ventana en vivo"; }]]) $(id)?.addEventListener("click", fn);
  window.addEventListener("online", () => { if (!liveFeed.connected) liveFeed.refresh(); });
  // Este reloj solo actualiza etiquetas; nunca consulta la red.
  const freshnessTimer = setInterval(checkDataFreshness, 500);
  window.addEventListener("pagehide", () => { clearInterval(freshnessTimer); liveFeed.stop(); historyAbort?.abort(); });
  fetch("sitpa-config.json").then(r => r.ok ? r.json() : {}).then(config => {
    runtimeConfig = { ...runtimeConfig, ...config };
    if (!(runtimeConfig.liveMs > 0 && runtimeConfig.staleMs > runtimeConfig.liveMs)) { runtimeConfig.liveMs = 3000; runtimeConfig.staleMs = 10000; }
    if (!runtimeConfig.apiBaseUrl && ["localhost", "127.0.0.1"].includes(location.hostname)) runtimeConfig.apiBaseUrl = "http://127.0.0.1:8787";
    if (runtimeConfig.stationId) RIVER_DETAILS[DEFAULT_RIVER].stationId = runtimeConfig.stationId;
  }).catch(() => {}).finally(() => loadData());
}
