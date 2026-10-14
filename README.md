# SITPA

Sistema de apoyo a la prevención y toma de decisiones hidrológicas. ESP32 → MQTT → backend → SQLite / WebSocket → dashboard. La alarma física funciona independientemente de Internet.

Página pública: **https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/**. GitHub Pages publica automáticamente las cinco páginas al actualizar `main`, después de las pruebas y la compilación. Los gráficos se descargan cuando hacen falta, reduciendo la carga inicial del resumen.

La estación está pendiente de conexión. El broker y el backend están preparados en el PC; todavía no tienen un alojamiento público. Por eso la web publicada muestra «Sin telemetría», sin lecturas de demostración ni alertas activas. La activación requiere configurar un backend HTTPS/WSS y comprobar el ESP32 con sus sensores.

El logo oficial es `public/sitpa-logo.jpg`, copia sin modificaciones de `SITPA_logo.jpg`. Se conservan las cinco páginas, sidebar, limnímetro, indicadores, gráficas, CSV y catálogo IGN de 969 ríos. ThingSpeak ya no participa en el firmware ni en la web.

## Ejecutar sin placa

Requisito: Node.js 24 o superior.

```powershell
npm ci
npm test
npm run build:github
npm run local
```

Abrir http://localhost:4173. Inicia broker **Aedes de pruebas** en loopback:1883, backend:8787 y web:4173. Sin ESP32, la pantalla muestra servidor conectado y sin telemetría. No se inventan mediciones. Ctrl+C detiene los procesos.

Para una demostración explícita, en otra terminal:

```powershell
npm run simulate
```

En «Configurar conexión»: estación `sim-tingomaria-01`, URL `http://127.0.0.1:8787`. Se muestra **SIMULACIÓN · DATOS DE PRUEBA**. Modos opcionales: `$env:SIM_MODE='critical'` o `'invalid'`. Para volver al equipo físico, seleccionar `tingomaria-01` y detener el simulador.

## Preparación para el ESP32

La configuración local con TLS, CA y cuentas separadas ya está generada en archivos privados. Se conservó el Wi-Fi existente por indicación del usuario. El sketch fue movido por Arduino a `iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino`; los scripts usan esa ubicación.

```powershell
npm run check:hardware
npm run verify:hardware
npm run hardware
```

El último comando inicia broker TLS, backend y web para la placa, sin simulaciones. El PC y el ESP32 deben compartir la red. La regla del firewall requiere una única ejecución de `tools/configure-hardware-firewall.ps1` en PowerShell como administrador; no se pudo crear desde esta sesión sin elevación. Consulte [Preparación de carga](docs/SITPA_04_PREPARACION_ESP32.md) antes de conectar sensores o cargar.

## Componentes

- `iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino`: firmware solicitado, snapshots cada 1000 ms; DHT11, FC-37 AO, ultrasónico, OLED, LEDs y buzzer originales.
- `backend/src/`: validación MQTT, base de datos persistente, REST, WebSocket, auditoría y predicción separada.
- `src/services/realtime.js` y `src/core/realtime-feed.js`: suscripción con reconexión; no sondeo periódico HTTP.
- `public/sitpa-config.json`: URL pública del backend; nunca credenciales MQTT.
- `compose.yaml`: alternativa local con Mosquitto y backend en Docker.
- `tools/compile-firmware.ps1`: compilación ESP32 de comprobación; `-UseLocalSecrets` produce la imagen configurada. Ninguna de las dos carga la placa.
- `tools/upload-firmware.ps1`: recompila con configuración local y carga únicamente en el COM indicado explícitamente.

El contrato usa centímetros y cm/min; la web convierte nivel y edge a metros. El FC-37 solo detecta lluvia, no cuantifica precipitación. La escala inicial corresponde al prototipo de 20 cm; no es una calibración de campo del río.

## Pronóstico

La proyección edge +3 min se muestra solo con telemetría reciente y sensor válido, identificada como extrapolación no validada. Trend Baseline 1.0.0 usa pendiente robusta sobre 30 agregados de un minuto. +5/+15/+30 min requieren evidencia temporal específica, calidad, datos recientes y límites de error aceptados. +1 a +5 h quedan deshabilitados: no hay modelos entrenados ni validaciones reales.

No se suministran MAE/RMSE ni confianza inventados. El simulador no sirve para validar un modelo hidrológico.

## Documentación

- [Auditoría inicial](docs/SITPA_01_AUDITORIA.md)
- [Operación, protocolo y pruebas físicas](docs/SITPA_02_OPERACION.md)
- [Despliegue](docs/GUIA_DESPLIEGUE.md)
- [Entrega y evidencias](docs/SITPA_03_ENTREGA.md)
- [Preparación de carga del ESP32 y credenciales locales](docs/SITPA_04_PREPARACION_ESP32.md)

GitHub Pages aloja solo el frontend; el backend requiere alojamiento independiente. Se conservó el Wi-Fi guardado por solicitud del usuario; su renovación y la de la antigua clave ThingSpeak siguen pendientes antes de producción. Las cuentas MQTT son nuevas. `secrets.h`, `.env`, `.local-mqtt`, bases de datos y binarios están ignorados y no se publican.
