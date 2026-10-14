# SITPA — operación y contrato

## Preparación del ESP32

Actualización del 13 de octubre: Arduino movió el fuente a `iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino`. Esa es ahora su ubicación de edición. El script de compilación ya la reconoce y prepara una copia temporal en `.tools/sketch/`, reutilizando la caché de librerías; impide compilaciones concurrentes y separa las salidas de comprobación y configuradas. El header `edge_logic.h` y la configuración privada se mantienen en `iot_code/` y se sincronizan a la carpeta del sketch con `prepare:hardware`.

Herramientas verificadas/instaladas: Arduino CLI local en `.tools/arduino-cli/`, core Espressif ESP32 3.3.10, PubSubClient 2.8, ArduinoJson 7.4.2, Adafruit SSD1306 2.5.17, Adafruit GFX 1.12.6, BusIO 1.17.4, DHT 1.4.7 y Unified Sensor 1.1.15.

```powershell
./tools/compile-firmware.ps1
```

Compila para `esp32:esp32:esp32` con `secrets.example.h` vacío. No carga ni requiere una placa. Los binarios de comprobación no contienen Wi-Fi real y no son la compilación configurada para la puesta en servicio.

La preparación adicional de credenciales, broker TLS local, compilación con `-UseLocalSecrets` y carga protegida se describe en `SITPA_04_PREPARACION_ESP32.md`. No copiar los binarios configurados a un sitio público: contienen secretos del dispositivo.

Antes de cargar: confirmar que se trata de un ESP32 clásico con estos GPIO, puerto COM, DHT11 y polaridad real del relé. Actualizar `secrets.h` local con credenciales renovadas y CA del broker. El archivo no se versiona ni se publica. En Arduino IDE abrir una copia del sketch en un directorio homónimo con `edge_logic.h` y `secrets.h`. Para una carga asistida posterior se preparará esa copia con los secretos locales, se compilará y se elegirá el COM detectado; no se ha ejecutado una carga en esta entrega.

| Componente | GPIO / configuración |
|---|---|
| DHT11 | 16; lectura cada 2000 ms |
| FC-37 AO | 36; lectura cada 500 ms; detección ADC<3000 |
| Ultrasónico | TRIG 18 / ECHO 19; muestra cada 60 ms; promedio móvil de 5 muestras; pulseIn máximo 30 ms |
| OLED | SDA 21 / SCL 22; 0x3C; refresco 500 ms; fallo OLED no detiene medición |
| LEDs | verde 25, amarillo 26, rojo 27 |
| Buzzer/relé | 23; HIGH enciende, como en el código efectivo original |
| MQTT | snapshot 1000 ms; cola de un único snapshot reciente; tarea de red aparte |

La alarma local mantiene estados NORMAL, MEDIO≥4 cm, ALTO≥8 cm o velocidad≥2 cm/min y CRITICO≥10 cm o edge≥10 cm. La tendencia conserva el cálculo original cada 2 s y el recorte de bajadas a cero. La proyección edge es nivel + velocidad×3 min, sin atribuirle validez hidrológica.

Al faltar eco: se conserva el último nivel/estado, se invalida la proyección y aparece fallo de sensor. Se mantiene una alarma alta/crítica previa y se añade señal de fallo para niveles menores. La polaridad eléctrica y la respuesta física aún requieren prueba. Revisar niveles eléctricos y alimentación de cada módulo antes de conectarlo.

## Tópicos y mensaje

Prefijo: `sitpa/v1/stations/tingomaria-01/`. Sufijos: `telemetry`, `state`, `alert`, `status`.

`status` usa `online` retenido, latido 10 s y Last Will `offline` QoS1. Telemetría no retenida QoS0; se privilegia el dato reciente y pueden perderse muestras durante cortes. No se afirma entrega garantizada. Estado retenido y alertas de transición se registran sin reactivar alertas históricas al suscribirse.

Contrato `schemaVersion=1`: stationId, sequence, deviceTimestamp, levelCm, distanceCm, rainDetected, rainRaw, temperatureC, humidityPct, riseRateCmMin, edgePredictionCm, edgePredictionMinutes=3, stateCode, state, rssi.

Extensiones: `bootId` aleatorio por arranque, `uptimeMs`, `quality.levelValid/climateValid`, `sensorAgeMs.level/climate/rain`. Ausencias se expresan como null, nunca como cero ficticio. `deviceTimestamp` es época UTC en **milisegundos**, o 0 si no hay hora NTP. El backend agrega `serverTimestamp` en milisegundos e `id` persistente. El JSON del plan se mantiene compatible sin bootId mediante sesión legacy, pero esa modalidad no admite reinicio de secuencia; el firmware nuevo siempre lo incluye.

El backend rechaza JSON/tipos inválidos, estación ajena, secuencia faltante, duplicados, secuencias antiguas, sesiones retiradas, mensajes retenidos históricos y dispositivos con reloj más de 10 s antiguo. El modo producción también rechaza `simulation=true`.

## API y almacenamiento

`GET /api/v1/stations/:id/latest`, `/history`, `/status`, `/forecast`; `GET /healthz`.

Histórico: `resolution=raw|1m|5m|1h`, `from`/`to` en milisegundos UTC, `limit=1..500`, `before` cursor devuelto en `nextBefore`. Los agregados incluyen muestras totales/válidas, promedio/mínimo/máximo de nivel, fracción con lluvia, promedios ambientales/velocidad y estado máximo observado. No son mediciones instantáneas ni precipitación acumulada.

`/ws?stationId=tingomaria-01&limit=100` exige Origin permitido. Entrega snapshot inicial acotado y después eventos telemetry/status/forecast/backend/error. Reinicia con nuevo snapshot al reconectar. El frontend conserva hasta 500 puntos, y REST consulta el histórico bajo petición. Su reloj de freshness solo actualiza etiquetas y no hace polling HTTP.

Estados separados: servidor conectado, estación online y telemetría en vivo. Online no garantiza sensor válido. Umbrales configurables: hasta 3000 ms vivo, hasta 10000 ms retrasado y después sin telemetría. Una predicción retrasada se retira inmediatamente; un fallo del modelo conserva el dato medido.

## Evaluar pronósticos con datos reales

```powershell
node tools/export-telemetry.mjs backend/data/sitpa.sqlite tingomaria-01 backend/data/mediciones.json
node tools/validate-forecast.mjs backend/data/mediciones.json backend/data/validacion.json <maxMAEcm> <maxRMSEcm>
```

Reemplazar los límites por errores aceptados por el responsable, en cm. Se prohíben datos simulados. El evaluador agrupa en minutos, exige 30 minutos de historia de calidad, utiliza Theil–Sen y orígenes temporales sin solapamiento por horizonte. La primera mitad calibra el rango residual 90%; la segunda evalúa MAE, RMSE, sesgo y cobertura con al menos30 casos cada una. Cada +5/+15/+30 min se activa individualmente solo si pasa los límites, cobertura≥80%, telemetría reciente y calidad suficiente. El archivo se configura con `FORECAST_VALIDATION_FILE`; tiene vigencia máxima 30 días y coincide con estación/modelo/versión. Revalidar ante cambios de sensores o régimen.

Los ensayos unitarios usan evidencia sintética únicamente para probar las condiciones del código; esa evidencia no se guarda como modelo válido de la estación. No hay métricas experimentales reales en esta entrega. +1/+2/+3/+4/+5 h permanecen no disponibles. Para ampliarlos se requiere implementar un modelo entrenado independiente y validar cada horizonte; `PredictionService` es el punto de integración de nuevas fuentes, como estaciones aguas arriba o precipitación acumulada real.

## Pruebas físicas pendientes, en este orden

1. Confirmar placa, cableado, alimentación y polaridad; arrancar sin red y observar fallo de sensor correctamente.
2. Medir distancias conocidas y comparar serial/nivel con la referencia 20 cm; probar DHT y FC-37.
3. Pasar por NORMAL/MEDIO/ALTO/CRITICO y comprobar LEDs, buzzer y OLED.
4. Mantener nivel crítico y retirar Wi-Fi; luego cortar broker. La alarma debe continuar.
5. Recuperar conexión: online, telemetría nueva, ninguna ráfaga de datos viejos.
6. Desconectar eco/DHT y verificar calidad, retención del último valor, fallo visible y proyección retirada.
7. Medir al menos 60 s de publicaciones reales y latencia extremo a extremo; registrar pérdida de mensajes.
8. Reiniciar ESP32 y confirmar bootId nuevo y secuencia aceptada.
9. Verificar pérdida de energía, Last Will, datos antiguos y reconexión web.
10. Comenzar colección real y validación temporal. No activar pronósticos por el solo transcurso de días.
