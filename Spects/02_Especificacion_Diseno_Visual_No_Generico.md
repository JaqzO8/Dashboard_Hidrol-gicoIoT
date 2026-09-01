# Especificación 02 — Sistema visual (evitar el "look" de IA genérica)
**Referencia:** reemplaza/precisa la sección 17 ("Diseño detallado de la interfaz") del documento de elicitación de Prevención.

## 1. Por qué el sitio actual puede leerse como "hecho por IA"

Los patrones que más delatan una interfaz generada automáticamente, y que conviene revisar en el despliegue actual:

- Tarjetas KPI idénticas, todas con el mismo radio de esquina y la misma sombra gris suave — el "kit de tarjetas SaaS".
- Fondo oscuro + un único acento turquesa/neón, sin ningún elemento que remita realmente a un río o a una cuenca hidrográfica.
- Etiquetas en MAYÚSCULAS espaciadas ("RESUMEN", "TENDENCIAS") a modo de "eyebrow" decorativo.
- Textos meta unidos con punto medio ("Río Huallaga · Canal 3420787 · En vivo") en vez de una jerarquía tipográfica real.
- Botones con flecha final ("Ver más →") y verbos genéricos ("Enviar" en vez de la acción concreta).
- Animaciones de aparición (fade-in / slide-up) repetidas en cada tarjeta al cargar.

Ninguno de estos elementos es "malo" en sí, pero todos juntos —y sin relación con el contenido real (ríos, telemetría, prevención)— son lo que hace que una página se sienta plantillera. La corrección no es "verse distinto porque sí", sino **anclar cada decisión visual en el dominio real**: hidrología peruana, cartografía, defensa civil, datos de sensores.

## 2. Sistema de tokens propuesto

### 2.1 Color (fundamentado en cartografía hidrográfica, no en un acento decorativo)

| Token | Valor | Uso | Por qué |
|---|---|---|---|
| `--río-950` | `#0B1B24` | Fondo base | Azul casi negro de carta batimétrica, no negro genérico de "dark mode IA" |
| `--río-800` | `#123244` | Paneles / superficies | Profundidad sin recurrir a gris neutro |
| `--río-500` | `#2E7DA3` | Líneas de agua, series de nivel | Azul de curva de nivel topográfica |
| `--sedimento-400` | `#C79A56` | Acento activo, foco, controles | Color de sedimento/orilla — vínculo directo con el dominio, en vez de un neón sin motivo |
| `--alerta-verde` | `#4C9A6A` | Estado Normal | — |
| `--alerta-ámbar` | `#D6A331` | Estado Preventivo | — |
| `--alerta-naranja` | `#D97A2E` | Estado Alerta | — |
| `--alerta-rojo` | `#C4463A` | Estado Crítico | — |
| `--texto-alto` | `#EAF1F4` | Texto principal | Contraste AA sobre `--río-950` |

Evitar: el par crema `#F4F1EA` + acento terracota `#D97757` (asociado hoy a IA genérica) y el negro puro `#0B0B0B`/`#111` como sustituto de negro real.

### 2.2 Tipografía

- **Titulares y cifras clave:** una grotesca condensada con carácter técnico-cartográfico (p. ej. *Fjalla One* o *Barlow Condensed*), usada con intención — no como "display genérico".
- **Cuerpo e interfaz:** una humanista de alta legibilidad (p. ej. *Public Sans* o *Source Sans 3*).
- **Cifras de telemetría (nivel, temperatura, tabla de registros):** fuente con **numerales tabulares/monoespaciados** (`font-variant-numeric: tabular-nums`). Esto no es el "monospace decorativo" que delata IA — aquí tiene una razón funcional real: alinear dígitos en columnas que cambian cada pocos segundos.
- Nada de una sola palabra del titular en cursiva/color distinto solo por énfasis decorativo.
- Nada de "eyebrows" en mayúsculas espaciadas sobre cada sección; si se necesita contexto, se resuelve con jerarquía de tamaño, no con una etiqueta ritual.

### 2.3 El "hero" debe ser el dato real, no una tarjeta genérica

En vez de una tarjeta grande con número + gradiente decorativo, la cabecera muestra:

- Un **hidrograma en miniatura** (línea del nivel de las últimas horas) detrás/junto al número de nivel actual — el contenido real *es* el elemento visual, no una decoración.
- Un **medidor tipo regla limnimétrica** (escala vertical con marcas, como las reglas físicas que usa el SENAMHI/ANA en campo) para representar el nivel dentro de su rango normal/preventivo/alerta/crítico, en vez de un semáforo de tarjetas de colores planos. Esto es a la vez más preciso (se ve *dónde* cae el valor dentro del rango) y visualmente distintivo porque referencia un instrumento real de hidrología.

### 2.4 Layout

- Evitar rejilla homogénea de tarjetas idénticas para los KPI. En su lugar: un panel principal (nivel + regla limnimétrica) con jerarquía visual clara, y KPIs secundarios (lluvia, temperatura, humedad, velocidad) en una franja más compacta y con su propio ícono lineal específico, no genérico.
- Los gráficos de field1 (nivel) y field6 (predicción) van en paneles separados y visualmente diferenciados (no como dos líneas del mismo color en el mismo eje) — esto refuerza RF-13/RNF-13 y de paso rompe la monotonía de "todo son tarjetas iguales".
- El selector de río puede incorporar un mapa simplificado de la cuenca (silueta del río, no un ícono de pin genérico) como referencia visual del catálogo de 969 ríos.

### 2.5 Movimiento

- Un único momento animado deliberado: un pulso breve en el punto del gráfico cuando llega un `entry_id` nuevo (confirma "esto acaba de cambiar"), y transición suave del valor numérico (conteo hacia el nuevo valor) en el KPI de nivel.
- Nada de fade-in/slide-up en cascada al cargar cada panel.

### 2.6 Voz y contenido

- Mensajes de error y vacío en voz activa y específica del dominio: *"Este río aún no tiene estación IoT asociada"*, no *"No hay datos disponibles"*.
- Botones con el verbo exacto de la acción: *"Actualizar ahora"*, *"Exportar CSV de estas 250 lecturas"* — nunca "Enviar →" ni "Ver más".
- Nombres reales de ríos, regiones y unidades en todo el copy de ejemplo/placeholder — nunca "Lorem" ni "Río X".

## 3. Checklist de auto-revisión antes de publicar

- [ ] ¿Todas las tarjetas comparten el mismo radio y la misma sombra sin razón funcional? → corregir.
- [ ] ¿Hay algún "eyebrow" en mayúsculas o meta-texto con punto medio que no aporte información nueva? → quitar.
- [ ] ¿El hero de la página muestra un dato real (nivel + tendencia) o una composición decorativa genérica? → debe ser el dato.
- [ ] ¿Los iconos son línea propia consistente o un set genérico de emojis/flat icons? → unificar.
- [ ] ¿Hay animaciones repetidas en cada tarjeta al cargar? → reducir a un solo momento.
- [ ] ¿El copy usa nombres reales de ríos y verbos de acción específicos? → confirmar.
