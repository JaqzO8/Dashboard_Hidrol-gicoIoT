const pages = [
  ["index.html", "01", "Resumen"],
  ["red-nacional.html", "02", "Red nacional"],
  ["tendencias.html", "03", "Tendencias"],
  ["ambiente.html", "04", "Ambiente"],
  ["registros.html", "05", "Registros"]
];

if (typeof document !== "undefined") {
const currentPage = window.location.pathname.split("/").pop() || "index.html";

const shellRoot = document.getElementById("shell-root");
if (shellRoot) {
  shellRoot.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="index.html" aria-label="Ir al resumen de SITPA">
        <img class="brand-logo" src="sitpa-logo.jpg" alt="Logo oficial de SITPA"><span><strong>SITPA</strong><small>Prevención hidrológica</small></span>
      </a>
      <nav aria-label="Navegación principal">
        ${pages.map(([href, number, label]) => `<a class="${currentPage === href ? "active" : ""}" href="${href}"><span>${number}</span>${label}</a>`).join("")}
      </nav>
      <div class="side-card">
        <span class="side-label">ESTACIÓN SELECCIONADA</span>
        <strong id="sideRiver">Río Huallaga</strong>
        <small id="sideChannel">Estación tingomaria-01</small>
        <div class="connection"><i id="connectionDot"></i><span id="connectionLabel">Conectando…</span></div>
      </div>
      <button class="settings-button" id="openSettings" type="button">⚙ Configurar conexión</button>
      <p class="side-foot">SITPA IoT<br><span>Cartografía IGN · SITPA</span></p>
    </aside>`;
}

const topbarRoot = document.getElementById("topbar-root");
if (topbarRoot) {
  topbarRoot.innerHTML = `
    <header class="topbar">
      <div>
        <span class="section-tag">CENTRO DE MONITOREO</span>
        <h1>${document.body.dataset.pageTitle || "SITPA"}</h1>
      </div>
      <div class="top-actions">
        <label class="river-control">Río / Estación
          <select id="riverSelect" aria-label="Seleccionar río del Perú"></select>
        </label>
        <label class="range-control">Ventana
          <select id="rangeSelect" aria-label="Cantidad de lecturas">
            <option value="50">50 lecturas</option>
            <option value="100" selected>100 lecturas</option>
            <option value="250">250 lecturas</option>
            <option value="500">500 lecturas</option>
          </select>
        </label>
        <button id="mobileSettings" class="icon-button mobile-settings" type="button" aria-label="Configurar conexión">⚙</button>
        <div class="updated">
          <span>Hora oficial America/Lima (UTC-5)</span>
          <strong id="lastUpdated">—</strong>
          <small id="refreshStatus">Esperando conexión WebSocket</small>
        </div>
      </div>
    </header>
    <section class="operational-strip" aria-live="polite"><span id="serverState">SERVIDOR DESCONECTADO</span><span id="stationState">ESTACIÓN SIN CONFIRMAR</span><span id="telemetryState">SIN TELEMETRÍA</span><strong id="simulationState" hidden>SIMULACIÓN · DATOS DE PRUEBA</strong><strong id="sensorState"></strong></section>
    <p id="connectionNotice" class="forecast-notice" hidden>Estación pendiente de conexión. Las mediciones y alertas en vivo estarán disponibles después de conectar y verificar el ESP32, los sensores y el servicio de telemetría.</p>`;
}

document.body.insertAdjacentHTML("beforeend", `
  <dialog id="settingsDialog">
    <form method="dialog" id="settingsForm">
      <div class="dialog-head">
        <div><span class="section-tag">CONEXIÓN DEL DASHBOARD</span><h3>Configurar SITPA</h3></div>
        <button value="cancel" aria-label="Cerrar">×</button>
      </div>
      <div class="selected-river">
        <span>Estación seleccionada</span><strong id="settingsRiver">Río Huallaga</strong><small id="settingsLocality">Huánuco, San Martín y Loreto</small>
      </div>
      <label>ID de estación<input id="channelInput" value="tingomaria-01" pattern="[a-z0-9][a-z0-9-]{0,63}" required></label>
      <label>URL pública del backend<input id="apiKeyInput" type="url" placeholder="https://api.ejemplo.pe" required></label>
      <p class="privacy-note">El navegador solo necesita la URL del backend y el ID de estación. Las credenciales MQTT permanecen en el dispositivo y el servidor.</p>
      <div class="dialog-actions"><button value="cancel" class="secondary-button">Cancelar</button><button id="saveSettings" value="default" class="primary-button">Guardar y conectar</button></div>
    </form>
  </dialog>
  <div id="toast" role="status" aria-live="polite"></div>`);
}
