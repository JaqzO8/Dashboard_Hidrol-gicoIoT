import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSerialReading, SerialFeedController } from '../src/services/serial-feed.js';
const sample = 'Nivel=1.43 cm | distancia=16.57 cm | velocidad=-0.20 cm/min | eco=OK | T=26.1 C | HR=87.4 % | clima=OK | lluviaADC=4095 | estado=NORMAL';
test('USB interpreta salida física, conserva descenso y no inventa predicción ni timestamp del dispositivo', () => {
  const row = parseSerialReading(sample, 1, 12345);
  assert.equal(row.levelCm, 1.43); assert.equal(row.riseRateCmMin, -0.2);
  assert.equal(row.temperatureC, 26.1); assert.equal(row.humidityPct, 87.4);
  assert.equal(row.rainDetected, false); assert.equal(row.simulation, false);
  assert.equal(row.serverTimestamp, 12345); assert.equal(row.deviceTimestamp, null);
  assert.equal(row.edgePredictionCm, null);
  assert.equal(parseSerialReading('MQTT no conectado (codigo -2)', 2), null);
  assert.equal(parseSerialReading(sample.slice(0, 40), 2), null);
});
test('USB no presenta sensores inválidos como mediciones actuales', () => {
  const row = parseSerialReading(sample.replace('eco=OK', 'eco=FALLO').replace('clima=OK','clima=FALLO').replace('lluviaADC=4095','lluviaADC=-1'), 1);
  assert.equal(row.levelCm, null); assert.equal(row.temperatureC, null);
  assert.equal(row.quality.levelValid, false); assert.equal(row.rainDetected, null);
  assert.equal(row.sensorAgeMs.rain, 4294967295);
});
test('USB reconstruye líneas fragmentadas, ignora ruido y libera puerto al desconectar', async () => {
  let stream, closed = false; const rows = [], states = [];
  const port = { readable: new ReadableStream({ start(c) { stream = c; } }),
    async open(options) { assert.equal(options.baudRate, 115200); }, async close() { closed = true; } };
  const controller = new SerialFeedController({ serial: { async requestPort() { return port; } }, onLatest: r => rows.push(r), onState: s => states.push(s) });
  await controller.connect(); const encoder = new TextEncoder();
  stream.enqueue(encoder.encode('MQTT desconectado\n' + sample.slice(0, 32)));
  stream.enqueue(encoder.encode(sample.slice(32) + '\r\n' + sample + '\n'));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(r => r.sequence), [1,2]);
  await controller.stop(); assert.equal(closed, true); assert.equal(controller.connected, false);
  assert.deepEqual(states, ['connected','offline']);
});
