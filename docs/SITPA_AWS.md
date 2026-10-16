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

La Wi-Fi guardada se conserva. El destino MQTT y su CA se actualizaron para AWS. Se requiere habilitar TCP 8883 en el grupo de seguridad `sg-092d16c819f68cd6d` para la conexión del ESP32, conectar la placa por USB y cargar el firmware actualizado. SSH permanece restringido a la IP de administración; no abrir el puerto 22 a todos.

La página es pública y funciona desde cualquier conexión a Internet. El QR depende de conservar la IP `54.167.108.112`: antes de detener/iniciar la instancia, asignar una IP elástica y actualizar el dominio/configuración/QR si cambia la IP.

## Comprobaciones

`node tools/verify-production.mjs https://sitpa-54-167-108-112.sslip.io`

`npm run check:hardware`

Las alertas dentro de la página siguen disponibles. El sonido requiere interacción con la página y las notificaciones del sistema requieren permiso del navegador.
