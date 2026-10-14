# SITPA — auditoría inicial

Fecha local: 11 de octubre de 2026. Checkout: Dashboard_Hidrol-gicoIoT, base 8479459.
Firmware suministrado: `iot_code/09_Codigo_Final_Proyecto.ino` (sin seguimiento al iniciar).
No se encontró otro checkout del repositorio de firmware; se trabaja sobre este archivo indicado por el propietario.

## Flujo encontrado

```text
DHT11 + FC-37 AO + ultrasónico → ESP32 → ThingSpeak → fetch/polling → frontend
                                    └→ OLED / LEDs / buzzer
```

| Elemento | Configuración real |
|---|---|
| DHT | DHT11, GPIO16; el comentario decía DHT22 |
| Lluvia | FC-37 analógico GPIO36; detección ADC <3000; no mide milímetros |
| Ultrasónico | TRIG18, ECHO19; 5 muestras; pulseIn hasta 30 ms |
| OLED | SSD1306 128×64, I2C21/22, dirección 0x3C |
| LEDs | verde25, amarillo26, rojo27 |
| Buzzer/relé | GPIO23, HIGH enciende en el código efectivo; constante LOW contradictoria |
| Nivel | fondo 20 cm, nivel = 20 − distancia, limitado a 0..20 cm |
| Estados | NORMAL0, MEDIO1 desde4 cm, ALTO2 desde8 cm o velocidad≥2 cm/min, CRITICO3 desde10 cm o proyección≥10 cm |
| Velocidad | diferencia temporal, valores negativos recortados a cero |
| Edge | nivel + velocidad ×3 minutos; sin validación experimental |
| Frecuencias | sensores cada2 s, ThingSpeak cada20 s |
| Bloqueos | Wi-Fi hasta10 s, arranque11.5 s, 5×delay40 ms y pulseIn, envío HTTP |
| Seguridad | SSID, contraseña y clave de escritura estaban incrustados; retirados sin registrarlos aquí. Renovación pendiente |

## Frontend y despliegue

Cinco HTML con shell común, app.js, ECharts5.5.1 por CDN, CSS responsive y catálogo IGN de969 ríos.
`src/services/thingspeak.js` llama la API pública; `src/core/live-feed.js` sondea cada15 s, ráfaga5 s y pausa60 s.
fields1..8: nivel, detección de lluvia, temperatura, humedad, velocidad, edge, estado, lluvia ADC.
La UI etiqueta nivel en metros y lluvia en mm, aunque el firmware entrega centímetros y un booleano.
Umbrales web de3.5/5 m no coinciden con el prototipo de4/8/10 cm. Registros/CSV dependen de la misma normalización.
Vite8, Node local24.11.1. GitHub Pages desde main; Node20 en CI. Server estático exponía cualquier archivo del checkout: debe restringirse antes de añadir secretos/backend.
Pruebas base: 15/15 correctas; build:github correcto.

## Arquitectura objetivo

```text
Sensores → ESP32 ─→ alarma local independiente
             └→ MQTT → broker → backend SITPA → SQLite / auditoría / predicción
                                        └→ WebSocket → SITPA Web (GitHub Pages)
                                        └→ REST de histórico acotado
```

Riesgos: unidades, hardware sin conectar, polaridad física del relé, reinicios de secuencia, valores inválidos conservados sin marcar, datos retenidos/repetidos, falsas señales de vida, histórico ilimitado, predicción no validada, TLS y despliegue externo pendientes.
El propietario solicita completar todas las etapas posibles localmente; se continúa en orden con comprobaciones, sin detenerse entre tareas.
