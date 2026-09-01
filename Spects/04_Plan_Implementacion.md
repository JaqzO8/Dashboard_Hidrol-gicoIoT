# Especificación 04 — Plan de implementación
**Objetivo:** llevar `https://jaqzo8.github.io/Dashboard_Hidrol-gicoIoT/` de su estado actual a uno que cumpla las Especificaciones 01, 02 y 03, sin romper el flujo de CI/CD ya definido en `docs/GUIA_DESPLIEGUE.md`.

## 1. Antes de tocar código

- [ ] Rotar las dos claves de ThingSpeak compartidas en el chat (ver Especificación 01, §1).
- [ ] Confirmar con el responsable IoT las unidades y el catálogo de field7 (AS-01 a AS-06) — bloquea poder quitar la etiqueta "por confirmar" de la interfaz.

## 2. Mapeo a la estructura técnica ya definida (sección 19.1 del documento de elicitación)

| Archivo | Cambios requeridos |
|---|---|
| `src/services/thingspeak.js` | Implementar `fetchIncremental(channelId, lastEntryId)`, `fetchField(channelId, fieldNumber, results)`, `fetchStatus(channelId)`; excluir cualquier endpoint de escritura |
| `src/core/live-feed.js` | Reemplazar el sondeo fijo por el esquema adaptativo de la Especificación 01 §4 (15 s base / 5 s ráfaga / 60 s en segundo plano + backoff) |
| `app.js` | Centralizar el estado de "ventana activa" para que KPI, gráficos, tabla y CSV lean de una sola fuente (Especificación 03 §3); agregar el indicador de tres estados (En vivo / Retrasado / Sin conexión) |
| `styles.css` | Migrar a los tokens de color/tipografía de la Especificación 02 §2; quitar sombras/radios uniformes de "kit de tarjetas"; implementar la regla limnimétrica y el hidrograma en miniatura del hero |
| `data/peru-rivers.js` | Sin cambios funcionales; verificar que los ríos sin canal sigan mostrando "Estación pendiente" (regla ya definida en 18.3) |
| `tests/dashboard.test.mjs` | Añadir pruebas CP-13 a CP-17 (Especificación 03 §4) |
| `docs/GUIA_DESPLIEGUE.md` | Actualizar la sección "Recuperación" para describir el nuevo esquema de backoff en vez de "reintentos progresivos" genérico |

## 3. Orden sugerido (evita retrabajo)

1. **Datos primero:** implementar el sondeo adaptativo y el manejo de `null`/atípicos/entry_id (Especificaciones 01 y 03) — esto no depende del rediseño visual y es lo que más impacta la "precisión en tiempo real" que pediste.
2. **Diseño después:** aplicar los tokens y el hero con hidrograma/regla limnimétrica (Especificación 02) una vez que los datos que va a mostrar ese hero ya sean correctos.
3. **Publicar:** seguir el flujo ya documentado — `npm test` → merge a `main` → GitHub Actions compila con Vite → publica en GitHub Pages.
4. **Verificar en producción:** repetir la lista de comprobación posterior de `GUIA_DESPLIEGUE.md`, agregando: confirmar que el indicador de estado pasa correctamente a "Retrasado" si se simula inactividad, y que ninguna clave aparece en el bundle publicado (`view-source:` sobre la URL pública o `curl` a los `.js` generados).

## 4. Criterio de aceptación de este trabajo

- Ningún archivo servido por GitHub Pages contiene una clave de escritura ni una clave de lectura fija.
- El indicador de conexión distingue En vivo / Retrasado / Sin conexión y nunca muestra un dato viejo como si fuera actual.
- Los valores 0 y negativos válidos aparecen; solo `null`/vacío se muestra como ausencia.
- La interfaz visual no depende de tarjetas idénticas ni de un acento decorativo sin relación con el dominio hidrológico; el hero muestra el dato real (nivel + tendencia), no una composición genérica.
- Las pruebas CP-01 a CP-17 pasan en CI antes de publicar.
