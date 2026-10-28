# Estado de trabajo

- Objetivo: retirar dependencia de AWS y mostrar sensores físicos directamente en GitHub Pages mediante USB.
- Completado: transporte Web Serial a 115200 baudios, parser del firmware existente, tabla/gráficas/avisos y CSV de sesión, controles remotos deshabilitados, API AWS retirada de configuración pública. No se necesita reprogramar la placa.
- Verificado: 40 pruebas aprobadas y build correcto; 3 muestras físicas de COM3 interpretadas correctamente (nivel 1,47 cm, temperatura 26,2 °C, humedad 86,2 %, lluvia ADC 2917). UI local revisada.
- Archivos modificados: app.js, index.html, public/sitpa-config.json, src/ui/shell.js, src/services/serial-feed.js, styles.css, tests/serial.test.mjs, docs/SITPA_AWS.md, docs/CONEXION_USB.md, PROGRESS.md.
- Siguiente paso: publicar y verificar GitHub Pages; usuario debe seleccionar el puerto USB en el navegador compatible para iniciar la lectura. No se verificó todavía la sesión USB de extremo a extremo en el navegador.