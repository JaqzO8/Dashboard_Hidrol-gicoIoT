# SITPA en Azure — 15 de octubre de 2026

URL principal: https://sitpa-iot-jaqzo8.chilecentral.cloudapp.azure.com

La web, API REST, WebSocket seguro y broker MQTTS están desplegados en `vm-sitpa-prd-01` (`57.156.38.0`). La estación `tingomaria-01` todavía no tiene sensores conectados y debe mostrar «Sin telemetría».

## Servicios y almacenamiento

- Nginx sirve las cinco páginas desde `/var/www/sitpa`, redirige HTTP a HTTPS y publica `/api/`, `/healthz` y `/ws`.
- Node.js 24 ejecuta `/opt/sitpa/backend` mediante `sitpa-backend.service`; puerto 8787 solo en loopback.
- Mosquitto publica TLS en 8883. Cada cuenta tiene permisos separados: estación publica sus tópicos; backend lee telemetría. No hay acceso anónimo.
- Certificado Let's Encrypt con renovación programada y copia automática al broker. La prueba `certbot renew --dry-run` pasó. El certificado inicial vence el 13 de enero de 2027.
- Disco administrado de 32 GiB montado por UUID en `/srv/sitpa`. SQLite persiste en `/srv/sitpa/data`.
- Backup SQLite consistente a las 02:00 de Lima, conservando 30 copias en `/srv/sitpa/backups`. Primera copia e integridad verificadas. Estas copias comparten disco con la base: falta respaldo externo para cubrir pérdida del disco; la etiqueta Azure no configura Azure Backup.
- Configuración privada en `/etc/sitpa`, fuera del repositorio y con permisos restrictivos.

## Verificación realizada

27 pruebas locales aprobadas y frontend compilado. Las cinco páginas, logo, API, healthcheck, WSS y restricciones CORS se comprobaron sobre HTTPS. La CA y contraseña del firmware permiten conectar a MQTTS desde el PC. Se comprobó rechazo de contraseña incorrecta, publicación en otra estación y entrega de mensajes a una cuenta sin lectura. Mosquitto puede aceptar la suscripción y filtrar la entrega; no se debe asumir que el SUBACK representa permiso de lectura.

No se insertaron mediciones ficticias. Se envió un payload inválido de comprobación de ACL, rechazado por el backend y registrado en auditoría.

El DNS público se verificó contra Google y Cloudflare. El resolvedor local conservaba temporalmente una respuesta negativa; eso puede impedir abrir el sitio desde algunas redes hasta que expire su caché.

## ESP32

`tools/prepare-azure-hardware.mjs <ruta-clave-SSH>` importa solo la credencial de la estación por SSH, conserva el Wi-Fi existente y guarda el host público y la raíz ISRG Root X1 en ambos `secrets.h` ignorados. Conserva una copia privada de la configuración LAN. Los chequeos de hardware detectan el modo Azure mediante `.local-mqtt/azure.json`.

Compilar: `powershell -ExecutionPolicy Bypass -File tools/compile-firmware.ps1 -UseLocalSecrets`.

Comprobar: `npm run check:hardware`.

Cargar únicamente con placa conectada y COM confirmado: `powershell -ExecutionPolicy Bypass -File tools/upload-firmware.ps1 -Port COMx`.

La imagen configurada contiene credenciales: no publicarla. Quedan pendientes cableado, calibración, Wi-Fi físico, envío de mediciones y prueba de LEDs/buzzer con y sin Internet. Los pronósticos sin validación real continúan deshabilitados.

## Operación

- Estado: `sudo systemctl status sitpa-backend mosquitto nginx`.
- Logs: `sudo journalctl -u sitpa-backend --since today`.
- Backup manual: `sudo systemctl start sitpa-backup.service`.
- Verificación pública: `node tools/verify-production.mjs https://sitpa-iot-jaqzo8.chilecentral.cloudapp.azure.com`.
- QR: `public/sitpa-qr.png`.

Los scripts `azure-bootstrap.sh`, `azure-configure.py`, `azure-nginx.conf.template` y `azure-finish.sh` documentan la instalación. Revisar destinos y respaldar antes de repetirlos; bootstrap se diseñó para el disco dedicado inicialmente vacío. No ejecutar `--internal-mqtt` en el servidor ya publicado.