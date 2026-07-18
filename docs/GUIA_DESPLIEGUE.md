# Guía de despliegue — PAE HydroWatch

## Objetivo

Publicar el dashboard hidrológico en un subdominio HTTPS gratuito y estable durante al menos una semana, sin comprar un dominio ni exponer credenciales de ThingSpeak.

## Plataforma seleccionada

Se utiliza **OpenAI Sites** porque proporciona una URL de producción administrada, HTTPS automático y despliegues versionados. El subdominio no tiene una fecha de vencimiento semanal: permanece disponible mientras el propietario mantenga el sitio activo.

### Costo

- Compra de dominio: **S/ 0**.
- Certificado HTTPS: **S/ 0**.
- Servidor propio: **S/ 0**.
- Mantenimiento obligatorio durante la primera semana: **S/ 0**.

La opción es rentable para demostraciones, validación académica y operación de bajo tráfico. Si en el futuro se necesita una marca institucional propia, se podrá asociar un dominio comprado sin reescribir el dashboard.

## Arquitectura publicada

1. El visitante abre la URL HTTPS del sitio.
2. Sites entrega la interfaz estática desde su infraestructura administrada.
3. El navegador consulta directamente la API HTTPS de ThingSpeak.
4. Los datos se transforman y grafican localmente en el navegador.
5. No existe base de datos, servidor de aplicación ni API Key incorporada al despliegue.

## Seguridad

- El canal público funciona sin credenciales.
- Una Read API Key opcional se introduce en la interfaz y vive solo en `sessionStorage`.
- La clave desaparece al cerrar la pestaña y no se envía al hosting.
- La política CSP solo permite conexiones a `api.thingspeak.com` y los recursos visuales declarados.
- El sitio no escribe ni elimina datos de ThingSpeak.

## Construcción y versionado

La orden `npm run build` genera un Worker de producción en `dist/server/index.js`. El despliegue guarda una versión inmutable asociada al estado exacto del código fuente. Una nueva publicación debe ejecutar pruebas, generar el build, guardar una nueva versión y publicarla.

## Comprobación posterior

- Abrir la URL desde una ventana privada.
- Confirmar que se muestra “Público · conectado”.
- Verificar que nivel, temperatura, humedad y registros coinciden con ThingSpeak.
- Cambiar la ventana a 50 y 250 lecturas.
- Verificar la versión móvil a 390 px.
- Exportar un CSV de prueba.

## Disponibilidad mínima de una semana

No se configuró expiración ni tarea de eliminación. Para mantener la URL:

- No archivar ni eliminar el proyecto de Sites.
- Mantener el canal ThingSpeak accesible.
- No cambiar las reglas CORS del canal o de MathWorks.
- Revisar el sitio al inicio y al final de la semana.

## Recuperación

Si ThingSpeak queda temporalmente fuera de servicio, el dashboard conserva su interfaz y vuelve a consultar automáticamente cada 20 segundos. Si el despliegue se modifica incorrectamente, se debe volver a publicar la última versión aprobada.

## Responsables sugeridos

- Product Owner: aprueba cambios visibles.
- Responsable IoT: valida campos, unidades y estados.
- Responsable técnico: ejecuta pruebas y publicación.
- Usuario operativo: confirma legibilidad y actualización de datos.
