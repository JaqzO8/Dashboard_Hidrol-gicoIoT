// Límites informativos de demostración, no umbrales meteorológicos oficiales.
export const ENV_LIMITS = Object.freeze({ humidityHigh:85, humidityExit:80, temperatureHigh:35, temperatureExit:33 });
export function environmentStates(r, previous={}) {
  const climate=r?.quality?.climateValid===true && Number.isFinite(r.sensorAgeMs?.climate) && r.sensorAgeMs.climate<=10000;
  const rain=Number.isFinite(r?.sensorAgeMs?.rain) && r.sensorAgeMs.rain<=3000 && Number.isInteger(r.rainRaw) && r.rainRaw>=0 && r.rainRaw<=4095;
  return {
    rain:rain ? (r.rainDetected?'wet':'dry') : 'unknown',
    humidity:climate && Number.isFinite(r.humidityPct) ? (r.humidityPct>=(previous.humidity==='high'?80:85)?'high':'normal') : 'unknown',
    temperature:climate && Number.isFinite(r.temperatureC) ? (r.temperatureC>=(previous.temperature==='high'?33:35)?'high':'normal') : 'unknown'
  };
}
export function environmentMessage(kind,state,r) {
  if(state==='unknown') return `${kind==='rain'?'Lluvia':kind==='humidity'?'Humedad':'Temperatura'}: sin lectura válida. Revisa el sensor del prototipo.`;
  if(kind==='rain') return state==='wet'?'Placa de lluvia mojada: se detecta agua. El FC-37 no mide milímetros ni intensidad de lluvia.':'La placa de lluvia está seca de nuevo.';
  const label=kind==='humidity'?'Humedad':'Temperatura', value=kind==='humidity'?r.humidityPct:r.temperatureC, unit=kind==='humidity'?'%':'°C';
  return `${label}: ${value.toFixed(1)} ${unit}. ${state==='high'?'Supera el límite informativo de la demostración.':'Regresó por debajo del límite de aviso.'} No es una alerta de inundación.`;
}
