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
      <a class="brand" href="index.html" aria-label="Ir al resumen de YakuAlert">
        <img class="brand-logo" src="yakualert-logo.jpeg" alt="Logo de YakuAlert">
        <span><strong>YakuAlert</strong><small>Prevención hidrológica</small></span>
      </a>
      <nav aria-label="Navegación principal">
        ${pages.map(([href, number, label]) => `<a class="${currentPage === href ? "active" : ""}" href="${href}"><span>${number}</span>${label}</a>`).join("")}
      </nav>
      <div class="side-card">
        <span class="side-label">ESTACIÓN ACTIVA</span>
        <strong id="sideRiver">Río Huallaga</strong>
        <small id="sideChannel">Canal #3420787</small>
        <div class="connection"><i id="connectionDot"></i><span id="connectionLabel">Conectando…</span></div>
      </div>
      <button class="settings-button" id="openSettings" type="button">⚙ Configurar conexión</button>
      <p class="side-foot">YakuAlert IoT<br><span>Cartografía IGN · ThingSpeak</span></p>
    </aside>`;
}

const topbarRoot = document.getElementById("topbar-root");
if (topbarRoot) {
  topbarRoot.innerHTML = `
    <header class="topbar">
      <div>
        <span class="section-tag">CENTRO DE MONITOREO</span>
        <h1>${document.body.dataset.pageTitle || "YakuAlert"}</h1>
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
          <small id="refreshStatus">Sincronización adaptativa · 15 s</small>
        </div>
      </div>
    </header>`;
}

document.body.insertAdjacentHTML("beforeend", `
  <dialog id="settingsDialog">
    <form method="dialog" id="settingsForm">
      <div class="dialog-head">
        <div><span class="section-tag">CONEXIÓN Y CREDENCIALES</span><h3>Configurar estación ThingSpeak</h3></div>
        <button value="cancel" aria-label="Cerrar">×</button>
      </div>
      <div class="selected-river">
        <span>Estación seleccionada</span><strong id="settingsRiver">Río Huallaga</strong><small id="settingsLocality">Huánuco, San Martín y Loreto</small>
      </div>
      <label>ID del canal<input id="channelInput" inputmode="numeric" value="3420787" required></label>
      <label>Read API Key <span>(opcional para canal público)</span><input id="apiKeyInput" type="password" autocomplete="off" placeholder="Se conserva únicamente durante esta sesión"></label>
      <p class="privacy-note">La clave de lectura se conserva únicamente en <code>sessionStorage</code> y nunca se publica.</p>
      <div class="dialog-actions"><button value="cancel" class="secondary-button">Cancelar</button><button id="saveSettings" value="default" class="primary-button">Guardar y conectar</button></div>
    </form>
  </dialog>
  <div id="toast" role="status" aria-live="polite"></div>`);
}
