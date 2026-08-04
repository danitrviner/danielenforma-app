# Estado de la migración al Design System

**Documento vivo.** Es la referencia del estado del refactor: dónde estamos, qué queda y qué
riesgos hay abiertos. Se actualiza al cerrar cada fase.

> **Última actualización:** 4 de agosto de 2026 · **Sprints 1-4 completados, F8 y F9 completadas (Sprint 5 en curso: F10 pendiente)** ·
> rama `ds/f0-linea-base` · commits sin pushear

**Dos documentos, dos funciones.** Este es el *panel de estado*: se lee de un vistazo y siempre
refleja el presente. [`docs/DS-migracion.md`](docs/DS-migracion.md) es la *bitácora*: histórico por
fase, solo crece, no se reescribe. Las decisiones de diseño no viven en ninguno de los dos — están
en la auditoría UX/UI, el Design System y el plan de migración, que son externos y cerrados.

---

## Progreso

```
Sprint 1  ████████████████████  F0 F1        COMPLETADO
Sprint 2  ████████████████████  F2 F3        COMPLETADO
Sprint 3  ████████████████████  F4 F5        COMPLETADO
Sprint 4  ████████████████████  F6 F7        COMPLETADO
Sprint 5  █████████████░░░░░░░  F8 F9 F10    F8 y F9 completadas, F10 pendiente
Sprint 6  ░░░░░░░░░░░░░░░░░░░░  F11          pendiente
Sprint 7  ░░░░░░░░░░░░░░░░░░░░  F12          pendiente
Sprint 8  ░░░░░░░░░░░░░░░░░░░░  F13 F14 F15  pendiente
```

**10 de 16 fases completadas. F10 (Chart unificado) es la siguiente.**

> **El Design System es la base, no el objetivo.** El plan acordado el 4 ago 2026 recorta lo que
> queda para llegar antes a la fase que de verdad persigue el objetivo —una app de aspecto
> premium—: **F10 y una F11 recortada** (solo `Input`/`Select`, que cierra R8, y las primitivas en
> `cardio/`, `roadmap/` y CRM), y después **la auditoría visual con Claude Design**, que absorbe
> F12 entera y F13 (motion, microinteracciones y transiciones son su encargo, no una pasada
> mecánica previa). F14 se paga sola dentro de F11 y de F15 solo se conserva borrar los 12 tokens
> muertos: partir los 20 archivos de más de 600 líneas queda fuera de este esfuerzo.

## Fases

| Sprint | Fase | Título | Estado | Fin | Riesgo |
|:--:|:--:|---|---|:--:|---|
| 1 | **F0** | Red de seguridad y línea base | ✅ Completada | 2026-08-03 | Nulo |
| 1 | **F1** | Tokens reales en `@theme` | ✅ Completada | 2026-08-03 | Medio |
| 2 | **F2** | Defectos objetivos | ✅ Completada | 2026-08-03 | Bajo |
| 2 | **F3** | Radios — fase aislada | ✅ Completada | 2026-08-03 | **Crítico** |
| 3 | **F4** | Escala tipográfica y suelo de tamaño | ✅ Completada | 2026-08-03 | Medio |
| 3 | **F5** | Mono → Sans | ✅ Completada | 2026-08-03 | Medio |
| 4 | **F6** | Espaciado, ritmo vertical y sombras | ✅ Completada | 2026-08-03 | Medio |
| 4 | **F7** | Primitivas en `src/components/ui/` | ✅ Completada | 2026-08-03 | Bajo |
| 5 | **F8** | Adopción de bajo riesgo | ✅ Completada | 2026-08-04 | Bajo |
| 5 | **F9** | Sheet / Dialog: los modales artesanales | ✅ Completada | 2026-08-04 | **Alto** |
| 5 | **F10** | Chart unificado | ⬜ Pendiente | — | Bajo |
| 6 | **F11** | Migración de pantallas | ⬜ Pendiente | — | Medio |
| 7 | **F12** | Momentos clave (rediseños reales) | ⬜ Pendiente | — | **Alto** |
| 8 | **F13** | Motion, hápticos y reduced-motion | ⬜ Pendiente | — | Medio |
| 8 | **F14** | Accesibilidad base | ⬜ Pendiente | — | Bajo |
| 8 | **F15** | Gobernanza y salud estructural | ⬜ Pendiente | — | Nulo |

## Indicadores

`npm run ds:inventario` · dirección: ↓ deuda (que suba rompe el build) · ↑ salud · · informativa

| Indicador | Dir. | Base (F0) | Hoy | Objetivo | Fase |
|---|:--:|--:|--:|--:|:--:|
| Hex distintos en componentes | ↓ | 101 | **14** | ≤ 22 | F1 ✅ |
| Hex literales en componentes | ↓ | 4.638 | **25** | ~0 | F1 ✅ |
| Tokens del DS en uso | ↑ | 0 | **4.775** | — | F1 ✅ |
| Imports de `theme.ts` | ↓ | 0 | **borrado** | 0 | F1 ✅ |
| Bordes `border-white/>12` | ↓ | 93 | **0** | 0 | F2 ✅ |
| Textos por debajo de 11 px | ↓ | 1.151 | **1 (excep.)** | 1 | F4 ✅ |
| Escalones de tamaño en uso | ↓ | 16 | **8 + 2 excep.** | ≤ 8 | F4 ✅ |
| Pesos de fuente distintos | ↓ | 6 | **4** | 4 | F4 ✅ |
| `font-mono` | ↓ | 1.527 | **974** | mono < sans | F5 ✅ |
| `font-sans` | ↑ | 590 | **910** | > mono | F5 ✅ |
| Espaciado fuera de escala | ↓ | 1.170 | **0** | 0 | F6 ✅ |
| Sombras fuera de la escala | ↓ | 113 | **0** | 0 | F6 ✅ |
| Brillos dorados ad-hoc | ↓ | 31 | **0** | 1, con token | F6 ✅ |
| Overlays artesanales (no `ui/`) | ↓ | 39 | **7** | 7, clasificados | F9 ✅ |
| `transition-all` | ↓ | 377 | **262** | 0 | F13 |
| `animate-pulse` | ↓ | 29 | 29 | solo en `Skeleton` | F13 |
| `prefers-reduced-motion` | ↑ | 0 | 0 | > 0 | F13 |
| `aria-label` | ↑ | 23 | **30** | — | F14 |
| `htmlFor` | ↑ | 0 | **1** | ≥ 116 | F14 |
| `focus-visible` | ↑ | 0 | **31** | > 0 | F14 |
| Archivos > 600 líneas | · | 21 | 20 | 0 (a un año) | F15 |
| Radios `lg / xl / 2xl` | · | 425/257/278 | **0/0/0** | 3 + `full` | F3 ✅ |

## Resumen de lo hecho

### Sprint 1 — Cimientos · 2026-08-03

**F0 · Red de seguridad.** Cero archivos de `src/`. Se añadió
[`scripts/ds-inventario.mjs`](scripts/ds-inventario.mjs): 26 métricas medidas sobre `src/`, sin
dependencias externas, que sale con código 1 si una métrica de deuda sube o una de salud baja y
**nombra el archivo culpable**. Más la línea base versionada y la bitácora.

**F1 · Tokens.** 24 commits, uno por token. Los 22 tokens del DS existen como clases de Tailwind y
los hex literales han desaparecido de los componentes: **101 → 15 valores distintos**, 4.638 → 29
apariciones, 4.279 usos de token. `src/theme.ts` borrado (tenía 0 importadores: estaba muerto del
todo, no a medias).

Único cambio visual buscado: **299 textos ilegibles pasaron a `ink-3`**. `#555` daba 2,38:1 y `#444`
1,83:1 frente al 4,5:1 de WCAG AA; el peor caso era `#2a2a2a` —el color de los bordes— usado como
color de texto en la numeración de ejercicios de Rutinas, ≈1,1:1.

**Fuera del plan pero necesario:** antes de F0 se consolidó en `fix/seguridad-2026-07-23` la
remediación de la auditoría de seguridad del 23 de julio, que llevaba meses aplicada en producción
pero sin commitear, y que incluía dos archivos que F1 iba a reescribir.

### Sprint 2 — Defectos y radios · 2026-08-03

**F2 · Defectos objetivos.** 8 commits. Desaparecen los 93 bordes blancos por encima del 12 % (79
estáticos a `hairline`, 14 en hover a `strong`), y con ellos **todos** los `border-white/N` de la
app. La geometría del marco pasa a `--header-h` y `--nav-h`: el código asumía 65 px en cuatro
sitios mientras la cabecera de escritorio mide 78, así que **13 px de contenido quedaban ocultos**.
Se declara una escala de capas con nombre conservando los valores actuales. Los campos de Perfil
suben a 16 px y dejan de provocar zoom en iOS. **El desbordamiento horizontal baja a 0 en las seis
rutas medidas** — no lo causaba la barra inferior sino cuatro barras de pestañas sin scroll.
`MetricsScreen.tsx` borrado: 441 líneas que no enrutaba nadie.

**F3 · Radios.** 2 commits, 1.310 radios en 121 archivos. Se mapea por **rol del elemento**, no por
valor actual, que es lo que desactiva la colisión `rounded-lg` = `rounded-2xl` = 16 px. Al retirar
los overrides del `@theme`, las clases de Tailwind recuperan su semántica estándar y la colisión
desaparece de raíz. En pantalla solo quedan 10, 16, 24 y `full`.

La revisión visual que el plan declara obligatoria se resolvió extrayendo del navegador el
`border-radius` **computado** de cada elemento antes y después en cinco pantallas: los totales
coinciden elemento a elemento, ninguno perdió ni ganó radio.

### Sprint 4 — Ritmo · 2026-08-03

**F6 · Espaciado, ritmo vertical y sombras.** 9 commits, 1.209 declaraciones de espaciado
migradas. **Espaciado fuera de la escala: 1.208 → 0.** Los 1.157 valores que el inventario veía
resultaron ser cero píxeles arbitrarios —todos eran pasos fraccionarios de Tailwind—, lo que
convirtió la fase en cuatro sustituciones mecánicas en vez de una auditoría caso por caso.

Antes hubo que arreglar el instrumento: la métrica no miraba escalones enteros, así que 51 usos
de deuda real (`py-20` son 80 px, `pl-9` son 36) habrían sobrevivido con el contador a cero.

**Sombras: 113 → 0 fuera de escala.** 21 pasan a `e2` (overlays), 9 a `e1` (lo que flota sobre
contenido que se desplaza) y **67 se retiran**: sobre un fondo casi negro la elevación se
comunica cambiando de superficie, y el borde `hairline` ya define la tarjeta.

**El glow vuelve a significar algo:** de 23 brillos dorados a **uno**, el siguiente entrenamiento
pendiente. `.volt-glow` borrada, que era lo que F5 dejó pendiente para esta fase.

**F7 · Primitivas en `src/components/ui/`.** 14 commits, 13 primitivas: `Icon`, `Button`, `Input`,
`Select`, `Card`, `Badge`, `Chip`, `Tabs`, `ListRow`, `PageHeader`, `Sheet`, `Dialog`,
`EmptyState`. Ninguna pantalla de producción las adopta —eso es F8— y el CRM sigue con sus
componentes propios sin tocar. Escaparate en `/ui`, solo en `import.meta.env.DEV`, con un `<div>`
que se salta la puerta de sesión: no necesitan Firebase ni un perfil para verse.

**El instrumento tuvo que ceder terreno antes de escribir nada.** La métrica de overlays contaba
`fixed inset-0` en todo `src/`, así que `Sheet` y `Dialog` la habrían subido de 39 a 41 —el propio
trabajo de la fase marcado como regresión—. Se le dio a cada métrica un `ambito(rel)` opcional; la
de overlays declara el suyo: cuenta fuera de `ui/`, que es el objetivo que este mismo panel ya
tenía escrito. Los 39 overlays artesanales siguen siendo deuda real de F9.

**Un hallazgo que cambia lo que F8 va a parecer.** Los 590 iconos de la app se renderizan hoy a
24 px pase lo que pase: la clase `.material-symbols-outlined` de Google trae `font-size: 24px` y
llega sin capa CSS, y sin capa gana a cualquier utilidad de Tailwind, que vive en `@layer
utilities`. `text-caption`, `text-body-s`, `text-display` sobre un icono no hacen nada — ni el
`tsc`, ni el build, ni el inventario lo detectan, solo medirlo en el navegador. `Icon` usa una base
propia (`.ui-icon`, sin capa, sin tamaño dentro) y resuelve el problema para la primitiva; los 590
usos existentes siguen a 24 px hasta que F8 los adopte, y esa adopción va a **cambiar tamaños
visibles**, no a ser el cambio neutro que parecía.

**R4 (bloqueo de scroll mal desmontado) cerrado en la propia infraestructura.** El patrón que ya
usa el CRM (`features/crm/components/Modal.tsx`) captura y restaura el `overflow` del body por
overlay: con dos overlays independientes, el que cierra primero libera el scroll aunque el otro
siga abierto. `Sheet` y `Dialog` comparten `internal/overlayHooks.ts`, con un contador a nivel de
módulo — verificado abriendo los dos a la vez y cerrándolos en orden inverso al de apertura: el
`overflow` no se libera hasta que cierra el último. Foco atrapado y devuelto al cerrar, en los dos.

**Deuda que se mueve sola sin haber sido objetivo de la fase:** `focus-visible` 0 → 31 y
`htmlFor` 0 → 1 con solo ocho primitivas nuevas, ninguna adoptada todavía. F14 hereda una base
que ya no parte de cero.

**Línea base fijada al cierre del Sprint 4** — F6 y F7 movieron once métricas en la dirección
correcta, así que el inventario compara desde ahora contra este suelo, no contra el de F0.

### Sprint 3 — Tipografía · 2026-08-03

**F4 · Escala y suelo de tamaño.** 12 commits, 2.981 declaraciones migradas. De 16 tamaños
renderizados a 8 pasos, y **de 1.145 textos por debajo de 11 px a cero**. Los pesos bajan de 6 a 4
y la petición de Inter a Google Fonts, de 6 pesos a 4.

**F5 · Mono → Sans.** 478 migraciones en tres tandas. `font-mono` 1.508 → 1.030 y `font-sans`
579 → 1.057: **la proporción se invierte**, que era el objetivo de la fase. El 72 % de tipografía
monoespaciada era el origen real de la sensación «terminal» del producto.

El criterio fue deliberadamente estrecho: de las 1.504 apariciones, 478 se migraron por evidencia
inequívoca, 902 se quedan en mono porque el DS las quiere ahí (etiquetas en versalitas y datos) y
**286 quedan sin tocar por ambiguas** — adivinar es peor que no tocar.

**Limpieza aprobada:** 12 tokens muertos del `@theme` y `.cyan-glow`, con 0 referencias verificadas
sobre 297 archivos.

### Sprint 5 — Adopción (F8 completada) · 2026-08-04

**F8 · Adopción de bajo riesgo.** ✅ Cerrada. 81 commits, 9 primitivas (`EmptyState`, `Badge`,
`Chip`, `ListRow`, `Card`, `Tabs`, `Button`, `PageHeader`, `Icon`) adoptadas en los 79 archivos de
`src/components/*.tsx` — los 79 revisados con una decisión explícita, no solo los que tenían un
caso obvio. 74 recibieron cambios; 5 se revisaron y se dejaron intactos a propósito (no son
omisiones): `DietMealsView` (tabla numérica pura, sin iconos/botones/filas), `ClientRoadmapPanel`
(10 líneas, un simple *pass-through* a `roadmap/`, diferido), `ProgressRing` (SVG puro, nada que
adoptar), `ScheduleFields` (un `<select>` reservado a F11 y un selector de día-de-semana con el
mismo patrón píldora rectangular que se dejó en `OnboardingForm`, ver abajo) y `Skeleton` (es en sí
misma infraestructura visual, no una pantalla). `Select` y `Sheet`/`Dialog` no se tocan: son F11 y
F9, y `src/components/cardio/`, `src/components/roadmap/` y `src/features/crm/**` siguen diferidos
tal y como fijó el alcance de la fase.

**Cada primitiva mueve el inventario igual, y es un falso positivo ya visto antes.** `Tokens del DS
en uso` y `font-sans` bajan por archivo cada vez que una pantalla adopta una primitiva, porque las
clases literales se centralizan en `ui/*.tsx` (que ya las contaba desde F7) en vez de repetirse por
pantalla. Mismo patrón que el falso positivo de F1 con `hex en tokens`. La línea base se reescribe
a propósito después de cada lote, con el archivo culpable siempre explicado por la migración.

**El repo no tiene `@types/react`.** Sin él, TypeScript no sabe excluir `key` de las props de un
componente propio — cualquier primitiva usada dentro de un `.map()` necesita declarar
`key?: React.Key` a mano. El workaround ya existía en el propio repo (`CardProps` de
`RecipesScreen.tsx`, anterior a F8); se replicó en `Badge`, `Chip`, `ListRow` y `Card`.

**Decisión de Dani, 3 ago:** el primitivo `Tabs` marca la pestaña activa con `bg-raised` + negrita,
nunca con oro — decisión ya tomada en F7 («el oro es la siguiente acción, no un indicador de
sección»), pero ninguno de los interruptores reales de la app la seguía: todos usaban
`bg-accent text-black`. Adoptar `Tabs` le quita el dorado a la navegación por pestañas de
`TrainingLab`, `Entrenamiento`, `Nutrición` (coach y atleta), `Ajustes de Entrenadores` y el hub de
cliente (zonas + sub-pestañas) a la vez. Confirmado explícitamente antes de aplicarlo — no se
adivinó. El mismo criterio (primitiva ya aprobada en F7, F8 es adopción no rediseño) se aplicó sin
volver a preguntar a `PageHeader`, cuyo título son 24px/bold en vez de los 32px/extrabold que
usaban `TrainingLab` y `Revisiones`.

**Casos que no encajaron limpiamente, dejados tal cual a propósito** (no son omisiones, son
decisiones): filtros con color por categoría que la primitiva no reproduce (`CAT_COLOR`,
`METRIC_COLOR`, el filtro `indyaCat` de Recetas en `bg-data`, las 5 categorías de intercambios de
`NutritionPlansScreen`/`MyMenuScreen` en `bg-data`); toggles con `min-h-[44px]` explícito donde
`Chip` sería más bajo (regresión de objetivo táctil); tarjetas con título+icono combinado
(`Card.title` es solo texto); filas con un enlace real dentro del título o con tres líneas de texto
(`ListRow` no lo soporta); cabeceras con un indicador "Sincronizado" en vivo junto a la ceja
(`PageHeader.eyebrow` es solo texto) — `TrainingCoachScreen`, `NutritionCoachScreen` y
`ClientsScreen` se quedan con su cabecera actual por esto. El header de `ClientHub` (avatar +
badge de plan + tarjeta de adherencia) tampoco encaja: es una composición propia, no un título de
pantalla.

**El mayor caso repetido de "no encaja": el selector píldora rectangular con `bg-accent
text-black`.** Aparece como abstracción compartida (`PillSelect`/`YesNo`/`CheckboxGroup` de
`OnboardingForm`, usados en decenas de campos de la ficha de iniciación) y como variantes locales
casi idénticas en `WeeklyMenuEditor` (variedad, tipos de plato), `ScheduleFields` (día de la
semana) y el `Chip` local de `AthleteOnboardingWizard` (que además soporta una variante "grande"
de tarjeta que el `Chip` del DS no tiene). Todos comparten forma `rounded-control` (rectangular),
no `rounded-full` como `Chip`. Migrarlos habría cambiado la forma de la práctica totalidad de los
controles de elección de la app — eso es un rediseño, no una adopción de bajo riesgo, y el plan de
F8 lo excluye explícitamente («no hacer rediseños todavía»). Queda documentado como candidato para
una fase de rediseño futura (F12), no como un olvido.

Un caso más pequeño del mismo tipo, ya resuelto en sentido contrario: los selectores de modo de
dieta/categoría del *picker* de alimentos en `NutritionPlansScreen` (botones sueltos redondeados,
sin abstracción compartida) sí se migraron a `Chip` — mismo criterio que `Tabs`: la primitiva ya
aprobada en F7 se adopta tal cual, aunque cambie el tono de sólido dorado a tintado con borde.

**Verificado:** `tsc --noEmit`, 263 pruebas y `npm run build` limpios después de cada uno de los 81
commits; `ds:inventario` sin regresiones reales en ninguno (solo el falso positivo ya descrito,
corregido con `--write` cada vez — es la razón de que `Tokens del DS en uso` **baje** en el panel de
indicadores de arriba pese a la flecha ↑: las clases literales se centralizan en `ui/*.tsx`, que ya
las contaba desde F7, en vez de repetirse en cada pantalla). Verificación visual en `/ui` (recarga
completa, 375 px) para cada primitiva adoptada. **Sin verificación visual en pantallas reales**: el
login de coach usa Google OAuth real y no hay sandbox de coach; el login de atleta
(`atleta@enforma.com`) existe pero ninguna de las dos sesiones que trabajaron F8 tenía la
contraseña. Pendiente que Dani o el asistente de QA de navegador lo revisen en las pantallas
reales, sobre todo la nav principal (`App.tsx`), el cambio de color de `Tabs` y los tamaños de
icono nuevos — son los de mayor impacto visual y los que ninguna de las dos sesiones pudo
comprobar en el navegador.

**Cierre de F8:** los 79 archivos de `src/components/*.tsx` quedan revisados con una decisión
explícita cada uno. Lo que no se tocó (`Select`/`Input`, `Sheet`/`Dialog`, los 39 overlays
artesanales, `cardio/`, `roadmap/`, `src/features/crm/**`, y el patrón píldora rectangular descrito
arriba) es deuda documentada para F9/F11/F12, no trabajo olvidado. F9 (`Sheet`/`Dialog`) es la
siguiente fase.

### Sprint 5 — F9 · Overlays · 2026-08-04

**F9 · Sheet / Dialog.** ✅ Cerrada. 28 commits. **Overlays artesanales 39 → 7**, y los 7 que
quedan están clasificados uno a uno, no pendientes.

**Primer hallazgo: eran 38, no 39.** Una de las 39 apariciones era una línea de *comentario* en
`features/crm/components/Modal.tsx` que describía el patrón. El instrumento contaba prosa. Volvió a
morder al final de la fase: los comentarios que documentan los overlays no migrados subieron la
métrica de 7 a 12 hasta reescribirlos sin la cadena literal.

**Las primitivas necesitaron tres ampliaciones, las tres consultadas antes de tocarlas** — el censo
de anchos reales (`sm` 11, `md` 9, `lg` 9, `2xl` 5, `4xl` 1) y la anatomía real de los pickers no se
podían conocer en F7, cuando se construyeron sin un solo consumidor:

1. **`Dialog` gana `xl`** (`max-w-2xl`). Sin él, los 5 overlays que muestran prosa larga o dos
   columnas se estrechaban de 672 a 512 px.
2. **`Sheet` gana la misma escala**, extraída a `ui/internal/overlaySizes.ts` en vez de duplicarla:
   el ancho es la misma decisión en las dos primitivas. Por defecto `l`, que es lo que `Sheet` medía.
3. **`Sheet` gana el slot `toolbar`**, la zona que no scrollea. Siete overlays son *pickers* con la
   misma anatomía —título, barra de pestañas/chips/buscador, lista— y meter esa barra en el cuerpo
   hacía que el buscador se fuera con el scroll. Sobre 311 alimentos eso no es un matiz estético.
   Verificado en `/ui`: con la lista desplazada 600 px de 2.480, la barra sigue en `top: 78px`.

**R4 cerrado de verdad.** `features/crm/components/Modal.tsx` pasa de 63 líneas a 33 envolviendo
`Sheet`: era la única implementación del repo con bloqueo de scroll propio, y con el bug exacto que
R4 describe. Su API no cambia, así que sus 7 usos no se tocan.

**R3 se disuelve al clasificar.** El riesgo era migrar modales que se abren durante un entrenamiento
en directo — y resulta que **5 de los 6 overlays de `cardio/` no son modales**: `LiveSession`,
`EffortPrompt`, `CooldownPrompt`, `HrvTestScreen` y `CardioSessionDetail` tienen fondo opaco, sin
telón y sin caja. Son vistas a pantalla completa. Solo `ManualSessionModal` lo era, y se migró.

**Los 7 que quedan, con motivo escrito en el propio código:**

| Overlay | Por qué se queda |
|---|---|
| 5 vistas de `cardio/` | No son modales. Convertirlas sería un rediseño |
| `CommandPalette` | Anclada arriba (`pt-14`), la convención de Cmd+K; ninguna primitiva tiene esa posición |
| `ReportEditor` | Único con layout a dos columnas (`lg:grid-cols-2`) a `max-w-4xl`; ni con `xl` cabe |

Los dos últimos son **decisión de Dani**: van a la fase de diseño, que decidirá si merecen una
variante de posición y si el editor de reportes debe ser modal, ruta propia o panel.

**Un falso positivo de familia nueva.** Hasta ahora el inventario bajaba `Tokens del DS en uso` y
`font-sans` al centralizar clases en `ui/`. En F9 bajó también **`aria-label` (33 → 30), que es
métrica de salud**: los `aria-label="Cerrar"` escritos a mano desaparecen y los pone la primitiva,
que ya aportaba el suyo desde F7. Verificado leyendo `Sheet`/`Dialog`, no asumido: ningún botón
perdió su nombre accesible, y en el CRM incluso mejora (pasa a `aria-labelledby` apuntando al título
visible).

**Arreglos que llegaron gratis con la migración**, sin ser objetivo de la fase: el confirmar-borrado
del banco de alimentos no decía *qué* se borraba; las instrucciones fijas del asistente no tenían
botón de cerrar ni Escape; el detalle de receta de Mi Menú repetía el botón de cerrar en dos ramas y
no tenía ninguno mientras cargaba.

**Verificado:** `tsc --noEmit`, 263 pruebas y `npm run build` limpios tras cada uno de los 28
commits, y `ds:inventario` sin regresiones reales. Verificación funcional de las primitivas en `/ui`
tras recarga completa. **Sin verificación visual en pantallas reales de coach** — misma limitación
de credenciales de F8; decisión de Dani el 4 ago: no dedicar tiempo a QA por pantalla, la auditoría
visual global la hace Claude Design.

## Excepciones explícitas al Design System

Aprobadas caso por caso. **Prima la usabilidad sobre la uniformidad del sistema.**

| Excepción | Por qué | Revisar en |
|---|---|---|
| **Barra inferior a 10 px**, por debajo del suelo de 11 | A 11 px, 5 de los 7 destinos se truncan hasta quedar ilegibles («ACA…», «CAR…»). La solución no es tipográfica sino de arquitectura de navegación. | Incidencia abierta, fase por decidir |
| **Cardio en directo a 60 y 72 px**, por encima de `display` (32) | Pulsación, cuentas atrás y RPE se leen a distancia de brazo durante el esfuerzo. Reducirlas a 32 px degradaría la legibilidad justo donde el contexto es más exigente. | Propuesta de extensión del DS pendiente |

## Reglas que la migración ha dejado sentadas

Valen para todo el código nuevo, no solo para las fases que quedan.

1. **Ningún hex literal en un componente.** El color vive en el bloque `@theme` de `src/index.css`.
2. **Nunca interpolar dentro de un `className`.** Tailwind v4 genera CSS leyendo cadenas literales:
   `` `bg-[${color}]` `` no falla el build, no avisa en consola y deja el elemento sin estilo.
   TypeScript elige *qué* token, nunca *qué valor*.
3. **`@theme static` es obligatorio.** Sin él Tailwind solo emite las variables que alguna clase
   consume, y un `var(--color-*)` escrito en un estilo en línea o en un atributo SVG se queda sin
   definir, en silencio.
4. **Un commit por token** en las fases mecánicas; un PR por pantalla en F11.
5. **Añadir antes de quitar.** El token viejo se borra cuando su contador llega a cero.
6. **Validar a 375 px antes que en escritorio.** Siempre en ese orden.
7. **No se tocan `src/db/`, `dbService.ts` ni `src/utils/`.** Fuera de alcance.

## Riesgos abiertos

| # | Riesgo | Fase | Estado |
|:--:|---|:--:|---|
| ~~R1~~ | ~~Colisión de radios~~ | F3 | ✅ **Cerrado.** Al retirar los overrides, `rounded-lg` vuelve a 8 px y `rounded-2xl` a 16: la colisión no existe |
| R2 | **Sin capturas de referencia automáticas.** Se decidió no añadir Playwright ni Puppeteer. En F3 se cubrió con censo de `border-radius` computado más capturas manuales del navegador integrado, que basta para cambios medibles. Sigue abierto para F11 y F12, donde lo que cambia es la composición y no hay contador que lo detecte. | F11 · F12 | Abierto, ya no bloqueante |
| ~~R3~~ | ~~Modales dentro de una sesión de cardio en directo~~ | F9 | ✅ **Cerrado al clasificar.** 5 de los 6 overlays de `cardio/` no son modales sino vistas a pantalla completa, así que no se migraron. El único que lo era (`ManualSessionModal`) no se abre durante un entrenamiento |
| ~~R4~~ | ~~Bloqueo de scroll mal desmontado~~ | F9 | ✅ **Cerrado.** Los 31 overlays migrados usan el contador compartido de `ui/internal/overlayHooks.ts`, y el `Modal` del CRM —la única implementación con el bug— ahora envuelve `Sheet` en vez de tener la suya |
| ~~R5~~ | ~~Desbordamiento de layout al subir tamaños~~ | F4 · F6 | ✅ **Cerrado.** Tras F6 el desbordamiento horizontal sigue a 0 en todas las rutas medidas y los únicos truncados son los previos de la barra inferior, que es R10 |
| R6 | **Capacitor empaqueta el mismo build.** Cualquier regresión llega también a iOS y Android, donde no hay «recargar». No sincronizar a mitad de sprint. | Todas | Vigente |
| R7 | **Fatiga de revisión.** 16 fases con un solo revisor: el riesgo real no es técnico, es que a partir del PR 20 se apruebe sin mirar. | Todas | Vigente |
| R8 | **238 campos de formulario por debajo de 16 px** provocan zoom automático en iOS al enfocarlos, y el zoom no revierte solo. La auditoría contaba 5. | F4 | **Abierto — mayor de lo estimado** |
| R10 | **La barra inferior tiene 7 destinos donde el DS fija 5.** Es lo que impide cumplir el suelo de 11 px sin truncar. Incidencia abierta: la solución pasa por reorganizar destinos, reducir pestañas visibles, iconografía más eficiente o navegación adaptativa. | Por decidir | **Abierto — incidencia** |
| R9 | **El estado caliente de HMR miente.** Una verificación de layout sobre CSS recargado en caliente dio un falso negativo: las clases `md:` parecían no aplicarse. Toda verificación de layout exige recarga completa. | Método | Vigente |

## Deuda técnica del Design System

Detectada y **no** resuelta, con la fase a la que pertenece.

| Hallazgo | Medida | Fase |
|---|--:|:--:|
| ~~Bordes blancos por encima del 12 %~~ | ~~93~~ | ✅ F2 |
| ~~Escala de z-index elegida por orden de aparición~~ | ~~11~~ | ✅ F2 — declarada; los overlays la adoptan en F9 |
| ~~`sticky top-[65px]` contra una cabecera de 78 px~~ | ~~1~~ | ✅ F2 |
| ~~`MetricsScreen.tsx`, código muerto~~ | ~~441 líneas~~ | ✅ F2 — borrado |
| Campos de formulario por debajo de 16 px → zoom en iOS | 238 | **sigue abierto** |
| ~~Radios: 6 valores renderizados con dos colisiones~~ | ~~1.310~~ | ✅ F3 |
| ~~Textos por debajo de 11 px~~ | ~~1.145~~ | ✅ F4 |
| Monoespaciada: 286 apariciones ambiguas sin clasificar | 286 | F5 parcial → F11 |
| Emojis usados como iconografía funcional (🔥 en calentamiento, 🏅⚡⭐ en insignias) | — | **sigue abierto** |
| 590 iconos Material Symbols con tokens de texto que no aplican — la clase de Google gana sin capa a cualquier utilidad de Tailwind | 590 | F7 ✅ primitiva construida → F8 ✅ adoptados en `src/components/*.tsx`; quedan los de tamaño en píxeles a medida (bespoke) y `cardio/`/`roadmap/`, diferidos |
| ~~Espaciado fuera de la escala de 4 px~~ | ~~1.170~~ | ✅ F6 |
| ~~Glow en cuatro tarjetas donde no señala nada~~ | ~~4~~ | ✅ F6 |
| Márgenes negativos para compensar espaciado | 21 | F11 |
| `<select>` con aspecto nativo junto a campos personalizados | — | F7 ✅ primitiva construida → F11 adopción |
| ~~Overlays artesanales sin foco atrapado ni Escape~~ | ~~39~~ | ✅ F9 — 31 migrados; los 7 restantes clasificados y documentados en el código |
| Posición superior de overlay (paleta Cmd+K) sin variante en la primitiva | 1 | Fase de diseño |
| Editor de reportes: overlay a dos columnas de 896 px, ¿modal, ruta o panel? | 1 | Fase de diseño |
| Gráficas sin especificación común (5 alturas, 2 rejillas, 6 tamaños de tick) | 7 paneles | F10 |
| Barra inferior del coach con 7 destinos; el DS fija 5 | 7 | F12 |
| Botones de la barra inferior **sin nombre accesible** — confirmado en el árbol de accesibilidad | 7 | F14 |
| `<label>` sin `htmlFor` | 116 | F14 |
| Archivos de más de 600 líneas | 21 | F15 |
| Tokens antiguos aún en `@theme`, marcados «en retirada», con 0 usos | 12 | F15 |

### Deuda ajena al Design System

No pertenece a esta migración y no se arregla en ella. Queda anotada para que no se confunda con
deuda del refactor.

| Hallazgo | Dónde |
|---|---|
| 1 error de eslint: expresión sin usar | `AcademyCoachScreen.tsx:306` |
| 172 avisos de eslint por variables sin usar | repartidos |
| El chunk principal supera 1,2 MB sin minificar | `dist/assets/index-*.js` |
| `cardioZones.ts` y `phasePresets.ts` conservan sus hex | `src/utils/`, `src/data/` — excluidos por regla |
