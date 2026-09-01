import { PERU_RIVERS } from "./data/peru-rivers.js";
import { LiveFeedController, LIVE_INTERVAL_MS } from "./src/core/live-feed.js";
import { buildFeedUrl, buildLatestFeedUrl } from "./src/services/thingspeak.js";

export { buildFeedUrl, buildLatestFeedUrl };

const DEFAULT_CHANNEL = "3420787";
const DEFAULT_RIVER = "Río Huallaga";
const RIVER_DETAILS = {
  "Río Huallaga": { region: "Amazonas", locality: "Huánuco, San Martín y Loreto", channel: DEFAULT_CHANNEL },
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
  2: { label: "Alerta", description: "Variación relevante", className: "status-2", color: "#EA580C" },
  3: { label: "Crítico", description: "Atención inmediata", className: "status-3", color: "#DC2626" }
};
const $ = (id) => document.getElementById(id);
let feeds = [];
let charts = [];
let liveFeed;

export function riverMeta(name) {
  return { name, region: "Por validar", locality: "Localidad por asignar", channel: "", ...(RIVER_DETAILS[name] || {}) };
}

export function normalizeFeed(feed) {
  const number = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  };
  return {
    date: new Date(feed.created_at),
    entryId: Number(feed.entry_id),
    level: number(feed.field1),
    rain: number(feed.field2),
    temp: number(feed.field3),
    hum: number(feed.field4),
    speed: number(feed.field5),
    prediction: number(feed.field6),
    status: number(feed.field7)
  };
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

const fmt = (value, digits = 2) => (Number.isFinite(value) ? value.toLocaleString("es-PE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—");

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
    return JSON.parse(sessionStorage.getItem("tsRiverStations") || "{}");
  } catch {
    return {};
  }
};

const currentConfig = () => {
  const river = selectedRiverName();
  const base = riverMeta(river);
  const custom = customStations()[river] || {};
  return { river, ...base, channel: custom.channel || base.channel, apiKey: custom.apiKey || "", results: Number($("rangeSelect")?.value || 100) };
};

async function loadData(showFeedback = false) {
  const { channel, river } = currentConfig();
  if (!channel) {
    liveFeed?.stop();
    renderRiverContext(river);
    renderUnavailableRiver();
    return;
  }
  await liveFeed.refresh({ notify: showFeedback });
}

function renderRiverContext(name) {
  const meta = riverMeta(name);
  const configuredChannel = currentConfig().channel;
  if ($("sideRiver")) $("sideRiver").textContent = name;
  if ($("sideChannel")) $("sideChannel").textContent = configuredChannel ? `Canal #${configuredChannel}` : "Canal pendiente";
  if ($("heroLocation")) $("heroLocation").textContent = `📍 ${name} · ${meta.locality}`;
  if ($("heroBasin")) $("heroBasin").textContent = `◷ Región hidrográfica ${meta.region}`;
  if ($("settingsRiver")) $("settingsRiver").textContent = name;
  if ($("settingsLocality")) $("settingsLocality").textContent = `${meta.locality} · ${meta.region}`;
  if ($("riverSelect") && $("riverSelect").value !== name) $("riverSelect").value = name;
}

function renderUnavailableRiver() {
  feeds = [];
  setConnectionState("offline", "Estación pendiente", "Río sin canal IoT asociado");
  if ($("levelValue")) $("levelValue").textContent = "—";
  if ($("levelTrend")) $("levelTrend").textContent = "Configure un canal para activar la telemetría";
  if ($("systemStatus")) {
    $("systemStatus").textContent = "Sin estación";
    $("systemStatus").style.color = "#88a8b3";
  }
  if ($("statusDescription")) $("statusDescription").textContent = "Estación pendiente — este río aún no tiene datos IoT asociados.";
  ["kpiLevel", "kpiRain", "kpiTemp", "kpiHum", "kpiSpeed", "avgLevel", "maxLevel"].forEach((id) => {
    if ($(id)) $(id).textContent = "—";
  });
  if ($("kpiLevelDelta")) $("kpiLevelDelta").textContent = "Telemetría pendiente";
  if ($("kpiRainState")) $("kpiRainState").textContent = "Sin estación asociada";
  if ($("insightTitle")) $("insightTitle").textContent = "Este río está listo para incorporarse.";
  if ($("insightText")) $("insightText").textContent = "Estación pendiente — este río aún no tiene datos IoT asociados.";
  if ($("lastUpdated")) $("lastUpdated").textContent = "—";
  if ($("entryCount")) $("entryCount").textContent = "0 lecturas";
  if ($("downloadCsv")) $("downloadCsv").textContent = "Exportar CSV (0 lecturas)";
  if ($("recordsBody")) {
    $("recordsBody").innerHTML = '<tr><td colspan="9" class="empty">Estación pendiente — este río aún no tiene datos IoT asociados.</td></tr>';
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
          const hasStation = Boolean(meta.channel || customStations()[name]?.channel);
          return `<button class="river-result ${name === selected ? "active" : ""}" type="button" data-river="${name.replaceAll('"', "&quot;")}"><span><strong>${name}</strong><small>${meta.locality} · ${meta.region}</small></span><span class="station-state ${hasStation ? "live" : ""}">${hasStation ? "EN VIVO" : "PENDIENTE"}</span></button>`;
        }).join("")
      : '<div class="empty">No se encontraron ríos con ese nombre.</div>';
    $("riverResults").querySelectorAll("[data-river]").forEach((button) => button.addEventListener("click", () => selectRiver(button.dataset.river)));
  }
}

function initializeRiverCatalog() {
  if ($("riverCount")) $("riverCount").textContent = PERU_RIVERS.length.toLocaleString("es-PE");
  if ($("activeStationCount")) $("activeStationCount").textContent = String(1 + Object.entries(customStations()).filter(([name, station]) => name !== DEFAULT_RIVER && station?.channel).length);
  if ($("riverSelect")) {
    $("riverSelect").innerHTML = PERU_RIVERS.map((name) => `<option value="${name.replaceAll('"', "&quot;")}">${name}${name === DEFAULT_RIVER ? " · EN VIVO" : ""}</option>`).join("");
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
    const modeText = mode === "online" ? "EN VIVO" : mode === "delayed" ? "RETRASADO" : "SIN CONEXIÓN";
    livePill.innerHTML = `<span></span> TELEMETRÍA ${modeText} ${detail ? `<small>(${detail})</small>` : ""}`;
  }
}

function checkDataFreshness() {
  if (!feeds.length) return;
  const last = feeds.at(-1);
  const now = Date.now();
  const dataAgeSec = (now - last.date.getTime()) / 1000;
  const lastSuccessAgeSec = liveFeed ? (now - liveFeed.lastFetchSuccessTime) / 1000 : 0;

  if (liveFeed && liveFeed.failureCount > 0) {
    setConnectionState("offline", "Sin conexión con ThingSpeak", "Reintentando...");
  } else if (lastSuccessAgeSec > 20 || dataAgeSec > 30) {
    const ageText = dataAgeSec > 0 ? `hace ${Math.round(dataAgeSec)} s` : "retrasado";
    setConnectionState("delayed", "Retrasado", ageText);
  } else {
    const apiKey = currentConfig().apiKey;
    setConnectionState("online", apiKey ? "Privado · en vivo" : "Público · en vivo");
  }
}

function renderLimnimeter(level) {
  const gauge = $("limnimeterGauge");
  if (!gauge) return;
  if (!Number.isFinite(level)) {
    gauge.style.setProperty("--level-percent", "0%");
    if ($("limnimeterPointer")) $("limnimeterPointer").textContent = "— m";
    return;
  }
  const maxRange = 5.0;
  const percent = Math.min(100, Math.max(0, (level / maxRange) * 100));
  gauge.style.setProperty("--level-percent", `${percent}%`);
  if ($("limnimeterPointer")) {
    $("limnimeterPointer").textContent = `${fmt(level)} m`;
    $("limnimeterPointer").style.bottom = `${percent}%`;
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

  if ($("kpiRain")) $("kpiRain").textContent = last.rain !== null && last.rain > 0 ? `${fmt(last.rain)} mm` : last.rain === 0 ? "0 mm" : "—";
  if ($("kpiRainState")) $("kpiRainState").textContent = last.rain !== null && last.rain > 0 ? "Evento detectado" : last.rain === 0 ? "Sin lluvia" : "Sin dato";

  if ($("kpiTemp")) $("kpiTemp").textContent = Number.isFinite(last.temp) ? `${fmt(last.temp, 1)} °C` : "—";
  if ($("kpiHum")) $("kpiHum").textContent = Number.isFinite(last.hum) ? `${fmt(last.hum, 1)} %` : "—";
  if ($("kpiSpeed")) $("kpiSpeed").textContent = Number.isFinite(last.speed) ? fmt(last.speed) : "—";

  if ($("lastUpdated")) {
    $("lastUpdated").textContent = fmtDate(last.date);
    $("lastUpdated").title = `UTC: ${last.date.toISOString()} | Entry ID: ${last.entryId}`;
  }
  if ($("entryCount")) $("entryCount").textContent = `${feeds.length} lecturas`;
  if ($("downloadCsv")) $("downloadCsv").textContent = `Exportar CSV (${feeds.length} lecturas)`;

  const levelStats = stats(feeds.map((f) => f.level));
  if ($("avgLevel")) $("avgLevel").textContent = `${fmt(levelStats.avg)} m`;
  if ($("maxLevel")) $("maxLevel").textContent = `${fmt(levelStats.max)} m`;

  const spread = levelStats.max !== null && levelStats.min !== null ? levelStats.max - levelStats.min : 0;
  if ($("insightTitle")) {
    $("insightTitle").textContent = state.label === "Crítico" ? "La estación exige atención inmediata." : spread > 5 ? "El nivel presenta alta variación." : "La serie se mantiene dentro de parámetros estables.";
  }
  if ($("insightText")) {
    $("insightText").textContent = `En la ventana analizada de ${feeds.length} lecturas, el nivel osciló entre ${fmt(levelStats.min)} m y ${fmt(levelStats.max)} m. El último registro corresponde al Entry #${last.entryId} (${fmtDate(last.date)}).`;
  }

  renderLimnimeter(last.level);
  checkDataFreshness();
  renderCharts();
  renderTable();
}

function baseChartOptions() {
  return {
    animationDuration: 650,
    textStyle: { fontFamily: "Public Sans", color: "#64748B" },
    grid: { left: 45, right: 20, top: 34, bottom: 40 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#FFFFFF",
      borderColor: "#CBD5E1",
      extraCssText: "box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);",
      textStyle: { color: "#0F172A", fontSize: 11, fontFamily: "Public Sans" }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: feeds.map((f) => fmtDate(f.date, true)),
      axisLine: { lineStyle: { color: "#CBD5E1" } },
      axisLabel: { color: "#64748B", fontSize: 9, hideOverlap: true, fontFamily: "Public Sans" },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: { lineStyle: { color: "#E2E8F0" } },
      axisLabel: { color: "#64748B", fontSize: 9, fontFamily: "Public Sans" }
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
    connectNulls: true,
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

function renderCharts() {
  chart("levelChart", { ...baseChartOptions(), series: [lineSeries("Nivel", feeds.map((f) => f.level), "#0284C7")] });
  chart("predictionChart", { ...baseChartOptions(), series: [lineSeries("Predicción", feeds.map((f) => f.prediction), "#D97706")] });
  chart("speedChart", { ...baseChartOptions(), series: [lineSeries("Velocidad", feeds.map((f) => f.speed), "#16A34A")] });

  const climate = baseChartOptions();
  climate.legend = { data: ["Temperatura", "Humedad"], textStyle: { color: "#64748B", fontSize: 10 }, top: 4 };
  climate.yAxis = [
    { ...climate.yAxis, name: "°C", nameTextStyle: { color: "#64748B" } },
    { ...climate.yAxis, name: "%", nameTextStyle: { color: "#64748B" } }
  ];
  climate.series = [
    lineSeries("Temperatura", feeds.map((f) => f.temp), "#EA580C", false),
    { ...lineSeries("Humedad", feeds.map((f) => f.hum), "#0284C7", false), yAxisIndex: 1 }
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
      data: feeds.map((f) => ({
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
  $("recordsBody").innerHTML = [...feeds]
    .reverse()
    .slice(0, 30)
    .map((row) => {
      const state = STATUS[row.status] || { label: `Código ${row.status}`, className: "" };
      const utcTitle = `UTC: ${row.date.toISOString()}`;
      return `<tr>
        <td title="${utcTitle}">${fmtDate(row.date)}</td>
        <td><code>#${row.entryId}</code></td>
        <td><strong>${fmt(row.level)}</strong> m</td>
        <td>${row.rain !== null && row.rain > 0 ? `${fmt(row.rain)} mm` : row.rain === 0 ? "0 mm" : "—"}</td>
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
  const header = ["rio", "localidad", "region_hidrografica", "fecha_hora_utc", "fecha_hora_lima", "entry_id", "nivel_m", "lluvia_mm", "temperatura_c", "humedad_porcentaje", "velocidad", "prediccion", "estado_codigo"];
  const config = currentConfig();
  const rows = feeds.map((f) => [
    config.river,
    config.locality,
    config.region,
    f.date.toISOString(),
    fmtDate(f.date),
    f.entryId,
    f.level,
    f.rain,
    f.temp,
    f.hum,
    f.speed,
    f.prediction,
    f.status
  ]);
  const csv = [header, ...rows].map((row) => row.map((v) => `"${v ?? ""}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${config.river.toLocaleLowerCase("es-PE").replaceAll(" ", "-")}-lecturas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function updateLiveState(state, delay = LIVE_INTERVAL_MS) {
  const status = $("refreshStatus");
  if (!status) return;

  if (state === "loading") status.textContent = "Sincronizando con ThingSpeak…";
  else if (state === "paused") status.textContent = "Pauta inactiva · sondeo a 60 s";
  else if (state === "burst") status.textContent = `Modo ráfaga activo · sondeo a ${Math.round(delay / 1000)} s`;
  else if (state === "offline") status.textContent = `Reintento automático en ${Math.round(delay / 1000)} s`;
  else status.textContent = `Sincronización adaptativa · ${Math.round(delay / 1000)} s`;

  checkDataFreshness();
}

function createLiveFeed() {
  return new LiveFeedController({
    getConfig: currentConfig,
    onSnapshot(payload, { notify }) {
      feeds = (payload.feeds || []).map(normalizeFeed).filter((row) => !Number.isNaN(row.date.getTime()));
      if (!feeds.length) throw new Error("El canal no contiene lecturas en la ventana seleccionada");
      render();
      if (notify) toast("Datos sincronizados con ThingSpeak");
    },
    onLatest(raw) {
      const latest = normalizeFeed(raw);
      if (!Number.isFinite(latest.entryId) || Number.isNaN(latest.date.getTime())) return false;
      if (feeds.at(-1)?.entryId === latest.entryId) return false;
      const limit = currentConfig().results;
      feeds = mergeLatestFeeds(feeds, latest, limit);
      render();
      return true;
    },
    onState: updateLiveState,
    onError(error, { silent = false } = {}) {
      setConnectionState("offline", "Sin conexión", "Reintentando...");
      if (!silent) toast(error.message || "No fue posible consultar ThingSpeak", true);
    }
  });
}

if (typeof document !== "undefined") {
  liveFeed = createLiveFeed();
  initializeRiverCatalog();
  if ($("rangeSelect")) $("rangeSelect").addEventListener("change", () => loadData());
  if ($("downloadCsv")) $("downloadCsv").addEventListener("click", exportCsv);
  if ($("riverSelect")) $("riverSelect").addEventListener("change", (event) => selectRiver(event.target.value));
  if ($("riverSearch")) $("riverSearch").addEventListener("input", (event) => renderRiverDirectory(event.target.value));

  const showSettings = () => {
    renderRiverContext(selectedRiverName());
    if ($("channelInput")) $("channelInput").value = currentConfig().channel;
    if ($("apiKeyInput")) $("apiKeyInput").value = currentConfig().apiKey;
    if ($("settingsDialog")) $("settingsDialog").showModal();
  };
  if ($("openSettings")) $("openSettings").addEventListener("click", showSettings);
  if ($("mobileSettings")) $("mobileSettings").addEventListener("click", showSettings);

  if ($("settingsForm")) {
    $("settingsForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const river = selectedRiverName();
      const stations = customStations();
      stations[river] = { channel: $("channelInput").value.trim(), apiKey: $("apiKeyInput").value.trim() };
      sessionStorage.setItem("tsRiverStations", JSON.stringify(stations));
      if ($("settingsDialog")) $("settingsDialog").close();
      initializeRiverCatalog();
      loadData(true);
    });
  }

  window.addEventListener("resize", () => charts.forEach((c) => c.resize()));
  window.addEventListener("online", () => loadData());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadData();
  });
  document.querySelectorAll(".sidebar nav a").forEach((a) =>
    a.addEventListener("click", () => {
      document.querySelectorAll(".sidebar nav a").forEach((n) => n.classList.remove("active"));
      a.classList.add("active");
    })
  );
  loadData();
}


