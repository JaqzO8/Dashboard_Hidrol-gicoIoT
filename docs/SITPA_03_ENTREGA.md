# SITPA — entrega local y evidencias

Fecha de cierre: 12 de octubre de 2026. Se completó el alcance verificable sin ESP32 ni sensores. No se cargó firmware, no se publicó la web y no se modificaron servicios externos. El sistema aún requiere puesta en servicio física y configuración de infraestructura.

**Ampliación del 13 de octubre:** la preparación local posterior de credenciales, CA, broker TLS, carpeta Arduino y pruebas adicionales está registrada en `SITPA_04_PREPARACION_ESP32.md`. Ese documento actualiza los pendientes y la ruta del firmware de este informe histórico.

## Implementación en el orden del plan

| Etapa | Resultado local |
|---|---|
| 1. Auditoría | Código, pines, unidades, dependencias y riesgos documentados en `SITPA_01_AUDITORIA.md`. |
| 2. Identidad | SITPA en las cinco páginas, metadatos, iconos y avisos. Logo oficial suministrado, copiado sin alteraciones y verificado por SHA-256. Se conserva el diseño original. |
| 3. Secretos | Wi-Fi y MQTT separados en `secrets.h` ignorado; plantillas vacías; sin claves en el navegador. Credenciales originales pendientes de renovación. |
| 4. Firmware | Archivo solicitado migrado de ThingSpeak a MQTT, tareas de sensores y alarma independientes de la conexión. Compilación ESP32 correcta; carga física pendiente. |
| 5. Backend | MQTT, validación, estados, auditoría, REST y WebSocket funcionando localmente con broker Aedes. Plantillas Mosquitto preparadas. |
| 6. Tiempo real | WebSocket con reconexión, estado del servidor/estación/datos por separado y tratamiento de lecturas antiguas. Sin polling ThingSpeak. |
| 7. Histórico | SQLite persistente, deduplicación por arranque/secuencia, consultas paginadas y agregados de 1 min, 5 min y 1 h. CSV comprobado. |
| 8. Predicción | Servicio separado y evaluador temporal preparados. Publicación condicionada a calidad, histórico y evidencia real por horizonte. Sin modelos aprobados todavía. |
| 9. Presentación | Nivel observado y edge separados del pronóstico. Motivos de indisponibilidad, modelo, versión, rango y métricas cuando exista evidencia. |
| 10. Pruebas y despliegue | Pruebas locales, compilación y documentación terminadas. Despliegue público, mediciones reales y pruebas de alarma pendientes. |

## Arquitectura y entregables

```text
Sensores → ESP32 → LEDs / buzzer / OLED (control local)
             └→ MQTT → broker → backend Node.js
                                   ├→ SQLite (crudos, agregados y eventos)
                                   ├→ PredictionService
                                   └→ WebSocket / REST → SITPA web
```

Firmware: `D:\SistemaHidrológico\iot_code\09_Codigo_Final_Proyecto.ino`, acompañado de `edge_logic.h`, `secrets.example.h` y el archivo local ignorado `secrets.h`.

Broker utilizado en pruebas: **Aedes 1.2.0**, exclusivamente en loopback. No hay broker remoto provisionado. Mosquitto 2 queda preparado mediante Compose y ejemplos TLS/ACL; los contenedores no se ejecutaron porque el daemon Docker no estaba activo.

Backend: Node.js 24, cliente MQTT y servidor WebSocket; almacenamiento SQLite con WAL. REST y WebSocket se limitan a lectura de estaciones permitidas. El despliegue público requiere HTTPS/WSS y MQTTS; GitHub Pages solo alojará la web.

La telemetría del firmware se programa cada **1000 ms**. El ensayo de integración midió **0,977 Hz** entre seis mensajes recibidos durante **5,117 s**, usando un publicador simulado. Esta medida no verifica la frecuencia física del ESP32 ni la latencia en Internet. Se medirán ambas al conectar la placa.

ThingSpeak fue retirado de los flujos activos: no hay envío HTTP desde el firmware ni consumo de su API desde la web. El catálogo IGN sigue siendo un catálogo; sus ríos no se presentan como estaciones conectadas.

## Horizontes y métricas

| Horizonte | Estado de entrega | Modelo | MAE | RMSE | Confianza |
|---|---|---|---|---|---|
| 3 min | Implementado; aparece solo con dato reciente y sensor válido; pendiente de prueba física | Edge lineal original | No medido | No medido | No validada |
| 5 min | Deshabilitado, sin evidencia real | Trend Baseline 1.0.0 / Theil–Sen | No medido | No medido | No evaluada |
| 15 min | Deshabilitado, sin evidencia real | Trend Baseline 1.0.0 / Theil–Sen | No medido | No medido | No evaluada |
| 30 min | Deshabilitado, sin evidencia real | Trend Baseline 1.0.0 / Theil–Sen | No medido | No medido | No evaluada |
| 1 h | Deshabilitado | Modelo entrenado pendiente | No medido | No medido | No evaluada |
| 2 h | Deshabilitado | Modelo entrenado pendiente | No medido | No medido | No evaluada |
| 3 h | Deshabilitado | Modelo entrenado pendiente | No medido | No medido | No evaluada |
| 4 h | Deshabilitado | Modelo entrenado pendiente | No medido | No medido | No evaluada |
| 5 h | Deshabilitado | Modelo entrenado pendiente | No medido | No medido | No evaluada |

La línea base robusta utiliza 30 agregados completos de un minuto, suficientes muestras válidas y evaluación temporal separada de calibración. El evaluador calcula MAE, RMSE, sesgo y cobertura, rechaza simulaciones y exige límites de error explícitos. No hay archivo de validación real ni horizonte de pronóstico habilitado en esta entrega. Los datos matemáticos de los tests prueban el software y no constituyen evidencia hidrológica.

## Comprobaciones realizadas

- **21 pruebas automatizadas aprobadas**: contrato, unidades, frescura, filtros de estación, duplicados/reinicios, persistencia, agregados, paginación y condiciones de publicación de predicciones.
- Integración real de procesos locales: publicador MQTT → Aedes → backend → SQLite → WebSocket → REST. Incluye mensajes inválidos, reconexión, Last Will, error de almacenamiento y fallo del modelo. Los errores inducidos se contienen y no producen una lectura ficticia.
- `npm run build:github` y `npm run build` correctos. El segundo conserva el empaquetador estático alternativo de Sites sin publicar.
- `npm audit`: **0 vulnerabilidades** notificadas al cierre; también se comprobó el conjunto de dependencias de producción.
- Arduino CLI compiló para `esp32:esp32:esp32`, core 3.3.10: **1 073 038 bytes de programa (81 %)** y **49 156 bytes globales (15 %)**. Los binarios de comprobación usan la plantilla de credenciales vacías y están en `.tools/firmware-build/`; no son una imagen configurada para puesta en servicio.
- Navegador: escritorio y móvil de 390 px, sin desbordamiento horizontal tras corregir los gráficos; consulta histórica por minuto, tabla de registros y descarga CSV. La simulación está rotulada y sus exportaciones contienen `simulacion=true`.
- Desconexión del simulador: estación offline, telemetría antigua identificada y edge retirado. La última medición conserva su fecha; no se transforma en lectura actual.
- Captura de entrega en `qa-artifacts/sitpa-entrega-local.png`. La estación seleccionada al cierre es `tingomaria-01`, sin lecturas reales.
- El servidor estático responde 404 a `/iot_code/secrets.h`, `/backend/.env` y `/.git/config`, y 200 al logo oficial. Secretos, base de datos y binarios están ignorados por Git.

## Correcciones y límites conocidos

Se corrigieron unidades de centímetros a metros, la atribución incorrecta de milímetros de precipitación al FC-37, el estado de conexión confundido con disponibilidad de datos, el bloqueo de red del firmware, la exposición de la raíz del proyecto por el servidor estático y el desbordamiento móvil de gráficos.

El sensor efectivo original es DHT11 y se conserva así. La lluvia es detección booleana, no acumulación. Los umbrales de nivel pertenecen al prototipo de 20 cm y requieren calibración antes de representar un río. La polaridad HIGH del buzzer corresponde al comportamiento original y debe confirmarse en el montaje.

SQLite en Node.js 24 emite un aviso de API experimental. Vite advierte del tamaño del bloque de gráficos, aproximadamente 605 kB sin comprimir / 206 kB gzip. Ninguno impidió los ensayos; quedan como aspectos de mantenimiento y rendimiento. MQTT QoS0 de telemetría privilegia datos recientes y puede perder muestras durante interrupciones.

## Lo siguiente al disponer del hardware

1. Conectar el ESP32 y confirmar modelo exacto, COM, sensores, alimentación y cableado descritos en la guía de operación.
2. Renovar las credenciales Wi-Fi/ThingSpeak expuestas en el fuente original; completar host, CA y credenciales MQTT locales. Preparar un broker TLS accesible desde la placa: el broker de pruebas ligado a loopback no es accesible por Wi-Fi.
3. Compilar con esa configuración, cargar por el COM confirmado y revisar salida serial, distancias conocidas, DHT, lluvia, OLED, LEDs y buzzer.
4. Probar alarma sin Wi-Fi y sin broker, reconexión, sensor desconectado, reinicios y frecuencia real durante al menos 60 s.
5. Configurar y publicar backend/broker y después frontend si se desea acceso remoto. Recoger datos reales y validar cada horizonte antes de habilitarlo.

Arranque local: `npm run build:github` y `npm run local`; abrir `http://localhost:4173`. Las instrucciones completas están en `SITPA_02_OPERACION.md` y `GUIA_DESPLIEGUE.md`. Los procesos temporales de comprobación se detienen al cerrar esta entrega.
