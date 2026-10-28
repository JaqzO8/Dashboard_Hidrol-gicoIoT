# Sensores en GitHub Pages, sin servidor

La instancia AWS fue retirada. La configuración pública usa `transport: serial` y no tiene URL de API.

1. Conectar el ESP32 al USB del equipo y cerrar el monitor serie de Arduino o cualquier otra aplicación que utilice el puerto.
2. Abrir https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/#conexion-usb en Chrome o Edge de escritorio.
3. Pulsar **Conectar ESP32 por USB** y seleccionar CP210x / COM3, o el puerto asignado a la placa. El permiso pertenece al navegador y al sitio.
4. Las lecturas del firmware actual llegan a 115200 baudios cada dos segundos. Nivel, temperatura, humedad, lluvia, tabla y gráficas se actualizan con esas lecturas físicas.
5. Exportar CSV antes de cerrar o recargar. Las últimas 100 lecturas por defecto se conservan solo en memoria. Desconectar USB libera el puerto y retira el estado en vivo.

La fecha es la hora de recepción del equipo. La secuencia es de esta sesión del navegador. La salida serie actual no incluye la predicción del dispositivo; esa columna permanece vacía. La gráfica calcula la proyección a tres minutos a partir del nivel y la velocidad recibidos.

GitHub Pages aloja archivos estáticos. No recibe MQTT, no almacena telemetría y no transmite lecturas a otros visitantes. Sin un servidor adicional, el monitoreo está disponible en el navegador conectado físicamente a la placa, con la página abierta. Los avisos visuales y el sonido permanecen disponibles; las notificaciones remotas y el histórico de servidor están deshabilitados.

Los valores de calidad del agua y aire de la sección demo siguen siendo ilustrativos. Los sensores físicos actuales son nivel, temperatura/humedad ambiente y placa de lluvia.
