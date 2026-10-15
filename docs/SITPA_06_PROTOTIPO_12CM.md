# Puesta en marcha del prototipo de 12 cm

Configuración del 15 de octubre de 2026: ESP32 clásico ESP32-D0WD-V3 detectado en COM3. El usuario confirmó HC-SR04, alimentación USB, adaptación de ECHO a 3,3 V, altura máxima de agua de 12 cm y distancia aproximada sensor–fondo de 18 cm.

## Medición y avisos

Nivel en cm = 18 − distancia medida en cm. A recipiente vacío se esperan 18 cm de distancia; con 12 cm de agua, 6 cm. La referencia de 18 cm es aproximada: comprobarla con regla y recipiente vacío antes de atribuir precisión a la lectura. Se rechazan ecos menores de 2 cm o mayores de 19 cm; un fallo conserva el último valor pero lo marca como inválido.

| Nivel medido | Estado de presentación | Distancia esperada | Alarma local |
|---|---|---|---|
| Menos de 6 cm | Normal | Más de 12 cm | Sin sonido |
| 6 a menos de 8 cm | Atención | 12 a más de 10 cm | Pulso breve cada 4 s |
| 8 a menos de 10 cm | Alto | 10 a más de 8 cm | Sonido intermitente |
| Desde 10 cm | Crítico | 8 cm o menos | Sonido continuo |

12 cm es la capacidad, no un objetivo de llenado para las pruebas. La bajada de estado requiere descender 0,3 cm por debajo del umbral para evitar oscilaciones. El fallo de nivel tiene un aviso propio y no apaga una alarma alta previa.

Se usa la mediana de cinco ecos. La tendencia ajusta una recta sobre 16 lecturas separadas por 2 s (al menos 30 s continuos). Menos de 0,3 cm/min se muestra como estabilidad instrumental de la maqueta. La proyección a 3 min y el tiempo al siguiente umbral son estimaciones condicionadas a mantener el ritmo, separadas del estado medido. Un fallo del sensor invalida y reinicia la ventana.

## Avisos en dispositivos

Cada visitante activa voluntariamente las notificaciones en su dispositivo. El servidor envía mensajes con el nivel en cm, estado y acción correspondiente; avisa cambios de estado, recuperación y aproximación al siguiente umbral. Evita repetir el mismo estado durante 60 s y el mismo aviso anticipado durante 5 min. No publica avisos con simulaciones, lecturas antiguas o nivel inválido.

«Activar y probar sonido» habilita un tono diferenciado en la página abierta; hay que activarlo nuevamente al recargar. Las notificaciones con la página cerrada usan el sonido del sistema y solicitan vibración donde se admite. El sitio no puede anular silencio, modo No molestar o restricciones del navegador. En iPhone se requiere instalar en la pantalla de inicio y conceder permiso.

## Escala y río real

Una escala educativa 1:100 convertiría 1 cm de maqueta en 1 m, de modo que los umbrales ilustrativos serían 6, 8 y 10 m. **No se han aplicado estos valores al Huallaga.** En un río se necesita referencia topográfica fija, sección local, nivel de desborde, zonas expuestas y validación de los umbrales. El tiempo de subida y las predicciones no se escalan multiplicando por 100.

Referencias: [niveles de agua por lugar, NWS](https://www.weather.gov/aprfc/terminology), [sonido web con intervención del usuario, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [sonido de notificaciones, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notification/silent).

## Prueba de presentación

1. Comprobar el recipiente vacío con una regla: nivel cercano a 0 y distancia cercana a 18 cm.
2. Comprobar puntos conocidos próximos a 6, 8 y 10 cm. Comparar regla, OLED y página; mantener el agua alejada de conexiones eléctricas.
3. Mantener el nivel quieto durante 30 s para observar estabilidad; después subirlo de forma controlada para comprobar la estimación.
4. Activar avisos y sonido en cada dispositivo de prueba. Pulsar «Probar un aviso» y verificar recepción también con la página cerrada. Esta prueba requiere verificar físicamente el teléfono.
5. Comprobar los LEDs, buzzer, lluvia y DHT11; retirar temporalmente el eco para comprobar fallo de sensor y recuperación.

La herramienta `node tools/verify-live-device.mjs` registra 62 s de mensajes físicos recibidos por WSS y guarda un resumen en `qa-artifacts/esp32-live-report.json`. No genera lecturas artificiales. Las pruebas de software no sustituyen la comprobación de cada sensor ni la recepción en un teléfono.

## Avisos ambientales y diagnóstico físico

Temperatura informativa desde 35 °C (regresa a normal por debajo de 33 °C) y humedad desde 85 % (regresa por debajo de 80 %). Son límites de demostración, no predictores de inundación. El FC-37 avisa placa mojada/seca, no intensidad ni milímetros. Los avisos ambientales requieren calidad propia y siguen funcionando aunque falle el sensor de nivel.

La primera carga con valores predeterminados causó reinicios; se resolvieron con `esp32:esp32:esp32:FlashMode=dio,FlashFreq=40`. Se observaron por USB lecturas del HC-SR04, DHT11 y FC-37; temperatura alrededor de 26,4–26,8 °C, humedad 74–76 %, nivel variable y transiciones de estado. La conexión Wi-Fi aún se está comprobando. No confundir carga verificada con entrega a Azure.

La alarma local incorpora un pulso anticipado cuando la velocidad sostenida proyecta el cruce del siguiente umbral en 3 min; ese pulso no cambia el estado del nivel medido. La página presenta la equivalencia 1:100 como demostración y diferencia la proyección con una línea discontinua.

## Verificación del despliegue del 15 de octubre

La página unificada y el backend con umbrales de 6/8/10 cm están desplegados en Azure. Se verificaron HTTPS, SQLite, MQTT, las cuatro API de consulta, WebSocket y restricciones de origen; las 35 pruebas locales pasaron. El archivo de copia previo a la actualización es `/srv/sitpa/backups/before-unified-20261015T223743Z.tar.gz`.

El firmware se cargó en COM3 con verificación del contenido. Se eliminaron reintentos Wi-Fi solapados; cada dos minutos sin conexión se comprueba si la red guardada es visible, sin registrar nombres de redes vecinas ni contraseñas. La prueba de arranque detectó 30 redes, pero ninguna con el nombre guardado. Azure aceptó mediante TLS la misma credencial del firmware desde el equipo. Una observación de 62 s no recibió telemetría física por Internet: falta resolver la visibilidad de la red Wi-Fi, no debe presentarse todavía como conexión ESP32–Azure completada.
