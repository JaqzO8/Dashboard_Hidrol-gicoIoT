# Guía de despliegue — PAE HydroWatch

## Objetivo

Publicar el dashboard hidrológico en un subdominio HTTPS gratuito y estable durante al menos una semana, sin comprar un dominio ni exponer credenciales de ThingSpeak.

## Plataforma seleccionada

La publicación principal utiliza **GitHub Pages** con GitHub Actions, HTTPS automático y despliegue continuo desde la rama `main`. OpenAI Sites se conserva como publicación alternativa de respaldo.

### Dirección de producción

- URL principal: **https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/**
- Repositorio: **https://github.com/JaqzO8/Dashboard_Hidrol-gicoIoT**
- URL de respaldo: **https://pae-hydrowatch-3420787.jaqz08.chatgpt.site**
- Fecha de publicación: **18 de julio de 2026**.
- Acceso: **público**, sin inicio de sesión.
- Transporte: **HTTPS** administrado por la plataforma.
- Flujo de publicación: `.github/workflows/pages.yml`.

### Costo

- Compra de dominio: **S/ 0**.
- Certificado HTTPS: **S/ 0**.
- Servidor propio: **S/ 0**.
- Mantenimiento obligatorio durante la primera semana: **S/ 0**.

La opción es rentable para demostraciones, validación académica y operación de bajo tráfico. Si en el futuro se necesita una marca institucional propia, se podrá asociar un dominio comprado sin reescribir el dashboard.

## Arquitectura publicada

1. El visitante abre la URL HTTPS del sitio.
2. Sites entrega la interfaz estática desde su infraestructura administrada.
3. El usuario selecciona un río del catálogo hidrográfico nacional.
4. Si el río tiene una estación asociada, el navegador consulta directamente su canal mediante la API HTTPS de ThingSpeak.
5. Los datos se transforman y grafican localmente en el navegador.
6. No existe base de datos, servidor de aplicación ni API Key incorporada al despliegue.

### Modelo multi-río

- El canal 3420787 se identifica como telemetría del Río Huallaga.
- El catálogo nacional contiene 969 ríos nombrados en la cartografía IGN 1:500 000.
- Los ríos sin canal muestran “Estación pendiente”; no reutilizan ni presentan los datos del Huallaga.
- Cada río puede recibir un ID de canal y una Read API Key independiente durante la sesión.
- La fuente oficial del catálogo es la capa Ríos y Quebradas del geoportal IDEP/IGN: https://www.idep.gob.pe/geoportal/rest/services/DATOS_GEOESPACIALES/PER%C3%9A_500K/MapServer/23

## Seguridad

- El canal público funciona sin credenciales.
- Una Read API Key opcional se introduce en la interfaz y vive solo en `sessionStorage`.
- La clave desaparece al cerrar la pestaña y no se envía al hosting.
- Las configuraciones por río permanecen únicamente en `sessionStorage`.
- La política CSP solo permite conexiones a `api.thingspeak.com` y los recursos visuales declarados.
- El sitio no escribe ni elimina datos de ThingSpeak.

## Construcción y versionado

La orden `npm run build` genera un Worker de producción en `dist/server/index.js`. El despliegue guarda una versión inmutable asociada al estado exacto del código fuente. Una nueva publicación debe ejecutar pruebas, generar el build, guardar una nueva versión y publicarla.

## Comprobación posterior

- Abrir `https://pae-hydrowatch-3420787.jaqz08.chatgpt.site` desde una ventana privada.
- Confirmar que se muestra “Público · conectado”.
- Verificar que nivel, temperatura, humedad y registros coinciden con ThingSpeak.
- Cambiar la ventana a 50 y 250 lecturas.
- Verificar la versión móvil a 390 px.
- Exportar un CSV de prueba.

## Disponibilidad mínima de una semana

No se configuró expiración ni tarea de eliminación. El despliegue cumple la permanencia mínima solicitada de una semana y puede seguir operativo después de ese plazo. Para mantener la URL:

- No archivar ni eliminar el proyecto de Sites.
- Mantener el canal ThingSpeak accesible.
- No cambiar las reglas CORS del canal o de MathWorks.
- Revisar el sitio al inicio y al final de la semana.

### Lista semanal de operación

1. Confirmar que la URL responde mediante HTTPS.
2. Comparar la lectura más reciente con el canal 3420787.
3. Confirmar que la marca de tiempo continúa avanzando.
4. Probar la actualización manual y la descarga CSV.
5. Registrar cualquier incidencia y la versión publicada.

## Recuperación

Si ThingSpeak queda temporalmente fuera de servicio, el dashboard conserva su interfaz y vuelve a consultar automáticamente cada 20 segundos. Si el despliegue se modifica incorrectamente, se debe volver a publicar la última versión aprobada.

## Responsables sugeridos

- Product Owner: aprueba cambios visibles.
- Responsable IoT: valida campos, unidades y estados.
- Responsable técnico: ejecuta pruebas y publicación.
- Usuario operativo: confirma legibilidad y actualización de datos.
