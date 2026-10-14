# Despliegue SITPA

Destino principal del frontend: **https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/**, mediante GitHub Pages y el workflow `.github/workflows/pages.yml`. El repositorio público es https://github.com/JaqzO8/Dashboard_Hidrol-gicoIoT.

El frontend puede publicarse antes de conectar el equipo: con `apiBaseUrl` vacío muestra «Estación pendiente de conexión», sin mediciones inventadas. El backend y el broker siguen siendo locales; publicar la página no los expone a Internet ni habilita alertas reales.

## Frontend GitHub Pages

1. Mantener `apiBaseUrl` vacío hasta disponer de un backend público verificado. Nunca introducir la IP privada del PC como URL de producción.
2. Ejecutar `npm ci`, `npm test` y `npm run build:github` con Node 24.
3. Revisar `_site`, excluir secretos y publicar mediante el workflow de GitHub Pages al actualizar `main`.
4. Comprobar que el workflow finaliza correctamente y revisar las cinco páginas y el logo en la dirección pública.
5. Para habilitar mediciones, alojar broker y backend con las condiciones siguientes. Después configurar `public/sitpa-config.json` con `apiBaseUrl` HTTPS del backend y `stationId=tingomaria-01`, y volver a publicar.

La URL existente es https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/. El origen CORS es **https://jaqzo8.github.io**, sin el camino del repositorio. GitHub Pages no ejecuta MQTT, SQLite ni procesos Node.

## Backend independiente

Copiar `backend/.env.example` a `backend/.env`. En producción usar:

- `NODE_ENV=production`.
- `MQTT_URL=mqtts://<host>` y puerto 8883; usuario de backend de solo lectura, contraseña nueva, CA si no es pública.
- `STATION_IDS=tingomaria-01` (sin estaciones simuladas).
- `DATABASE_URL=sqlite:/ruta/persistente/sitpa.sqlite` en volumen persistente.
- `CORS_ORIGIN=https://jaqzo8.github.io` o lista de orígenes HTTPS explícitos.
- `HOST=127.0.0.1` detrás de proxy local o `0.0.0.0` dentro de un contenedor con red controlada.
- `PORT=8787`; exponer HTTPS/WSS con proxy inverso y certificado válido.

Ejecutar `npm run backend`, o construir desde la raíz `docker build -f backend/Dockerfile -t sitpa-backend .`. El Dockerfile usa usuario sin privilegios. El proxy debe permitir upgrade WebSocket `/ws`, aplicar límites de conexiones y conservar el host TLS correcto.

`GET /healthz` devuelve 200 solo con SQLite y MQTT disponibles; 503 indica servicio degradado. CORS controla los navegadores, no autentica lectores: REST y WebSocket son lectura pública de las estaciones permitidas. Si los datos pasan a ser privados, añadir autenticación antes de exponerlos.

## Broker

El desarrollo sin Docker usa Aedes ligado únicamente a 127.0.0.1. No es el broker de producción y el ESP32 no puede acceder al loopback del ordenador.

Para pruebas físicas existe además `npm run hardware`: Aedes con TLS, contraseñas y ACL en la IPv4 LAN seleccionada del PC. Sus secretos están en `.local-mqtt/`, con acceso local restringido, y no se incluyen en Docker ni en la web. Ver `SITPA_04_PREPARACION_ESP32.md`. Este modo requiere que el PC permanezca encendido y no sustituye el despliegue permanente descrito aquí.

`docker compose up --build` proporciona Mosquitto 2 y backend locales. El archivo `mosquitto.local.conf` sin contraseña solo se publica en loopback, para pruebas. Docker Desktop debe estar iniciado; su daemon estaba apagado durante la preparación, por lo que el contenedor no se verificó en esta entrega.

Para producción usar Mosquitto/EMQX/HiveMQ con autenticación y MQTTS. Las plantillas `backend/broker/mosquitto.production.conf.example` y `acl.example` separan:

- usuario `tingomaria-01`: publicar únicamente sus cuatro tópicos;
- usuario `sitpa-backend`: leer tópicos de estaciones, sin controlar actuadores.

Montar certificados y fichero de contraseñas fuera del repositorio. No hay ruta remota para apagar el buzzer ni modificar LEDs. La compatibilidad se basa en MQTT 3.1.1 estándar; las pruebas ejecutadas usaron Aedes, no los tres proveedores externos.

## Permanencia y copias

SQLite usa WAL. Para respaldar con el sistema activo, usar la API de backup SQLite; si se copia manualmente el archivo, detener antes el backend para obtener una copia coherente. No copiar solo el archivo `.sqlite` mientras hay escrituras en WAL.

Retención: crudos 7 días por defecto (`RAW_RETENTION_DAYS`), agregados 365 días y auditoría 30 días. Ajustar a la política del proyecto y exportar datos reales para entrenar antes de que caduquen. Un despliegue en disco efímero pierde el histórico. La limpieza se ejecuta cada hora.

Conservar versiones de la configuración y de los modelos validados. El healthcheck, disco libre, retraso de telemetría y reconexiones requieren supervisión del operador. No se contrataron servicios ni se presupuso un precio de hosting.

## Alternativa Sites

El script previo `npm run build` sigue generando el Worker estático. Su CSP toma únicamente el origen HTTPS/WSS de `public/sitpa-config.json`. No hospeda el backend MQTT. En la consulta del 14 de octubre de 2026, el proyecto registrado en `.openai/hosting.json` devolvió `NOT_FOUND`; por eso se conserva GitHub Pages como destino de publicación y no se crea un Site duplicado.

## Puesta en servicio

Renovar credenciales antes expuestas, cargar CA/host MQTT en `iot_code/secrets.h`, confirmar modelo/puerto de placa, compilar y cargar. Validar sensores y alarmas con y sin Internet. Medir frecuencia y latencia reales. Mantener los pronósticos deshabilitados hasta tener evaluación temporal individual y aceptación del error en unidades físicas.
