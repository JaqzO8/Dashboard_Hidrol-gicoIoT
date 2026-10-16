// Una sola sirena: los avisos ambientales no interrumpen una alarma más grave.
export function createAlertSiren(context) {
  let active = null;
  function stop() {
    if (!active) return;
    const { oscillator, gain } = active;
    active = null;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.02);
    oscillator.stop(now + 0.025);
  }
  function play(level) {
    const rank = { attention: 1, warning: 2, critical: 3 }[level] || 0;
    if (active && rank > 0 && rank <= active.rank) return;
    stop();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const duration = rank === 3 ? 9.6 : rank === 2 ? 6.4 : rank === 1 ? 3.2 : 0.7;
    const cycle = rank === 3 ? 0.4 : rank === 2 ? 0.64 : 0.8;
    // Onda rica en armónicos y volumen sostenido, con margen para evitar saturación.
    oscillator.type = rank ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(rank ? 700 : 440, now);
    if (rank) {
      for (let offset = 0; offset < duration - 0.01; offset += cycle) {
        oscillator.frequency.linearRampToValueAtTime(1250, now + offset + cycle / 2);
        oscillator.frequency.linearRampToValueAtTime(700, now + offset + cycle);
      }
    }
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(rank ? 0.98 : 0.18, now + 0.02);
    gain.gain.setValueAtTime(rank ? 0.98 : 0.18, now + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    oscillator.connect(gain).connect(context.destination);
    const current = { oscillator, gain, rank };
    active = current;
    oscillator.onended = () => {
      oscillator.disconnect(); gain.disconnect();
      if (active === current) active = null;
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }
  return { play, stop };
}
