# Especificación 03 — Precisión de datos en tiempo real
**Referencia:** precisa RF-04, RF-09 a RF-11, RF-23, RNF-01, RNF-02, RNF-09, RNF-11, RNF-13, RNF-15.

## 1. Reglas de fiabilidad numérica

| Regla | Detalle |
|---|---|
| No redondear en el origen | Guardar el valor tal como llega de la API (`Number(feed.field1)`), con todos sus decimales. El redondeo se aplica solo en la capa de presentación (2–3 decimales en el KPI grande), nunca sobre el dato almacenado en memoria/CSV. |
| `null` vs `0` vs cadena vacía | Un `0` o un negativo numéricamente válido **se muestra como dato real**. Solo `null`, `undefined` o cadena vacía (`""`) se tratan como ausencia (RNF-09). Ejemplo de prueba: field2 (lluvia) en `0` significa "no llovió", no "sin dato". |
| Valores atípicos | Nunca se recortan ni se excluyen del gráfico. Si un valor está muy fuera del rango habitual, la escala del eje se recalcula para incluirlo, y el punto se marca visualmente (p. ej. un pequeño indicador) en vez de ocultarse (RF-23). |
| Campos con unidad no confirmada | Se etiquetan explícitamente como "unidad por confirmar" en vez de asumir una unidad — evita comunicar una falsa precisión mientras el responsable IoT no valide el diccionario (AS-01/AS-02). |
| Decimales en la tabla y el CSV | Se exportan con la máxima precisión recibida de la API, no con el redondeo visual del KPI. |

## 2. Identidad del dato (evitar leer datos viejos como actuales)

- Cada lectura mostrada debe llevar visible su `entry_id` y su hora (con formato definido en la Especificación 01, sección 5).
- El estado de conexión del encabezado distingue tres casos, no dos:
  1. **En vivo** — última consulta exitosa hace ≤ 20 s.
  2. **Retrasado** — última consulta exitosa hace > 20 s pero < 3 intervalos (dato probablemente real pero el sensor no ha enviado nada nuevo).
  3. **Sin conexión** — la última consulta a la API falló; se muestra la hora de la última lectura conocida y un mensaje explícito de error (nunca se deja el número "congelado" sin indicarlo).
- Nunca se interpola ni se "rellena" un hueco de datos con el valor anterior repetido de forma silenciosa: si no hay lectura nueva, el gráfico simplemente no añade un punto (evita crear una falsa sensación de estabilidad).

## 3. Consistencia entre vistas

- Todas las vistas (KPI, gráficos, tabla, resumen min/máx/promedio, CSV) deben derivar de la **misma ventana de datos en memoria** (RF-17, HU-02) — nunca cada componente hace su propia petición independiente con parámetros distintos, para evitar que dos paneles muestren números que no cuadran entre sí en el mismo instante.
- Al cambiar la ventana (50/100/250/500), se dispara una única recarga que actualiza todas las vistas de forma atómica (mostrar un estado "recalculando" breve si el cambio toma más de ~150 ms).

## 4. Pruebas de precisión sugeridas (además de las CP-01 a CP-12 ya definidas)

| ID | Escenario | Resultado esperado |
|---|---|---|
| CP-13 | Forzar dos peticiones casi simultáneas (cambio rápido de ventana) | Solo la respuesta más reciente actualiza la interfaz; la respuesta más vieja que llega tarde se descarta |
| CP-14 | Simular `created_at` de hace 40 s sin nuevas lecturas | El indicador pasa a "Retrasado", no permanece en "En vivo" |
| CP-15 | Insertar valor field1 negativo válido | Se grafica y se muestra en KPI, no se trata como ausencia |
| CP-16 | Insertar valor field1 muy alto (atípico) | El eje del gráfico se reescala para incluirlo; no se recorta |
| CP-17 | Exportar CSV y comparar decimales contra la respuesta cruda de la API | Coinciden exactamente, sin redondeo adicional |
