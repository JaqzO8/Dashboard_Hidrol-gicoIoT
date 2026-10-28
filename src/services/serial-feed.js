// Read the existing ESP32 serial output without a server or firmware changes.
export function parseSerialReading(line, sequence, receivedAt = Date.now()) {
  const match = line.trim().match(/^Nivel=(\S+) cm \| distancia=(\S+) cm \| velocidad=(\S+) cm\/min \| eco=(OK|FALLO) \| T=(\S+) C \| HR=(\S+) % \| clima=(OK|FALLO) \| lluviaADC=(-?\d+) \| estado=(NORMAL|MEDIO|ALTO|CRITICO)$/);
  if (!match) return null;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const level = number(match[1]), temperature = number(match[5]), humidity = number(match[6]);
  const levelValid = match[4] === 'OK' && level !== null && level >= 0 && level <= 100;
  const climateValid = match[7] === 'OK' && temperature !== null && humidity !== null && humidity >= 0 && humidity <= 100;
  const rain = Number(match[8]), rainValid = rain >= 0 && rain <= 4095;
  return { id: sequence, sequence, stationId: 'tingomaria-01', serverTimestamp: receivedAt,
    deviceTimestamp: null, bootId: 'usb-session', levelCm: levelValid ? level : null,
    distanceCm: levelValid ? number(match[2]) : null, riseRateCmMin: levelValid ? number(match[3]) : null,
    temperatureC: climateValid ? temperature : null, humidityPct: climateValid ? humidity : null,
    rainRaw: rainValid ? rain : null, rainDetected: rainValid ? rain < 3000 : null,
    stateCode: ['NORMAL', 'MEDIO', 'ALTO', 'CRITICO'].indexOf(match[9]),
    edgePredictionCm: null, simulation: false, quality: { levelValid, climateValid },
    sensorAgeMs: { level: levelValid ? 0 : 4294967295, climate: climateValid ? 0 : 4294967295, rain: rainValid ? 0 : 4294967295 } };
}

export class SerialFeedController {
  constructor({ onLatest, onState, onError, serial = globalThis.navigator?.serial }) {
    Object.assign(this, { onLatest, onState, onError, serial });
    this.connected = false; this.sequence = 0; this.opening = false;
  }
  refresh() { if (!this.connected) this.onState?.('unconfigured'); }
  async connect() {
    if (this.connected || this.opening) return;
    if (!this.serial) throw new Error('Abre esta página en Chrome o Edge de escritorio para conectar el ESP32 por USB.');
    this.opening = true;
    let port;
    try {
      port = await this.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.port = port; this.connected = true; this.onState?.('connected');
      this.readTask = this.read(port);
    } catch (error) {
      this.onState?.('offline');
      if (error.name !== 'NotFoundError') throw new Error('No se pudo abrir el USB. Cierra el monitor serie u otra pestaña que use la placa y vuelve a conectar.');
    } finally { this.opening = false; }
  }
  async read(port) {
    const decoder = new TextDecoder(); let buffer = '';
    try {
      this.reader = port.readable.getReader();
      while (this.connected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        if (buffer.length > 4096) buffer = '';
        for (const line of lines) {
          const reading = parseSerialReading(line, this.sequence + 1);
          if (reading) { this.sequence++; this.onLatest?.(reading); }
        }
      }
    } catch {
      if (this.connected) this.onError?.(new Error('Se interrumpió la conexión USB. Revisa el cable y pulsa Conectar ESP32 por USB.'));
    } finally {
      this.reader?.releaseLock(); this.reader = null;
      await port.close().catch(() => {});
      this.port = null; this.connected = false; this.onState?.('offline');
    }
  }
  async stop() {
    this.connected = false;
    await this.reader?.cancel().catch(() => {});
    await this.readTask;
  }
}
