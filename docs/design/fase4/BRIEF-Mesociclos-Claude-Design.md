# Brief para Claude Design — Mesociclos (En Forma)

> Pégalo entero en Claude Design, sobre el proyecto *design system* «En Forma
> DS» (las 28 primitivas + tokens ya sincronizados). Adjunta también
> `Inventario-funcional-MesocycleManager.md`: es el contrato de funciones.

## Qué hay que diseñar

La pantalla **Mesociclos** del coach: donde programa el bloque de entrenamiento
de un atleta (volumen por grupo muscular → reparto por sesión → ejercicios →
cierre). Hoy funciona entera pero está escrita en tres épocas distintas y se
nota. El objetivo es **unificarla con el Design System**, no reinventar lo que
hace.

Entrega: mockups de alta fidelidad, **móvil (375 px) y escritorio (≥ 1280 px)**,
de estos estados:

1. Lista de mesociclos + editor con la pestaña **Volumen** (móvil: tarjetas por
   grupo; escritorio: tabla con historial).
2. Pestaña **Distribución** en reposo, con reparto elegido, calendario del ciclo
   y rejilla de sesiones.
3. Pestaña **Distribución** en **vista previa** de rutinas generadas.
4. Pestaña **Ejercicios** con un día abierto (móvil) y en rejilla de 2 columnas
   (escritorio).
5. Pestaña **Cierre**.
6. Overlays: **Sugerir volumen** (2 pasos), **Elegir ejercicio**, **Usar
   plantilla**.
7. Estados vacíos: sin mesociclos · sin distribución · sin rutinas · sin
   sesiones registradas.

## Reglas duras

- **Solo componentes del DS.** Button (primary/secondary/ghost/danger; s/m/l),
  Input, Select, Card, Badge, Tabs, Pager, Chip, ListRow, PageHeader, Sheet,
  Dialog, EmptyState, Avatar, Skeleton, ProgressBar, Banner, Stepper,
  SegmentedControl, RirScale, EffortScale, Sparkline, RingSeal, SwipeRow,
  SearchField, CollapsingHeader. Si necesitas algo que no está (p. ej. un
  interruptor), **márcalo como «componente nuevo»** en el lienzo, no lo
  camufles.
- **Solo tokens.** Colores: `bg · surface · raised · cell · inset · field`,
  `ink · ink-2 · ink-3 · ink-4 · ink-5`, `hairline · strong · track`,
  `accent` (dorado #FFC72C, **una acción primaria por zona**), estados
  `success #3ECF8E · warning #fdba74 · danger #FF5A4E · info #93c5fd`,
  `data`, `chart-1…5`, fases `phase-fuerza/hiper/defi/mant/descarga`.
  Tipografía: Plus Jakarta Sans (UI), IBM Plex Mono (cifras, etiquetas
  versalitas), Archivo 900 solo en `hero/headline/feature`. Escala: display 32
  · title-l 24 · title-m 19 · title-s 16 · body 15 · body-s 13 · label 12 ·
  caption 11. Radios: canvas · surface · control · field · chip · sheet.
- **Tema oscuro únicamente.** Fondo #050505.
- **Ni quitar ni añadir funciones.** El inventario adjunto lista cada acción,
  campo, estado y aviso. Cada uno tiene que estar en el mockup o en un
  overlay accesible desde él. Si crees que algo sobra, déjalo y anótalo.
- **Sin la palabra «IA»** en pantalla. «Generar rutinas», «Sugerir volumen».
- **Autoguardado**: no hay botón Guardar en cabecera, Volumen ni Distribución.
  Sí hay un indicador de estado (`…` / Guardando… / ✓ Guardado / ⚠ Error).
- Objetivos táctiles ≥ 44 px en móvil.
- Contenido real, no lorem: atleta «Ander», Meso #3 «Hipertrofia tren
  superior», 5 semanas, 4 sesiones, split Torso/Pierna, grupos con series
  reales (Pecho 12, Espalda 14, Cuádriceps 10, Isquios 8, Hombro 9, Bíceps 6,
  Tríceps 6, Gemelo 6, Core 4).

## Lo que sí puedes decidir

- Cómo se relacionan visualmente las tres capas (Volumen → Distribución →
  Ejercicios): pestañas como hoy, pasos, o una sola vista con secciones.
- Si la lista de mesociclos es columna, carrusel o selector en cabecera.
- Cómo se ve el **calendario del ciclo** (siempre editable pulsando días y con
  el día de la semana real en cada celda).
- Cómo se ve la **tabla de historial** en escritorio y su equivalente en móvil.
- Dónde viven los avisos (stale, días seguidos, duplicado, material, ciclo sin
  descanso, no empieza en lunes) mientras sigan teniendo su acción.

## Lo que NO

- Gráficas nuevas, resúmenes nuevos, «insights» nuevos.
- Cambiar nombres de pestañas o de acciones sin motivo.
- Un botón dorado por sección: es uno por zona visible.
