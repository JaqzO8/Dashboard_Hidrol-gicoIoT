# PAE HydroWatch

Dashboard web para visualizar en una escala clara las lecturas del canal ThingSpeak **3420787** del proyecto hidrológico.

## Ejecutar

Requiere Node.js 18 o superior.

```powershell
npm start
```

Abra `http://localhost:4173`.

## Conexión con ThingSpeak

El canal se consulta mediante la API de lectura de ThingSpeak. Actualmente admite lectura pública, por lo que no se incluye ninguna credencial en el repositorio. Si el canal pasa a privado, use **Configurar conexión** e ingrese la *Read API Key*. La clave se conserva únicamente en `sessionStorage` y desaparece al cerrar la pestaña.

## Funciones

- Actualización automática cada 20 segundos y actualización manual.
- Ventanas de 50, 100, 250 o 500 lecturas.
- Escalas separadas para nivel real, predicción y velocidad.
- Doble escala para temperatura y humedad.
- Estado actual, indicadores clave y resumen interpretativo.
- Tabla de trazabilidad y exportación CSV.
- Diseño adaptable a escritorio, tableta y móvil.

## Supuesto funcional

La interfaz interpreta `field7` con la escala: `0 Normal`, `1 Preventivo`, `2 Alerta`, `3 Crítico`. Debe validarse con el responsable del firmware/modelo antes de uso operativo.

## Pruebas

```powershell
npm test
```
