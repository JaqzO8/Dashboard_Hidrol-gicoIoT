const escape = value => String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const meters = value => Number.isFinite(value) ? `${(value / 100).toLocaleString("es-PE", { maximumFractionDigits: 4 })} m` : "—";
const time = value => value ? new Date(value).toLocaleTimeString("es-PE", { timeZone: "America/Lima" }) : "—";
let chart, lastSignature, revision = 0;
export async function renderForecast(forecast, latest, reason = "Esperando telemetría y validación del modelo") {
  if (typeof document === "undefined") return;
  const panel = document.getElementById("forecastPanel");
  if (!panel) return;
  const signature = JSON.stringify([forecast, latest?.entryId, reason]);
  if (signature === lastSignature) return;
  lastSignature = signature;
  const renderRevision = ++revision;
  chart?.dispose(); chart = null;
  const horizons = forecast?.horizons || [5, 15, 30, 60, 120, 180, 240, 300].map(h => ({ horizonMinutes: h, available: false, reason }));
  const edge = forecast?.edge;
  const data = forecast?.dataUsed;
  const active = horizons.filter(h => h.available);
  panel.innerHTML = `<span class="section-tag">PRONÓSTICO HIDROLÓGICO</span>
    <h2>Medición y estimaciones, con su alcance</h2>
    <div class="forecast-summary"><div><span>NIVEL OBSERVADO</span><strong>${Number.isFinite(latest?.level) ? meters(latest.level * 100) : "—"}</strong><small>Última lectura · ${time(latest?.date?.getTime())}</small></div>
    <div><span>PROYECCIÓN EDGE +3 MIN</span><strong>${edge?.available ? meters(edge.levelCm) : "No disponible"}</strong><small>Extrapolación local · confianza no validada</small></div></div>
    <p class="forecast-notice">${active.length ? "Estimaciones condicionadas a la calidad de los datos; los rangos no son una garantía." : `PRONÓSTICO NO DISPONIBLE · ${escape(forecast ? horizons[0].reason : reason)}`}</p>
    <div class="table-wrap"><table><thead><tr><th>Horizonte</th><th>Estimación</th><th>Rango empírico</th><th>Estado / confianza</th><th>MAE / RMSE (cm)</th></tr></thead><tbody>${horizons.map(h => `<tr><td>+${h.horizonMinutes < 60 ? `${h.horizonMinutes} min` : `${h.horizonMinutes / 60} h`}</td><td>${h.available ? meters(h.levelCm) : "—"}</td><td>${h.available && Number.isFinite(h.lowerCm) ? `${meters(h.lowerCm)} – ${meters(h.upperCm)}` : "—"}</td><td>${escape(h.available ? h.confidence : `No disponible · ${h.reason}`)}</td><td>${h.metrics ? `${escape(h.metrics.mae.toFixed(3))} / ${escape(h.metrics.rmse.toFixed(3))}` : "Sin mediciones"}</td></tr>`).join("")}</tbody></table></div>
    <p class="forecast-meta">Modelo: ${escape(forecast?.model || "Trend Baseline")} · Versión ${escape(forecast?.version || "1.0.0")} · Generado: ${time(forecast?.generatedAt)}<br>
    Horizonte validado: ${forecast?.validatedHorizonMinutes ? `${forecast.validatedHorizonMinutes} min` : "Ninguno"} · Confianza: ${escape(forecast?.confidence || "No evaluada")}<br>
    Datos utilizados: ${data ? `${data.points} agregados de 1 min · ${time(data.from)}–${time(data.to)}` : "Insuficientes"} · Calidad: ${escape(forecast?.quality || "Sin evaluar")}</p>
    <div id="forecastChart" class="chart" aria-label="Nivel observado y pronóstico diferenciado"></div>`;
  const current = latest && Number.isFinite(latest.level) ? [latest.date.getTime(), latest.level] : null;
  if (!current) return;
  let echarts;
  try { ({ echarts } = await import("./charts.js")); }
  catch {
    if (renderRevision === revision) document.getElementById("forecastChart").textContent = "No se pudo cargar el gráfico. Recarga la página.";
    return;
  }
  if (renderRevision !== revision) return;
  chart = echarts.init(document.getElementById("forecastChart"));
  const estimated = current && forecast ? [current, ...active.map(h => [forecast.sourceTimestamp + h.horizonMinutes * 60000, h.levelCm / 100])] : [];
  const series = [{ name: "Observado", type: "line", showSymbol: true, data: current ? [current] : [], lineStyle: { color: "#0284c7" }, itemStyle: { color: "#0284c7" } },
    { name: "Pronosticado", type: "line", showSymbol: true, data: estimated, lineStyle: { type: "dashed", color: "#d97706" }, itemStyle: { color: "#d97706" } }];
  // Banda dibujada por segmentos con límites propios: no apila ni suma niveles observados.
  if (current && active.length) {
    const points = [{ t: current[0], lower: current[1], upper: current[1] }, ...active.map(h => ({ t: forecast.sourceTimestamp + h.horizonMinutes * 60000, lower: h.lowerCm / 100, upper: h.upperCm / 100 }))];
    series.push({ name: "Rango empírico", type: "custom", silent: true, data: points.slice(1).map((p, i) => [points[i].t, points[i].lower, points[i].upper, p.t, p.lower, p.upper]),
      renderItem: (params, api) => ({ type: "polygon", shape: { points: [api.coord([api.value(0), api.value(1)]), api.coord([api.value(0), api.value(2)]), api.coord([api.value(3), api.value(5)]), api.coord([api.value(3), api.value(4)])] }, style: { fill: "rgba(217,119,6,.15)" } }), encode: { x: [0, 3], y: [1, 2, 4, 5] } });
  }
  chart.setOption({ legend: { data: ["Observado", "Pronosticado", "Rango empírico"] }, grid: { left: 55, right: 20, bottom: 40, top: 40 },
    tooltip: { trigger: "axis" }, xAxis: { type: "time", axisLabel: { formatter: value => time(value) } },
    yAxis: { type: "value", name: "m", scale: true }, series });
}
if (typeof window !== "undefined") window.addEventListener("resize", () => chart?.resize());
