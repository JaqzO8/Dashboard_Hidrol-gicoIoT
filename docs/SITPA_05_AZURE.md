# Estado de despliegue Azure — 15 de octubre de 2026

VM: `vm-sitpa-prd-01`, Ubuntu 24.04, usuario `sitpaadmin`, IP `57.156.38.0`.

## Instalado y verificado

- Frontend de cinco páginas en `/var/www/sitpa`; vista preliminar HTTP en `http://57.156.38.0`.
- Backend Node.js 24 en `/opt/sitpa`, gestionado por `sitpa-backend.service`, escucha en loopback:8787.
- Mosquitto con cuentas independientes y ACL para estación y lector. Durante la puesta en servicio, escucha **solo loopback:8883**, con certificado de prueba confiado explícitamente por el backend. No se deshabilita la verificación TLS.
- Disco administrado de 32 GiB montado por UUID en `/srv/sitpa`; SQLite en `/srv/sitpa/data`.
- Copia SQLite consistente diaria a las 02:00 de Lima (07:00 UTC), conserva 30 copias en `/srv/sitpa/backups`. Primera copia e integridad verificadas.
- Reinicio automático de servicios; recuperación del backend comprobada.
- Healthcheck confirma SQLite y MQTT; estación física desconectada y sin mediciones.
- 27 pruebas locales aprobadas; compilación frontend aprobada; instalación de dependencias de producción sin vulnerabilidades reportadas por npm.

Las copias están en el mismo disco administrado: todavía falta respaldo externo para cubrir la pérdida de ese disco. Una etiqueta Azure `backup=daily-30d` por sí sola no configura Azure Backup.

## Pendiente para publicación definitiva

La identidad administrada devuelve HTTP 403 al consultar la IP pública. SSH no concede permisos sobre el portal Azure. El nombre propuesto `sitpa-iot-jaqzo8.chilecentral.cloudapp.azure.com` todavía no resolvía al hacer esta entrega parcial.

1. Asignar etiqueta DNS a `pip-sitpa-prd-01` y obtener el FQDN exacto que devuelve Azure (puede incorporar un identificador adicional).
2. Cuando resuelva a `57.156.38.0`, ejecutar en la VM `sudo bash /tmp/azure-finish.sh <FQDN>`. El script obtiene certificado público, configura redirección HTTPS, sustituye el certificado de pruebas, expone MQTTS:8883 con autenticación y activa la URL del backend en el frontend.
3. Ejecutar desde el repositorio `node tools/verify-production.mjs https://<FQDN>`; comprobar renovación con `sudo certbot renew --dry-run` y permisos MQTT desde fuera de la VM.
4. Actualizar `public/sitpa-config.json` con la URL HTTPS verificada para GitHub Pages. Generar QR para la dirección final.
5. Transferir únicamente la contraseña de la estación por SSH a archivos locales ignorados, actualizar host y CA del ESP32 conservando su Wi-Fi, adaptar el chequeo de hardware (actualmente exige broker LAN), y recompilar. No cargar hasta conectar la placa y confirmar el COM.

Los archivos con credenciales permanecen en `/etc/sitpa` con permisos restrictivos. La clave SSH privada no se almacena en el repositorio. No ejecutar otra vez el modo `--internal-mqtt` después de la publicación definitiva.

## Archivos reproducibles

- `tools/azure-bootstrap.sh`: prepara el disco dedicado e instala Node 24 verificando SHA-256.
- `tools/azure-configure.py`: cuentas, Mosquitto, backend, renovación de certificados y copias.
- `tools/azure-nginx.conf.template`: archivos estáticos, API, WebSocket y límites de solicitudes.
- `tools/azure-finish.sh`: activación tras configurar DNS.
- `tools/verify-production.mjs`: comprobación pública HTTPS, API, CORS y WSS.

Antes de reinstalar, copiar los scripts al servidor, revisar los destinos y respaldar configuraciones existentes. `azure-bootstrap.sh` fue utilizado en la VM vacía; no usarlo para adoptar discos con datos de otro sistema.
