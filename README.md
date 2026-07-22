# HydroWatch Perú

Dashboard web multi-río para visualizar en una escala clara las lecturas IoT de estaciones hidrológicas del Perú. El canal ThingSpeak **3420787** corresponde al **Río Huallaga** y es la primera estación activa.

## Producción

El dashboard se despliega automáticamente desde `main` mediante GitHub Actions y GitHub Pages:

**https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/**

Repositorio público: **https://github.com/JaqzO8/Dashboard_Hidrol-gicoIoT**

El despliegue principal y público se mantiene en GitHub Pages.

La operación, seguridad, costos, permanencia y recuperación están descritos en `docs/GUIA_DESPLIEGUE.md`.

## Ejecutar

Requiere Node.js 18 o superior.

```powershell
npm start
```

Abra `http://localhost:4173`.

## Conexión con ThingSpeak

El canal se consulta mediante la API de lectura de ThingSpeak. Actualmente admite lectura pública, por lo que no se incluye ninguna credencial en el repositorio. Si el canal pasa a privado, use **Configurar conexión** e ingrese la *Read API Key*. La clave se conserva únicamente en `sessionStorage` y desaparece al cerrar la pestaña.

## Funciones

- Selector y buscador nacional con 969 ríos nombrados en la cartografía oficial del IGN a escala 1:500 000.
- Ficha de localidad y región hidrográfica para los principales ríos.
- Configuración independiente de un canal ThingSpeak por río durante la sesión.
- Carga inicial de la ventana seleccionada y sincronización incremental cada 15 segundos.
- Pausa inteligente cuando la pestaña está inactiva, reconexión automática y retroceso progresivo ante fallos.
- Compilación optimizada con Vite y módulos separados para interfaz, actualización en vivo y acceso a ThingSpeak.
- Ventanas de 50, 100, 250 o 500 lecturas.
- Escalas separadas para nivel real, predicción y velocidad.
- Doble escala para temperatura y humedad.
- Estado actual, indicadores clave y resumen interpretativo.
- Tabla de trazabilidad y exportación CSV.
- Diseño adaptable a escritorio, tableta y móvil.

## Supuesto funcional

La interfaz interpreta `field7` con la escala: `0 Normal`, `1 Preventivo`, `2 Alerta`, `3 Crítico`. Debe validarse con el responsable del firmware/modelo antes de uso operativo.

## Catálogo hidrográfico

El archivo `data/peru-rivers.js` se genera desde la capa oficial **Ríos y Quebradas** de la Infraestructura de Datos Espaciales del Perú (IGN), filtrando los elementos nombrados como río. Se actualiza con `npm run sync:rivers`.

Fuente: https://www.idep.gob.pe/geoportal/rest/services/DATOS_GEOESPACIALES/PER%C3%9A_500K/MapServer/23

El catálogo identifica cobertura; no inventa telemetría. Los ríos sin canal muestran **Estación pendiente** hasta que se configure una fuente IoT propia.

## Pruebas

```powershell
npm test
```
