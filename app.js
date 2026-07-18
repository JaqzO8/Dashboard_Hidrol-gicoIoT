const DEFAULT_CHANNEL = "3420787";
const STATUS = {
  0: { label: "Normal", description: "Condiciones estables", className: "status-0", color: "#6be6a4" },
  1: { label: "Preventivo", description: "Requiere observación", className: "status-1", color: "#e8d164" },
  2: { label: "Alerta", description: "Variación relevante", className: "status-2", color: "#ffad5b" },
  3: { label: "Crítico", description: "Atención inmediata", className: "status-3", color: "#ff6b71" }
};
const $ = (id) => document.getElementById(id);
let feeds = [];
let charts = [];
let refreshTimer;

export function normalizeFeed(feed) {
  const number = (value) => value === null || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
  return { date: new Date(feed.created_at), entryId: Number(feed.entry_id), level: number(feed.field1), rain: number(feed.field2), temp: number(feed.field3), hum: number(feed.field4), speed: number(feed.field5), prediction: number(feed.field6), status: number(feed.field7) };
}
export function buildFeedUrl(channel, results, apiKey = "") {
  const url = new URL(`https://api.thingspeak.com/channels/${encodeURIComponent(channel)}/feeds.json`);
  url.searchParams.set("results", String(results));
  if (apiKey.trim()) url.searchParams.set("api_key", apiKey.trim());
  return url.toString();
}
export function stats(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { avg: null, min: null, max: null };
  return { avg: clean.reduce((a, b) => a + b, 0) / clean.length, min: Math.min(...clean), max: Math.max(...clean) };
}
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString("es-PE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const fmtDate = (date, compact = false) => new Intl.DateTimeFormat("es-PE", compact ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { dateStyle: "short", timeStyle: "medium" }).format(date);
const currentConfig = () => ({ channel: sessionStorage.getItem("tsChannel") || DEFAULT_CHANNEL, apiKey: sessionStorage.getItem("tsReadKey") || "", results: Number($("rangeSelect")?.value || 100) });

async function loadData(showFeedback = false) {
  const button = $("refreshButton");
  button?.classList.add("loading");
  try {
    const { channel, apiKey, results } = currentConfig();
    const response = await fetch(buildFeedUrl(channel, results, apiKey), { cache: "no-store" });
    if (!response.ok) throw new Error(`ThingSpeak respondió ${response.status}`);
    const payload = await response.json();
    feeds = payload.feeds.map(normalizeFeed).filter((row) => !Number.isNaN(row.date.getTime()));
    if (!feeds.length) throw new Error("El canal no contiene lecturas en la ventana seleccionada");
    render(payload.channel);
    setConnection(true, apiKey ? "Privado · conectado" : "Público · conectado");
    if (showFeedback) toast("Datos actualizados correctamente");
  } catch (error) {
    setConnection(false, "Sin conexión");
    toast(error.message || "No fue posible consultar ThingSpeak", true);
  } finally { button?.classList.remove("loading"); }
}

function setConnection(online, label) { $("connectionDot").className = online ? "online" : "offline"; $("connectionLabel").textContent = label; }
function render(channel) {
  const last = feeds.at(-1), previous = feeds.at(-2), state = STATUS[last.status] || { label: `Código ${last.status ?? "—"}`, description: "Estado sin catalogar", color: "#88a8b3" };
  const delta = previous && Number.isFinite(last.level) && Number.isFinite(previous.level) ? last.level - previous.level : null;
  $("levelValue").textContent = fmt(last.level);
  $("levelTrend").textContent = delta === null ? "Sin lectura anterior" : `${delta >= 0 ? "↑" : "↓"} ${fmt(Math.abs(delta))} m respecto a la lectura anterior`;
  $("systemStatus").textContent = state.label; $("systemStatus").style.color = state.color; $("statusDescription").textContent = state.description;
  $("kpiLevel").textContent = `${fmt(last.level)} m`; $("kpiLevelDelta").textContent = delta === null ? "Sin comparación" : `${delta >= 0 ? "+" : ""}${fmt(delta)} m en la última lectura`;
  $("kpiRain").textContent = last.rain > 0 ? `${fmt(last.rain)} mm` : "Sin lluvia"; $("kpiRainState").textContent = last.rain > 0 ? "Evento detectado" : "Sensor sin evento";
  $("kpiTemp").textContent = `${fmt(last.temp, 1)} °C`; $("kpiHum").textContent = `${fmt(last.hum, 1)} %`; $("kpiSpeed").textContent = fmt(last.speed);
  $("lastUpdated").textContent = fmtDate(last.date); $("entryCount").textContent = `${feeds.length} lecturas`;
  const levelStats = stats(feeds.map((f) => f.level)); $("avgLevel").textContent = `${fmt(levelStats.avg)} m`; $("maxLevel").textContent = `${fmt(levelStats.max)} m`;
  const spread = levelStats.max - levelStats.min; $("insightTitle").textContent = state.label === "Crítico" ? "La estación exige atención." : spread > 5 ? "El nivel presenta alta variación." : "La serie se mantiene contenida.";
  $("insightText").textContent = `En la ventana analizada, el nivel osciló entre ${fmt(levelStats.min)} y ${fmt(levelStats.max)} m. El estado más reciente es ${state.label.toLowerCase()}.`;
  renderCharts(); renderTable();
}

function baseChartOptions() { return { animationDuration: 650, textStyle: { fontFamily: "Manrope", color: "#7e9da7" }, grid: { left: 45, right: 20, top: 34, bottom: 40 }, tooltip: { trigger: "axis", backgroundColor: "#08232d", borderColor: "rgba(151,210,222,.2)", textStyle: { color: "#dff7fb", fontSize: 10 } }, xAxis: { type: "category", boundaryGap: false, data: feeds.map(f => fmtDate(f.date, true)), axisLine: { lineStyle: { color: "rgba(151,210,222,.12)" } }, axisLabel: { color: "#547681", fontSize: 8, hideOverlap: true }, axisTick: { show: false } }, yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "rgba(151,210,222,.07)" } }, axisLabel: { color: "#547681", fontSize: 8 } } }; }
function lineSeries(name, data, color, area = true) { return { name, type: "line", data, smooth: .28, showSymbol: false, connectNulls: true, lineStyle: { width: 2, color }, itemStyle: { color }, areaStyle: area ? { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}55` }, { offset: 1, color: `${color}00` }] } } : undefined }; }
function chart(id, options) { const el = $(id); let instance = echarts.getInstanceByDom(el); if (!instance) { instance = echarts.init(el); charts.push(instance); } instance.setOption(options, true); }
function renderCharts() {
  chart("levelChart", { ...baseChartOptions(), series: [lineSeries("Nivel", feeds.map(f => f.level), "#39e1d0")] });
  chart("predictionChart", { ...baseChartOptions(), series: [lineSeries("Predicción", feeds.map(f => f.prediction), "#a984ff")] });
  chart("speedChart", { ...baseChartOptions(), series: [lineSeries("Velocidad", feeds.map(f => f.speed), "#6be6a4")] });
  const climate = baseChartOptions(); climate.legend = { data: ["Temperatura", "Humedad"], textStyle: { color: "#73939d", fontSize: 9 }, top: 4 }; climate.yAxis = [{ ...climate.yAxis, name: "°C", nameTextStyle: { color: "#567984" } }, { ...climate.yAxis, name: "%", nameTextStyle: { color: "#567984" } }]; climate.series = [lineSeries("Temperatura", feeds.map(f => f.temp), "#ffad5b", false), { ...lineSeries("Humedad", feeds.map(f => f.hum), "#58a6ff", false), yAxisIndex: 1 }]; chart("climateChart", climate);
  const events = baseChartOptions(); events.xAxis.boundaryGap = true; events.yAxis = { type: "value", min: 0, max: 3, interval: 1, axisLabel: { color: "#547681", fontSize: 8, formatter: value => STATUS[value]?.label || value }, splitLine: { lineStyle: { color: "rgba(151,210,222,.07)" } } }; events.series = [{ name: "Estado", type: "bar", data: feeds.map(f => ({ value: f.status, itemStyle: { color: (STATUS[f.status] || STATUS[0]).color, borderRadius: [4,4,0,0] } })), barMaxWidth: 8 }]; chart("eventsChart", events);
}
function renderTable() { $("recordsBody").innerHTML = [...feeds].reverse().slice(0, 20).map(row => { const state = STATUS[row.status] || { label: `Código ${row.status}`, className: "" }; return `<tr><td>${fmtDate(row.date)}</td><td>${fmt(row.level)} m</td><td>${row.rain > 0 ? fmt(row.rain) : "No"}</td><td>${fmt(row.temp,1)} °C</td><td>${fmt(row.hum,1)} %</td><td>${fmt(row.speed)}</td><td>${fmt(row.prediction)}</td><td><span class="status-chip ${state.className}">${state.label}</span></td></tr>`; }).join(""); }
function toast(message, error = false) { const el = $("toast"); el.textContent = message; el.style.borderColor = error ? "rgba(255,107,113,.4)" : ""; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 3200); }
function exportCsv() { const header = ["fecha_hora","entry_id","nivel","lluvia","temperatura","humedad","velocidad","prediccion","estado"]; const rows = feeds.map(f => [f.date.toISOString(),f.entryId,f.level,f.rain,f.temp,f.hum,f.speed,f.prediction,f.status]); const csv = [header,...rows].map(row => row.map(v => `"${v ?? ""}"`).join(",")).join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=`thingspeak-${currentConfig().channel}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); }

if (typeof document !== "undefined") {
  $("refreshButton").addEventListener("click", () => loadData(true)); $("rangeSelect").addEventListener("change", () => loadData()); $("downloadCsv").addEventListener("click", exportCsv);
  const showSettings = () => { $("channelInput").value=currentConfig().channel; $("apiKeyInput").value=currentConfig().apiKey; $("settingsDialog").showModal(); };
  $("openSettings").addEventListener("click", showSettings); $("mobileSettings").addEventListener("click", showSettings);
  $("settingsForm").addEventListener("submit", event => { event.preventDefault(); sessionStorage.setItem("tsChannel", $("channelInput").value.trim()); const key=$("apiKeyInput").value.trim(); key ? sessionStorage.setItem("tsReadKey",key) : sessionStorage.removeItem("tsReadKey"); $("settingsDialog").close(); loadData(true); });
  window.addEventListener("resize", () => charts.forEach(c => c.resize()));
  document.querySelectorAll(".sidebar nav a").forEach(a => a.addEventListener("click", () => { document.querySelectorAll(".sidebar nav a").forEach(n=>n.classList.remove("active")); a.classList.add("active"); }));
  loadData(); refreshTimer = setInterval(loadData, 20000);
}
