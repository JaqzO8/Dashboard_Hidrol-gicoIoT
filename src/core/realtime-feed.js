import { websocketUrl } from "../services/realtime.js";
export class RealtimeFeedController {
  constructor({ getConfig, onSnapshot, onLatest, onState, onStatus, onForecast, onError, WebSocketImpl = globalThis.WebSocket }) {
    Object.assign(this, { getConfig, onSnapshot, onLatest, onState, onStatus, onForecast, onError, WebSocketImpl });
    this.generation = 0; this.retry = 0; this.running = false; this.connected = false;
  }
  refresh() {
    this.stop(); this.running = true; this.retry = 0; this.connect(this.generation);
  }
  connect(generation) {
    if (!this.running || generation !== this.generation) return;
    const config = this.getConfig();
    if (!config.stationId || !config.apiBaseUrl) { this.onState?.("unconfigured"); return; }
    this.onState?.("connecting");
    let socket;
    try { socket = new this.WebSocketImpl(websocketUrl(config)); } catch (error) { this.onError?.(error); this.onState?.("offline"); return; }
    this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.generation) return;
      this.connected = true; this.retry = 0; this.onState?.("connected");
    };
    socket.onmessage = event => {
      if (generation !== this.generation) return;
      try {
        const message = JSON.parse(event.data);
        if (message.stationId && message.stationId !== config.stationId) return;
        if (message.type === "snapshot") this.onSnapshot?.(message);
        if (message.type === "telemetry") this.onLatest?.(message.reading);
        if (message.status) this.onStatus?.(message.status);
        if (message.forecast) this.onForecast?.(message.forecast);
        if (message.type === "backend") this.onStatus?.({ brokerConnected: message.brokerConnected, stationOnline: false });
        if (message.type === "error") { this.onForecast?.(null); this.onError?.(new Error("El backend no puede guardar las lecturas")); }
      } catch { this.onError?.(new Error("Mensaje de tiempo real inválido")); }
    };
    socket.onerror = () => this.onError?.(new Error("No se pudo conectar al backend SITPA"));
    socket.onclose = () => {
      if (generation !== this.generation || !this.running) return;
      this.connected = false; this.onState?.("offline"); this.onForecast?.(null);
      const delay = Math.min(30000, 1000 * 2 ** Math.min(this.retry++, 5));
      this.timer = setTimeout(() => this.connect(generation), delay);
    };
  }
  stop() {
    this.running = false; this.connected = false; this.generation++;
    clearTimeout(this.timer);
    if (this.socket) { this.socket.onclose = this.socket.onmessage = this.socket.onerror = this.socket.onopen = null; this.socket.close(); this.socket = null; }
  }
}
