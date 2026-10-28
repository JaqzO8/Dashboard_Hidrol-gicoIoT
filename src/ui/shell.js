const pages = [
  ["#conexion-usb", "USB", "Conectar sensores"],
  ["#nivel", "01", "Nivel del agua"],
  ["#prediccion", "02", "Tendencia y estimación"],
  ["#ambiente", "03", "Lluvia y clima"],
  ["#avisos", "04", "Avisos"],
  ["#registros", "05", "Mediciones y demo"]
];

if (typeof document !== "undefined") {
const currentPage = window.location.pathname.split("/").pop() || "index.html";

const shellRoot = document.getElementById("shell-root");
if (shellRoot) {
  shellRoot.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="index.html" aria-label="Ir al resumen de SITPA">
        <img class="brand-logo" src="sitpa-logo-transparent.png" alt="Logo oficial de SITPA"><span><strong>SITPA</strong><small>Avisos del río</small></span>
      </a>
      <nav aria-label="Navegación principal">
        ${pages.map(([href, number, label]) => `<a href="${currentPage==='index.html'?href:'index.html'+href}"><span>${number}</span>${label}</a>`).join("")}
      </nav>
      <div class="side-card">
        <span class="side-label">RÍO SELECCIONADO</span>
        <strong id="sideRiver">Río Huallaga</strong>
        <small id="sideChannel">Estación tingomaria-01</small>
        <div class="connection"><i id="connectionDot"></i><span id="connectionLabel">Conectando…</span></div>
      </div>
      <p class="side-foot">SITPA<br><span>Información para cuidarnos</span></p>
    </aside>`;
}

const topbarRoot = document.getElementById("topbar-root");
if (topbarRoot) {
  topbarRoot.innerHTML = `
    <header class="topbar">
      <div>
        <span class="section-tag">SITPA · AVISOS DEL RÍO</span>
        <h1>${document.body.dataset.pageTitle || "SITPA"}</h1>
      </div>
      <div class="top-actions">
        <label class="river-control">Consultar río
          <select id="riverSelect" aria-label="Seleccionar río del Perú"></select>
        </label>
        <label class="range-control">Mediciones
          <select id="rangeSelect" aria-label="Cantidad de lecturas">
            <option value="50">50 lecturas</option>
            <option value="100" selected>100 lecturas</option>
            <option value="250">250 lecturas</option>
            <option value="500">500 lecturas</option>
          </select>
        </label>
        <div class="updated">
          <span>Última actualización · hora de Perú</span>
          <strong id="lastUpdated">—</strong>
          <small id="refreshStatus">Esperando información</small>
        </div>
      </div>
    </header>
    <p class="forecast-notice">Demostración con maqueta de 12 cm. Las mediciones no corresponden al río real.</p>
    <details class="connection-details"><summary>Estado de la conexión</summary><section class="operational-strip" aria-live="polite"><span id="serverState">SERVIDOR DESCONECTADO</span><span id="stationState">ESTACIÓN SIN CONFIRMAR</span><span id="telemetryState">SIN TELEMETRÍA</span><strong id="simulationState" hidden>SIMULACIÓN · DATOS DE PRUEBA</strong><strong id="sensorState"></strong></section></details>
    <p id="connectionNotice" class="forecast-notice" hidden>Estamos preparando esta estación. Todavía no hay información para evaluar el nivel del río.</p>`;
}

document.body.insertAdjacentHTML("beforeend", '<div id="toast" role="status" aria-live="polite"></div>');
}
