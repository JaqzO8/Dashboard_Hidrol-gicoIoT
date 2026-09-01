# Especificación 01 — Integración con ThingSpeak
**Proyecto:** PAE HydroWatch — Dashboard Hidrológico de Prevención
**Canal base:** 3420787 (Río Huallaga) · **Versión:** 1.0 · **Estado:** Propuesto para implementación
**Referencia:** consolida y precisa RF-01 a RF-06, RNF-02 a RNF-04, y la sección 18 del documento de elicitación "de Prevención".

---

## 1. Nota previa de seguridad (léase antes de continuar)

Las dos claves que compartiste en el chat (`PNG3H1HI4YMSG9Z0` de escritura y `JL1D45UTN2NQ70MH` de lectura) quedaron registradas en esta conversación. No es una vulnerabilidad del dashboard, pero es buena práctica **rotarlas desde tu panel de ThingSpeak** (Channel Settings → API Keys → *Generate New API Key*) antes de dejar el proyecto en producción, y usar las nuevas claves solo donde se indica abajo. Esta especificación asume que trabajarás con las claves ya rotadas.

---

## 2. Rol de cada endpoint en el dashboard

El documento de elicitación excluye explícitamente la escritura hacia ThingSpeak (sección 2.2, "Fuera de alcance") y el dashboard es de solo lectura (RNF de seguridad RNF-03). Por lo tanto, de los cuatro endpoints que compartiste, **solo tres pertenecen al dashboard**:

| Endpoint | Uso en HydroWatch | Dónde vive |
|---|---|---|
| `POST/GET update?api_key=...&field1=...` (Write) | **No forma parte del dashboard.** Sirve solo para el firmware del sensor o un script de simulación de pruebas. | Firmware IoT o `scripts/simulate-feed.mjs` (herramienta de desarrollo, fuera del bundle público) |
| `channels/{id}/feeds.json?results=N` (Read Feed) | Endpoint principal: carga histórica según ventana (50/100/250/500, RF-07) y sondeo incremental | `src/services/thingspeak.js` |
| `channels/{id}/fields/{n}.json?results=N` | Lecturas puntuales de un solo campo cuando solo se necesita un valor (p. ej. widget compacto de nivel en la barra lateral) para reducir payload | `src/services/thingspeak.js` (función `fetchField`) |
| `channels/{id}/status.json` | Registro textual de "Channel Status Updates" de ThingSpeak, si el canal lo usa. **Es un campo de texto libre de ThingSpeak, distinto de `field7`** (que es el semáforo operativo 0–3 definido en el diccionario del proyecto). Se muestra como bitácora complementaria opcional, nunca como sustituto del estado field7. | `src/services/thingspeak.js` (función `fetchStatus`, opcional/best-effort) |

**Regla dura:** el Write API Key nunca se incrusta en `app.js`, `index.html`, ni en ningún archivo servido por GitHub Pages. Un `grep -r "api_key=" dist/` antes de cada publicación debe devolver únicamente el patrón de lectura opcional del usuario (nunca una clave fija).

---

## 3. Diccionario de campos (confirmado por muestra de canal, unidades pendientes de validación — AS-01 a AS-06)

| Campo | Nombre | Unidad observada | Precisión a preservar | Uso |
|---|---|---|---|---|
| field1 | Nivel | m (por validar) | 5 decimales tal como llega de la API | KPI principal + serie histórica |
| field2 | Lluvia | mm o bandera 0/1 (por validar) | entero o 1 decimal | Indicador de evento |
| field3 | Temperatura | °C | 1 decimal | KPI ambiental |
| field4 | Humedad | % HR | 1 decimal | KPI ambiental |
| field5 | Velocidad | por validar | 5 decimales | Serie de dinámica del nivel |
| field6 | Nivel Predicción | m o salida de modelo | 5 decimales | Serie independiente (nunca en el mismo eje que field1) |
| field7 | Estado Actual | 0=Normal, 1=Preventivo, 2=Alerta, 3=Crítico (supuesto, pendiente de validación con responsable IoT) | entero | Semáforo operativo textual + color |

> Mientras AS-01/AS-02 no estén aprobados por el responsable IoT, la interfaz debe mostrar la unidad como **"unidad por confirmar"** en vez de inventar una unidad definitiva — así se evita comunicar falsa precisión.

---

## 4. Cadencia de sondeo (corrige un dato técnico del documento de elicitación)

La sección 18.2 del documento de "Prevención" describe una "frecuencia de consulta incremental de 1 segundo". **Esto no es alcanzable de forma sostenida**: las cuentas gratuitas de ThingSpeak aceptan como máximo **una escritura nueva cada 15 segundos por canal**; sondear el endpoint de lectura cada 1 segundo no produce datos nuevos casi nunca, y sí consume cuota y puede disparar `429 Too Many Requests` si se combina con otras pestañas o con el widget nativo de ThingSpeak abierto en paralelo.

**Estrategia corregida — sondeo adaptativo:**

1. **Modo base (pantalla en foco):** sondeo cada **15 s**, alineado al intervalo mínimo real de escritura del canal. Esto ya cumple RNF-02 (reflejar una lectura nueva en ≤ 25 s).
2. **Modo ráfaga (tras detectar un `entry_id` nuevo):** durante los 20 s siguientes a un cambio, sondear cada 5 s por si llegan lecturas adicionales en cadena (por ejemplo, durante un evento de lluvia con envíos más frecuentes). Después, vuelve al modo base.
3. **Modo pestaña en segundo plano (`document.hidden === true`):** reducir a 1 sondeo cada 60 s para ahorrar cuota; al volver a foco, sondear inmediatamente.
4. **Sondeo incremental real:** en vez de pedir `results=N` completo en cada ciclo, guardar el último `entry_id` recibido y pedir `feeds.json?start={ultimo_entry_id+1}` (o `channels/{id}/feeds/{ultimo_entry_id}.json` para 1 solo registro nuevo). Solo se re-pide la ventana completa (`results=50/100/250/500`) cuando el usuario cambia el selector de ventana o al cargar la página.
5. **Backoff en error:** ante fallo de red o `429`, aplicar backoff exponencial 15 s → 30 s → 60 s (tope), y volver a 15 s en cuanto una respuesta sea exitosa. Esto satisface RNF-15 (recuperación sin recargar la página).

Este esquema es **más preciso que un sondeo fijo de 1 s** porque evita descartar respuestas idénticas (ruido) y en cambio reacciona en cuanto hay un dato realmente nuevo, con menor latencia percibida que un sondeo fijo de 20 s.

---

## 5. Manejo de fecha y hora (resuelve una pregunta abierta del documento — AS/15.3)

- ThingSpeak entrega `created_at` en UTC. El dashboard debe:
  - Convertir y mostrar en **America/Lima (UTC−5, sin horario de verano)**, formato `es-PE`.
  - Mostrar la hora UTC original en el `title`/tooltip de cada timestamp, para trazabilidad y depuración.
  - Calcular "hace cuánto se actualizó" comparando la hora del **dispositivo** contra `created_at`, y marcar visualmente (no solo con color) cuando la última lectura tenga más de 2× el intervalo esperado (30 s) sin actualizarse — esto evita que datos obsoletos se lean como actuales (RNF cubierto en sección 6.1 del doc: "Datos desactualizados se interpretan como actuales", riesgo R-06).

---

## 6. Configuración multi-río y claves de sesión

- Cada río del catálogo (`data/peru-rivers.js`, 969 registros IGN 1:500 000) puede asociarse en tiempo de sesión a un `channelId` y, opcionalmente, un `readApiKey`.
- Estructura de sesión sugerida (en memoria + `sessionStorage`, nunca `localStorage`):

```js
// sessionStorage, clave: "hw:river-config"
{
  "huallaga": { "channelId": 3420787, "readApiKey": null }, // canal público: no requiere clave
  "otro-rio-id": { "channelId": 1234567, "readApiKey": "xxxx" }
}
```

- La Read API Key solo se envía como parámetro `api_key` en la URL de la petición HTTPS al momento de la consulta; nunca se persiste en `localStorage`, cookies, ni se registra en `console.log` de producción (RNF-03/04, CP-06/CP-07).
- Content-Security-Policy sugerida:
  ```
  connect-src 'self' https://api.thingspeak.com;
  ```

## 7. Manejo de errores estandarizado

| Código / condición | Mensaje al usuario | Acción del sistema |
|---|---|---|
| `401`/`404` (clave inválida o canal privado sin clave) | "No se pudo conectar al canal. Verifica el ID o la clave de lectura." | No persiste la clave; permite reintento inmediato |
| `429` | "ThingSpeak está limitando las consultas. Reintentando en breve." | Aplica backoff (sección 4.5) |
| Sin conexión / timeout | "Sin conexión con ThingSpeak. Mostrando la última lectura conocida (hh:mm)." | Conserva última data visible; no la borra ni la reemplaza por ceros |
| Feed vacío (río sin estación) | "Estación pendiente — este río aún no tiene datos IoT asociados." | Nunca reutiliza datos del Huallaga como relleno (regla explícita de la sección 18.3) |
