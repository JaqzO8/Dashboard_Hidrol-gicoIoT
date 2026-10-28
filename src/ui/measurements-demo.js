// Illustrative readings, separate from physical telemetry and official assessments.
const groups = [
  { title: 'Calidad y uso del agua', context: 'Fuente, purificación, riego, estanque o tanque', rows: [
    ['pH', '7,2', 'pH'], ['Turbidez', '1,8', 'NTU'], ['Conductividad', '420', 'µS/cm'],
    ['Temperatura del agua', '24,5', '°C'], ['Oxígeno disuelto', '6,4', 'mg/L'],
    ['Cloro residual libre', '0,5', 'mg/L'], ['Caudal de uso', '12,0', 'L/min'],
    ['Volumen disponible', '750', 'L'], ['Llenado del tanque', '75', '%']
  ], note: 'Bomba: encendida · Suministro: activo. Ejemplo de control de disponibilidad y continuidad.' },
  { title: 'Nivel y crecidas', context: 'Ejemplo de maqueta de 12 cm', rows: [
    ['Nivel del agua', '5,4', 'cm'], ['Velocidad de subida', '0,2', 'cm/min'],
    ['Estimación a 3 minutos', '6,0', 'cm']
  ], note: 'Aviso de ejemplo: podría alcanzar el umbral de atención de la maqueta si mantiene ese ritmo. No representa una crecida real.' },
  { title: 'Condiciones ambientales', context: 'Entorno del punto de monitoreo', rows: [
    ['Temperatura ambiente', '28,4', '°C'], ['Humedad relativa', '78', '%'],
    ['Sensor de lluvia', 'Mojado', 'detección']
  ], note: 'Aviso de ejemplo: placa mojada. El sensor detecta agua sobre la placa; no mide precipitación en milímetros.' },
  { title: 'Aire en instalaciones', context: 'Ejemplo de monitoreo interior', rows: [
    ['Dióxido de carbono (CO₂)', '850', 'ppm'], ['Partículas PM2,5', '12', 'µg/m³'],
    ['Partículas PM10', '24', 'µg/m³'], ['Temperatura interior', '26,1', '°C'],
    ['Humedad interior', '62', '%']
  ], note: 'Permite observar cambios y revisar ventilación. Estos valores de ejemplo no certifican la salubridad del ambiente.' }
];

const root = typeof document !== 'undefined' && document.getElementById('measurementsDemo');
if (root) {
  root.innerHTML = `<div class="card-head"><div><p class="eyebrow">DEMO · DATOS ILUSTRATIVOS</p><h2>Agua, salubridad y ambiente</h2></div><a class="secondary-button" href="#demoRecords">Ver datos de la demo ↓</a></div>
    <p>Ejemplos de mediciones para distintas actividades. Valores simulados fijos, sin conexión a sensores y sin actualización en vivo. La presentación describe las áreas de aplicación; no aporta estos valores numéricos.</p>
    <div class="demo-measurements-grid">${groups.map(group => `<article class="demo-measurement-card"><span class="section-tag">DEMO</span><h3>${group.title}</h3><p>${group.context}</p><dl>${group.rows.map(([label, value, unit]) => `<div><dt>${label}</dt><dd>${value} <small>${unit}</small></dd></div>`).join('')}</dl><p class="demo-note">${group.note}</p></article>`).join('')}</div>
    <aside class="demo-sanitation"><h3>Salubridad · evaluación pendiente</h3><p><strong>Potabilidad: no determinada. Análisis microbiológico: no disponible.</strong> Las mediciones orientan el seguimiento operativo. La aptitud para consumo, crianza o riego requiere controles específicos para cada uso y análisis correspondientes. La demo no reemplaza análisis sanitarios ni alertas oficiales.</p></aside>
    <details id="demoRecords"><summary>Datos de la demo · ${groups.reduce((sum, group) => sum + group.rows.length, 0)} mediciones</summary><p>Escenario fijo de demostración · sin fecha de muestreo real. Estos datos no forman parte del histórico del ESP32.</p><div class="table-wrap"><table><thead><tr><th>Área</th><th>Medición</th><th>Valor</th><th>Unidad</th><th>Origen</th></tr></thead><tbody>${groups.flatMap(group => group.rows.map(([label, value, unit]) => `<tr><td>${group.title}</td><td>${label}</td><td>${value}</td><td>${unit}</td><td>Demo simulada</td></tr>`)).join('')}</tbody></table></div></details>`;
}
