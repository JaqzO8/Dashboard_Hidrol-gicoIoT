// Escala de la maqueta; no representa niveles oficiales del río Huallaga.
export const PROTOTYPE = Object.freeze({ capacityCm: 12, thresholdsCm: [6, 8, 10], horizonMinutes: 3, stableRateCmMin: 0.3, demonstrationScale:100 });
export const LEVEL_NAMES = ['Normal', 'Atención', 'Alto', 'Crítico'];
export function measuredState(cm) {
  return Number.isFinite(cm) ? PROTOTYPE.thresholdsCm.filter(t => cm >= t).length : null;
}
export function prototypeOutlook(cm, rate) {
  if (!Number.isFinite(cm) || !Number.isFinite(rate)) return null;
  const trend = Math.abs(rate) < PROTOTYPE.stableRateCmMin ? 'estable' : rate > 0 ? 'subiendo' : 'bajando';
  const next = rate >= PROTOTYPE.stableRateCmMin ? PROTOTYPE.thresholdsCm.find(t => t > cm) : undefined;
  const minutes = next === undefined ? null : (next - cm) / rate;
  return { trend, projectedCm: Math.max(0, cm + rate * PROTOTYPE.horizonMinutes), nextCm: next ?? null,
    minutes, approaching: minutes !== null && minutes > 0 && minutes <= PROTOTYPE.horizonMinutes };
}
export function prototypeMessage(cm, state) {
  const actions = ['El agua está por debajo del primer aviso.', 'Vigila la subida del agua.', 'Reduce o detén el llenado de la maqueta.', 'Detén el llenado y evita que el agua alcance los componentes.'];
  return `Prototipo SITPA: ${cm.toFixed(1)} de 12 cm · ${LEVEL_NAMES[state]}. ${actions[state]}`;
}
