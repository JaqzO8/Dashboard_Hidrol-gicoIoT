# SITPA en AWS

Despliegue del 16 de octubre de 2026:

- Web: https://sitpa-54-167-108-112.sslip.io/
- QR: https://sitpa-54-167-108-112.sslip.io/sitpa-aws-qr.png
- EC2: `i-090c3e31aae9d32d2`, Amazon Linux 2023, usuario `ec2-user`.
- Servicios systemd: `caddy`, `sitpa-backend`, `sitpa-broker`.
- Web en `/var/www/sitpa`; código en `/opt/sitpa`; configuración privada en `/etc/sitpa`; SQLite en `/srv/sitpa/data`.
- HTTPS público con renovación automática de Caddy. MQTT usa una CA privada propia, incluida en los dos archivos locales `secrets.h`.

No se recuperó el histórico eliminado con Azure. El backend inicia una base nueva y no contiene lecturas simuladas.

## ESP32

La Wi-Fi guardada se conserva. El firmware con el destino MQTT y su CA de AWS se cargó el 16 de octubre de 2026 en el ESP32-D0WD-V3 detectado en COM3, con verificación del contenido escrito. El monitor serie confirmó lecturas del HC-SR04, DHT11 y FC-37.

El grupo de seguridad `sg-092d16c819f68cd6d` debe admitir TCP 8883 desde la conexión de la placa. Para un punto de acceso móvil cuya IP cambia, el broker admite acceso público en ese puerto con TLS, contraseña y permisos por estación. SSH permanece restringido a la IP actual de administración; no abrir el puerto 22 a todos.

La página es pública y funciona desde cualquier conexión a Internet. El QR depende de conservar la IP `54.167.108.112`: antes de detener/iniciar la instancia, asignar una IP elástica y actualizar el dominio/configuración/QR si cambia la IP.

## Comprobaciones

`node tools/verify-production.mjs https://sitpa-54-167-108-112.sslip.io`

`npm run check:hardware`

`node tools/verify-live-device.mjs`

La última comprobación observa durante 45 segundos el flujo WebSocket del destino configurado en `public/sitpa-config.json` y guarda cadencia, calidad de los tres sensores y ausencia de simulación en `qa-artifacts/esp32-live-report.json`.

Las alertas dentro de la página siguen disponibles. El sonido requiere interacción con la página y las notificaciones del sistema requieren permiso del navegador.
