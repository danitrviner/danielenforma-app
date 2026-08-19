# Bitácora de la migración al Design System

Registro de ejecución del plan de migración. **Una entrada por fase**, escrita al cerrarla:
qué contadores movió, qué se revisó y qué se dejó fuera a propósito. Es histórico: solo crece.

Para saber **dónde estamos ahora**, el documento es
[`DESIGN_SYSTEM_STATUS.md`](../DESIGN_SYSTEM_STATUS.md), en la raíz: estado por fase, indicadores
al día, riesgos abiertos y deuda pendiente.

Esto no es documentación de diseño. Los tres documentos de referencia — auditoría UX/UI, Design
System y plan de migración — son externos y no se duplican aquí.

## Cómo se usa el inventario

```bash
npm run ds:inventario              # compara contra la línea base; exit 1 si algo empeora
npm run ds:inventario -- --write   # fija una nueva línea base (decisión consciente)
npm run ds:inventario -- --json    # informe en crudo
npm run ds:inventario -- --json --detalle   # incluye el desglose por archivo
```

Cada métrica lleva una **dirección**, y esa dirección es la única condición de fallo:

| Símbolo | Significado |
|---|---|
| `↓` | Deuda. Que suba rompe el build. |
| `↑` | Salud. Que baje rompe el build. |
| `·` | Informativa. Nunca falla; da contexto para leer las demás. |

El inventario no juzga el valor absoluto, solo el movimiento. Se puede convivir con la deuda que
sea; lo que no se puede es aumentarla sin enterarse.

Cuando una regresión aparece, el informe lista **los archivos concretos** donde esa métrica subió.

---

## Sprint 1 · Cimientos

### F0 · Red de seguridad y línea base

**Fecha:** 3 de agosto de 2026 · **Commit base:** `5b5e313` · **Archivos de `src/` tocados: 0**

**Qué se hizo**

- `scripts/ds-inventario.mjs` — 26 métricas, sin dependencias externas (solo Node nativo).
  Compara contra la línea base y sale con código 1 si una métrica de deuda sube o una de salud
  baja. Localiza el archivo culpable de cada regresión.
- `docs/baseline/inventario.json` — línea base versionada, con desglose por archivo.
- `package.json` — un script: `ds:inventario`.
- Esta bitácora.

**Línea base (3 ago 2026, commit `5b5e313`)**

134 componentes `.tsx` · 38.507 líneas.

| Métrica | Dir. | Fase | Valor |
|---|:--:|:--:|--:|
| Hex distintos en componentes | ↓ | F1 | 101 |
| Hex literales en componentes | ↓ | F1 | 4.638 |
| Hex en tokens (`index.css`) | · | F1 | 23 |
| Clases de token `@theme` en uso | ↑ | F1 | **0** |
| Imports de `src/theme.ts` | ↓ | F1 | **0** |
| Bordes `border-white/>12` | ↓ | F2 | 93 |
| Textos por debajo de 11 px | ↓ | F4 | 1.151 |
| Tamaños de texto distintos | ↓ | F4 | 12 |
| `font-black` / `font-extrabold` | ↓ | F4 | 117 |
| `font-mono` | ↓ | F5 | 1.527 |
| `font-sans` | ↑ | F5 | 590 |
| Espaciado fuera de escala | ↓ | F6 | 1.170 |
| Overlays `fixed inset-0` | ↓ | F9 | 39 |
| `transition-all` | ↓ | F13 | 377 |
| `animate-pulse` | ↓ | F13 | 29 |
| `prefers-reduced-motion` | ↑ | F13 | **0** |
| `aria-label` | ↑ | F14 | 23 |
| `htmlFor` | ↑ | F14 | **0** |
| `focus-visible` | ↑ | F14 | **0** |
| Archivos > 600 líneas | · | F15 | 21 |
| Radios `sm/md/lg/xl/2xl/3xl/full` | · | F3 | 9 / 45 / 425 / 257 / 278 / 21 / 174 |

**Verificado**

- `npm run lint` (tsc) limpio.
- `npm test` — 263 pruebas en 23 archivos, todas en verde.
- Detección de regresiones probada con un archivo temporal: sale con código 1 y nombra el archivo.

**Qué se dejó fuera, y por qué**

- **Capturas de referencia de las 21 pantallas.** El plan las pedía, pero exigen Playwright o
  Puppeteer, que no están instalados. Decisión de Dani el 3 ago: no añadir dependencias solo para
  esto. Para F1 no son necesarias — sus cambios son medibles por contador, y el único cambio visual
  esperado está acotado y descrito. **Pasan a ser bloqueantes en F3**, donde el plan declara la
  revisión visual obligatoria y no opcional. Si hacen falta antes, se propone como tarea
  independiente fuera de esta migración.

**Desviaciones respecto al plan**

- Se añadieron métricas que el plan no pedía —`font-black`/`font-extrabold`, `animate-pulse`,
  espaciado fuera de escala, archivos > 600 líneas— porque el coste marginal era cero y cubren
  fases posteriores (F4, F6, F13, F15). No cambian el alcance de nada.
- El desglose **por archivo** tampoco estaba en el plan. Es lo que convierte «una métrica ha
  empeorado» en «este archivo la ha empeorado», y es el sustituto barato de la regresión visual
  para todos los cambios mecánicos.

**Corrección aplicada durante F1**

La primera versión del script medía el hex de `src/index.css` junto al de los componentes. Eso
mezclaba dos señales opuestas: migrar un color a un token baja el contador en el componente y lo
sube en el CSS, así que el instrumento marcaba como regresión exactamente el trabajo que la
migración persigue. Se separó en dos métricas —`hex en componentes` (deuda) y `hex en tokens`
(informativa)— y se regeneró la línea base. Los números de componente no cambian respecto a F0:
entre ambos puntos solo se tocó `index.css`.

**Deuda detectada, no resuelta (no pertenece a este sprint)**

| Hallazgo | Dónde | A qué fase pertenece |
|---|---|---|
| 1 error de eslint: expresión sin usar | `AcademyCoachScreen.tsx:306` | Ninguna — preexistente, ajeno al DS |
| 172 avisos de eslint por variables sin usar | repartidos | Ninguna — ajeno al DS |
| `border-white/>12` son **93**, no 86 | 9 pantallas | F2 (la deuda creció desde la auditoría) |
| `fixed inset-0` son **39**, no 28 | + módulo `cardio/` | F9 (ídem) |
| `src/theme.ts` tiene **0 importadores** | — | F1 (está muerto del todo, no a medias) |

---

### F1 · Tokens reales en `@theme`

**Fecha:** 3 de agosto de 2026 · **Base:** `5b5e313` · **Commits:** 24, uno por token

**Resultado**

| Métrica | Antes | Después |
|---|--:|--:|
| Hex distintos en componentes | 101 | **15** |
| Hex literales en componentes | 4.638 | **29** |
| Tokens del DS en uso | 0 | **4.279** |
| Imports de `theme.ts` | 0 | archivo borrado |

El objetivo del plan era ≤ 22 hex distintos. Quedan 15, y ninguno es un duplicado de la
paleta: son blanco y negro puros, cadenas compuestas y los módulos que el plan excluye.

**Decisiones tomadas**

1. **Nombres `ink` / `ink-2` / `ink-3`** para la escala de texto, no `text` / `text-2` / `text-3`
   como en el DS. En Tailwind el nombre del token genera la clase, y `text-text-2` se lee mal y
   se teclea peor. El plan de migración ya usaba `ink` en todos sus ejemplos. Aprobado antes de
   escribir el bloque, porque afecta a 1.317 usos.
2. **`accent-line`** en vez de `accent` para el borde de acento del DS: `--color-accent` ya es el
   oro sólido y ambos generarían la misma clase `border-accent`.
3. **`ink-3` vale `#8a8d7b`**, el valor del DS, no el `≈#8a8f85` que cita el plan. El DS es
   normativo en valores.
4. **`@theme static`**. Sin él, Tailwind solo emite las variables que alguna clase consume, y un
   `var(--color-x)` en un estilo en línea o en un atributo SVG quedaría sin definir: sin error de
   compilación, sin aviso en consola, con el color desaparecido. Es la misma clase de fallo
   silencioso que frenó `theme.ts`.
5. **Sustitución según el prefijo.** `#2a2a2a` y `#3a3a3a` eran fondo en un sitio, texto en otro
   y borde en un tercero. Colapsarlos a un solo token habría convertido bordes en color de texto.
   Van a `raised`, `ink-3` y `hairline` según el prefijo de la utilidad.
6. **Se añaden los 5 tokens de serie de gráfica**, que el plan asignaba a F10, para que ningún hex
   sobreviva en los paneles. F10 los consumirá; aquí solo se declaran.

**Cambios visuales esperados** — y son los únicos admisibles

- **Texto secundario más legible.** 299 usos de `#555`, `#444`, `#888`, `#333`… pasan a `ink-3`.
  `#555` daba 2,38:1 y `#444` 1,83:1, frente al 4,5:1 de WCAG AA. El caso peor era `#2a2a2a`
  —el color de los bordes— usado como color de texto en la numeración de ejercicios de Rutinas:
  ≈1,1:1, invisible en la práctica.
- **Grises de fondo colapsados.** ~30 grises casi idénticos pasan a 4 superficies.
- **Bordes grises sólidos → `hairline`.** Translúcido en vez de calibrado para un solo fondo.
- **Estado seleccionado algo más cálido.** `#1a1c12` y `#1a1710` pasan a `accent-bg`.
- **Un botón dorado dejaba de serlo al pasar el ratón.** `hover:bg-[#cde600]` era el verde volt
  anterior al rebranding: pasa a `accent-press`.

**Verificado**

- `tsc --noEmit` limpio y 263 pruebas en verde tras cada tanda.
- Las 24 variables se emiten en el CSS compilado y resuelven en runtime con el valor correcto.
- **Recharts con `var()`**, que era el riesgo real de esta fase: comprobado en el navegador que
  `stroke="var(--color-warning)"` resuelve a `rgb(253,186,116)`, exactamente `#fdba74`.
- Barrido de 11 rutas a 375 px: 0 errores de consola, 0 desbordamiento horizontal.
- El inventario no mueve ni una métrica de otras fases: la migración tocó solo color.

**Qué se dejó fuera, y por qué**

| Qué | Cuánto | Por qué |
|---|--:|---|
| `src/utils/cardioZones.ts` | 6 | Regla dura del plan: `utils/` está fuera de alcance y tiene tests |
| `src/data/phasePresets.ts` | 6 | Son datos, no presentación |
| Blanco y negro puros | ~10 | No son duplicados de la paleta; el DS solo define `on-accent` |
| `shadow-[0_0_10px_#fbcb1a]` | 2 | Cadena compuesta; la elevación y el glow son F6 |
| Hex de 8 dígitos con alfa | 3 | `#fbcb1a33`, `#fbcb1a55` |

**Deuda detectada, no resuelta**

| Hallazgo | A qué fase pertenece |
|---|---|
| Los tokens antiguos siguen en `@theme` (0 usos, marcados «en retirada») | Borrar cuando el contador esté estable |
| Los botones de la barra inferior aparecen **sin nombre** en el árbol de accesibilidad — confirmado en el navegador, no solo por lectura de código | F14 |
| `MetricsScreen.tsx` sigue vivo y se ha migrado, aunque no lo enruta nadie | F2 lo borra |

---

## Sprint 2 · Defectos y radios

### F2 · Defectos objetivos

**Fecha:** 3 de agosto de 2026 · **Commits:** 8

**Qué se corrigió**

| Defecto | Medida | Resultado |
|---|--:|---|
| Bordes blancos por encima del 12 % | 93 | 79 estáticos → `hairline`, 14 en hover → `strong` |
| Resto de `border-white/N` | 932 | `/7` → `hairline` (879), `/12` → `strong` (11), `/4 /5 /10` → `hairline` (42) |
| Geometría del marco duplicada en 5 sitios | — | `--header-h` y `--nav-h` |
| Escala de z-index por orden de aparición | 11 valores | 7 capas con nombre |
| Campos de Perfil que provocan zoom en iOS | 3 | a 16 px |
| Barras de pestañas que desbordan | 4 | `overflow-x-auto hide-scrollbar` |
| Desbordamiento horizontal | 102 px + 52 px + 4 px | **0 en las 6 rutas medidas** |
| Código muerto | 441 líneas | `MetricsScreen.tsx` borrado |
| Hex a mano en `index.html` | 3 | a token, y el inventario ya lo mide |

**Lo que la auditoría decía y no era**

- Los bordes fuertes eran **93**, no 86, y **14 estaban en `hover:`**, donde el DS los quiere:
  colapsarlos todos habría borrado la señal de hover.
- El desbordamiento horizontal no lo causaba la barra inferior sino tres barras de pestañas sin
  scroll. La barra inferior es `w-full` y se estiraba por herencia, así que **parecía** la culpable.
- Los campos que provocan zoom en iOS no son 5: son **238 en toda la app**. Los 3 de Perfil eran el
  defecto puntual que F2 nombra; el resto es la escala tipográfica entera y le toca a F4.
- El desajuste de alturas no era de 4 px: la cabecera de escritorio mide **78 px** y el código
  asumía 65 en cuatro sitios, así que **13 px de contenido quedaban ocultos** en escritorio.

### F3 · Radios

**Fecha:** 3 de agosto de 2026 · **Commits:** 2 · **1.310 radios en 121 archivos**

El mapeo fue por **rol del elemento** (etiqueta JSX), no por valor actual — que es lo que desactiva
la colisión `rounded-lg` = `rounded-2xl` = 16 px.

| Clase hoy | px | Destino | px | Usos |
|---|--:|---|--:|--:|
| `rounded-lg` | 16 | `control` | 10 | 297 |
| `rounded-2xl` | 16 | `surface` | 16 | 276 |
| `rounded` | 4 | `control` | 10 | 271 |
| `rounded-xl` | 20 | `surface` | 16 | 134 |
| `rounded-xl` | 20 | `control` | 10 | 123 |
| `rounded-lg` | 16 | `surface` | 16 | 122 |
| `rounded-md` | 12 | `control` | 10 | 45 |
| `rounded-3xl` | 24 | `canvas` | 24 | 17 |
| `rounded-2xl` | 16 | `control` | 10 | 15 |
| `rounded-sm` | 8 | `control` | 10 | 10 |

415 conservan valor; 895 cambian a propósito. `rounded-full` intacto.

Al retirar los overrides del `@theme`, las clases de Tailwind recuperan su semántica estándar
(`rounded-lg` vuelve a 8 px, `rounded-2xl` a 16): **la colisión desaparece de raíz**, y quien
escriba `rounded-lg` por costumbre obtiene lo que espera.

**Verificación** — la revisión visual que el plan declara obligatoria en esta fase se resolvió
extrayendo del navegador el `border-radius` **computado** de cada elemento, antes y después, en
cinco pantallas. Los totales coinciden elemento a elemento (51, 74, 101, 45 y 43): ninguno perdió
ni ganó radio. En pantalla solo quedan 10 px, 16 px, 24 px y `full`.

**Decisión anotada:** los modales que usaban `rounded-xl` van a `surface`, no a `canvas`.
Identificar cuáles son modales exige leer el ciclo de vida de cada overlay, y eso es exactamente lo
que hace F9 al reescribirlos como `ui/Sheet` y `ui/Dialog`. Asignarlo a ojo ahora sería adivinar.

**Nota de método:** una verificación intermedia dio un falso negativo por estado obsoleto de HMR —
el navegador conservaba CSS antiguo y las clases `md:` parecían no aplicarse. **A partir de ahora,
toda verificación de layout se hace tras recarga completa**, nunca sobre el estado caliente.

**Línea base actualizada al cierre del sprint.** El inventario marcó una regresión de `font-sans`
(590 → 579) y localizó la causa: `MetricsScreen.tsx`, el archivo muerto borrado en F2, aportaba 11.
Falso positivo legítimo, así que la base se reescribe a propósito.

---

## Sprint 3 · Tipografía

### F4 · Escala tipográfica y suelo de tamaño

**Fecha:** 3 de agosto de 2026 · **Commits:** 12

**Resultado**

| Métrica | Antes | Después |
|---|--:|--:|
| Textos por debajo de 11 px | 1.145 | **0** |
| Escalones de tamaño en uso | 16 | **8 + 2 excepciones** |
| Pesos de fuente | 6 | **4** |
| Declaraciones de tamaño migradas | — | **2.981** |
| Pesos de Inter pedidos a Google Fonts | 6 | **4** |

**Tabla de equivalencia aplicada**

| Origen | px | Destino | px | Usos |
|---|--:|---|--:|--:|
| `text-[7/8/9/10/11px]` | 7–11 | `caption` | 11 | 1.210 |
| `text-xs` · `text-[12px]` | 12 | `label` | 12 | 693 |
| `text-sm` · `text-[13/14px]` | 13–14 | `body-s` | 13 | 610 |
| `text-base` · `text-[16px]` | 16 | `title-s` | 16 | 238 |
| `text-lg/xl` · `text-[18/20px]` | 18–20 | `title-m` | 19 | 115 |
| `text-2xl` · `text-[22px]` | 22–24 | `title-l` | 24 | 36 |
| `text-3xl/4xl/5xl` | 30–48 | `display` | 32 | 79 |

**Decisiones**

1. **No se declara `--text-*--font-weight`.** Emitiría el peso en la misma regla que el tamaño y
   competiría con las clases `font-*` según el orden de la hoja. El peso va con clases explícitas.
2. **No se declara el tracking de `label`.** De los 687 `text-xs`, 604 no llevaban tracking y son
   prosa. Emitirlo en el token se lo aplicaría a todos: decisión semántica dentro de la fase
   mecánica, y ~14 px más de ancho por línea de 20 caracteres.
3. **`text-sm` (14) baja a `body-s` (13)**, no sube a `body` (15). Ambos a 1 px, pero crecer 604
   elementos es el riesgo de desbordamiento que el plan llama el más subestimable.
4. **El 650 del DS se sirve con 700.** Inter se carga con pesos fijos, no como eje variable.

**Dos excepciones explícitas al Design System**

| Excepción | Motivo | Revisar en |
|---|---|---|
| **Barra de navegación inferior a 10 px** | A 11 px, 5 de los 7 destinos se truncan hasta quedar ilegibles («ACA…», «CAR…»). La solución no es tipográfica sino de arquitectura de navegación. Prima la usabilidad sobre la uniformidad. | Fase posterior — ver incidencia abierta |
| **Cifras de la sesión de cardio en directo a 60 y 72 px** | Pulsación en vivo, cuentas atrás y RPE se leen a distancia de brazo durante el esfuerzo. `display` (32 px) las reduciría a menos de la mitad justo donde el contexto de uso es más exigente. | Propuesta de extensión del DS pendiente de aprobación |

### F5 · Mono → Sans

**Fecha:** 3 de agosto de 2026 · **Commits:** 2 · **478 migraciones en 3 tandas**

| Métrica | Antes | Después |
|---|--:|--:|
| `font-mono` | 1.508 | **1.030** |
| `font-sans` | 579 | **1.057** |
| Proporción | 72 % mono | **sans > mono** |

**Clasificación de las 1.504 apariciones**, con criterio deliberadamente estrecho:

| Tipo | Cuántas | Qué se hizo |
|---|--:|---|
| Prosa inequívoca | 256 | → sans (tanda 1) |
| Botones y enlaces | 64 | → sans (tanda 2) |
| Interpolación de prosa | 158 | → sans (tanda 3) |
| Etiquetas en versalitas ≤3 palabras | 347 | se quedan en mono — el DS las quiere ahí |
| Datos interpolados | ~555 | se quedan en mono |
| Ambiguas | ~286 | **sin tocar**: adivinar es peor que no tocar |

**Verificado:** solo 2 elementos con cifra acaban en sans sin `tabular-nums`, y ambos son frases
con un número dentro, no cifras en columna.

### Limpieza aprobada — tokens muertos

12 tokens antiguos del `@theme` y la utilidad `.cyan-glow`, con **0 referencias** verificadas sobre
297 archivos de todo el repo. `.volt-glow` **no se toca**: tiene 1 uso activo en
`NutritionScreen.tsx:1077`, así que la limpieza se detuvo ahí, según lo acordado, y queda para F6.

### Verificación del sprint

Censo tipográfico computado a 375 px sobre 6 rutas, antes y después, tras recarga completa:

| | Antes | Después |
|---|--:|--:|
| Nodos de texto | 837 | **837** |
| Pesos distintos | 6 | **4** |
| Nodos en mono / sans | 292 / 545 | **229 / 608** |
| Nodos truncados | 14 | 16 |
| Desbordamiento horizontal | 0 | **0** |

Los 2 truncados nuevos son metadatos secundarios con elipsis («Ficha de iniciación», «Hombre · 36
años»); su contenedor es la restricción y le toca a F6.

**Efecto secundario anotado:** 590 iconos Material Symbols llevan ahora un token de texto. Ya
montaban sobre la escala de Tailwind antes de esta fase —el patrón es preexistente— y los deltas
son de ≤1 px, pero un icono no se rige por la escala tipográfica. Una primitiva `Icon` con su
propia escala corresponde a **F7**.

---

## Sprint 4 · Ritmo y primitivas

### F6 · Espaciado, ritmo vertical y sombras

**Fecha:** 3 de agosto de 2026 · **Commits:** 9

**Resultado**

| Métrica | Antes | Después |
|---|--:|--:|
| Espaciado fuera de la escala | 1.208 | **0** |
| Sombras fuera de la escala | 113 | **0** |
| Brillos dorados ad-hoc | 31 | **0** (queda 1, con token) |
| Declaraciones de espaciado migradas | — | **1.209** |

**Paso 0 — el instrumento mentía.** La métrica de espaciado solo miraba
píxeles arbitrarios y pasos fraccionarios, así que no veía `py-20` (80 px),
`pl-9` (36) ni `p-7` (28): 51 usos que habrían sobrevivido a la fase con el
contador a cero. Se añadió la detección de escalones enteros y dos métricas
nuevas —sombras fuera de escala y glow de acento—, sin las cuales los
criterios de cierre de esta fase no eran medibles sino opinables.

**Hallazgo que abarató la fase.** Medidos uno a uno, los 1.157 valores fuera
de escala resultaron ser **cero píxeles arbitrarios**: todos eran pasos
fraccionarios de Tailwind. Eso convirtió lo que el plan describía como una
auditoría caso por caso en cuatro sustituciones mecánicas con tabla de
equivalencia, del mismo tipo que F4 y reversibles commit a commit.

**Tabla de equivalencia aplicada**

| Origen | px | Destino | px | Usos |
|---|--:|---|--:|--:|
| `*-3.5` | 14 | `*-4` | 16 | 45 |
| `*-2.5` | 10 | `*-3` | 12 | 290 |
| `*-1.5` | 6 | `*-2` | 8 | 565 |
| `*-0.5` | 2 | — se borra | 0 | 256 |
| `py-12/16/20/24`, `p-12/16` | 48–96 | `*-10` | 40 | 45 |
| `pt-24`, `pb-24` | 96 | `*-14` | 56 | 2 |
| `p-7`, `pl-7`, `pl-9`, `px-9` | 28–36 | `*-8` / `*-10` | 32 / 40 | 6 |

**Decisiones**

1. **Redondeo hacia arriba**, salvo los 2 px, que el DS no redondea sino que
   prohíbe: los llama «un accidente, no espaciado». Decisión de Dani, sin
   excepciones. Ninguna insignia colapsó al perder el relleno vertical — la
   altura la fijaba el interlineado.
2. **Los estados vacíos no se redondean: se les asigna su valor.** Los 45
   `py-12/16/20/24` son todos estados vacíos o cargadores, y el DS le asigna
   a ese paso 40 px. Convivían cuatro alturas para exactamente lo mismo.
3. **La regla «gap, no margen» se limitó a los contenedores ya tocados.**
   Aplicarla a fondo eran 322 reescrituras de JSX, y eso convierte un cambio
   de estilo en un cambio de estructura. Decisión de Dani; el resto queda
   anotado para F11.
4. **Ritmo vertical de alcance estrecho.** Las raíces de las pantallas ya
   estaban a 24 px; lo que rompía el ritmo eran las vistas a las que se entra
   desde ellas. El espaciado interno de paneles, tarjetas y listas no se
   toca: el DS le asigna pasos menores a propósito, y confundirlo con el
   ritmo de pantalla sería aplanar la jerarquía en vez de ordenarla.

**Elevaciones.** 98 sombras clasificadas por lo que son, no por su valor: 21
a `e2` (overlays), 9 a `e1` (lo que flota sobre contenido que se desplaza) y
**67 retiradas** — tarjetas, botones, pestañas y chips se quedan sin sombra.
Convivían `shadow-sm`, `md`, `lg`, `xl`, `2xl`, `inner` y `none` como si
fueran una escala, cuando el borde `hairline` ya define la superficie.

**El glow.** 23 brillos dorados retirados —incluidos los cuatro que la
auditoría nombra— y **uno conservado**: el siguiente entrenamiento pendiente,
que es el único uso que el DS le reserva. `.volt-glow` se queda sin usos y se
borra del CSS; F5 la había dejado viva a propósito esperando esta fase.

**Verificación**

Censo de espaciado computado a 375 px sobre las rutas de entrenador, tras
recarga completa:

| | Resultado |
|---|---|
| Desbordamiento horizontal | **0** en todas las rutas |
| Espaciado fuera de escala | solo geometría del marco (`--nav-h`), los 2 márgenes negativos del gutter de scroll y el *user-agent stylesheet* de `<option>` |
| Sombras en pantalla | **solo `e1`** (barra inferior y FAB); `e2` verificada abriendo un overlay |
| Truncados | los mismos de antes: las etiquetas de la barra inferior (R10) |

`shadow-e1`, `shadow-e2` y `shadow-glow` verificadas **en el CSS compilado**,
con sus valores exactos: una clase que Tailwind v4 no genera no falla el
build ni avisa en consola, que es el fallo silencioso característico de este
repo. 263 pruebas en verde, `tsc` limpio, build limpio.

**Nota de método.** El primer censo «antes» resultó inservible: el viewport
se había fijado a 375 px pero la aplicación seguía renderizando el layout de
escritorio, así que medía la barra lateral en vez de la inferior y daba dos
truncados nuevos que no existían. Es la misma familia de error que R9. Se
resolvió por geometría —la etiqueta de la barra inferior pierde `px-0.5` y
por tanto **gana** 4 px de ancho útil—, que es concluyente sin depender de
una medición comparable.

**Deuda anotada, no resuelta**

| Hallazgo | Medida | Fase |
|---|--:|:--:|
| Márgenes negativos usados para compensar espaciado | 21 | F11 |
| `<select>` con aspecto nativo junto a campos personalizados | — | F7 · F11 |

---

### F7 · Primitivas en `src/components/ui/`

**Fecha:** 3 de agosto de 2026 · **Commits:** 14 · **13 primitivas**

**Resultado**

| Métrica | Antes | Después |
|---|--:|--:|
| Primitivas en `ui/` | 0 | **13** |
| `aria-label` | 23 | **33** |
| `htmlFor` | 0 | **1** |
| `focus-visible` | 0 | **31** |
| Overlays artesanales fuera de `ui/` | 39 | **39** (sin cambio: F9 los migra) |

Ninguna pantalla de producción adopta las primitivas —eso es F8— y el CRM sigue con `StatusPill`,
`Modal`, `MetricCard` y el resto de sus componentes propios, sin tocar. Un commit por primitiva,
verificado a 375 px tras recarga completa en cada uno: `tsc`, 263 pruebas, build,
`ds:inventario`, y comprobación en el navegador con clic y teclado reales — no simulados por
lectura de código.

**Paso 0 — el instrumento otra vez por delante del trabajo.** Igual que en F6, hubo que arreglar
el contador antes de escribir la primera línea de una primitiva. La métrica de overlays contaba
`fixed inset-0` en todo `src/`; `Sheet` y `Dialog` la habrían subido de 39 a 41 y roto el build en
cada commit posterior — penalizando exactamente el trabajo que la fase pide hacer. Se añadió un
campo `ambito(rel)` opcional a la definición de métrica; la de overlays declara el suyo: cuenta
solo fuera de `ui/`. No es una decisión nueva — es el criterio que el panel de estado ya tenía
escrito («0 fuera de `ui/`») y que el contador no sabía leer. Verificado con un archivo temporal a
cada lado de la frontera antes de construir nada más.

**Primitivas construidas, en orden**

1. **`Icon`.** Escala propia de 4 pasos (`--text-icon-s/m/l/xl`, 16/20/24/32), no la tipográfica.
2. **Escaparate en `/ui`**, solo `import.meta.env.DEV`, y el hallazgo que cambia F8 (ver abajo).
3. **`Button`.** 4 variantes, 3 tamaños, 44 px mínimo, `focus-visible` de serie.
4. **`Input`** + `Campo` (envoltorio compartido con `Select`). 16 px fijo, `htmlFor` por `useId`.
5. **`Select`.** `appearance-none` sobre la piel del sistema; el comportamiento nativo se conserva.
6. **`Card`.** Sin prop de sombra — F6 ya decidió que la elevación por defecto es «ninguna».
7. **`Badge`.** 6 tonos de estado; sin tono dorado, a propósito.
8. **`Tabs`.** Scroll contenido con anclaje, roving tabindex, flechas/Inicio/Fin.
9. **`Chip`.** Botón de seleccionar y de quitar como HERMANOS, nunca uno dentro del otro.
10. **`ListRow`.** `<button>` cuando es pulsable, elemento simple cuando no.
11. **`PageHeader`.** Ceja en borde de acento, nunca oro sólido; oro reservado para la acción.
12. **`Sheet`.** Portal a `document.body`, foco atrapado, Escape, bloqueo de scroll compartido.
13. **`Dialog`.** Misma infraestructura que `Sheet`; solo cambia la posición.
14. **`EmptyState`.** 40 px de relleno vertical — el valor que F6 ya había asignado a este caso.

**El hallazgo que cambia lo que va a parecer F8.** Midiendo `Icon` en el navegador: los cuatro
tamaños computaban 24 px sin importar el token pedido. Causa: `.material-symbols-outlined` (Google
Fonts) trae `font-size: 24px` y llega por `<link>` externo, **sin capa CSS**; las utilidades de
Tailwind v4 viven en `@layer utilities`, y en la cascada de capas lo que no tiene capa gana siempre
a lo que sí la tiene, sin importar el orden de carga ni la especificidad del selector. Consecuencia
verificada, no leída: **los 590 iconos de la app se renderizan hoy a 24 px pase lo que pase** —
`text-caption`, `text-body-s`, `text-display` sobre un icono no hacen nada. Ni `tsc`, ni el build,
ni el inventario lo habrían visto; solo medir en pantalla. `Icon` usa `.ui-icon` (index.css), la
misma base sin capa y sin tamaño dentro, para que la utilidad de tamaño no compita con nada. F8
hereda una tabla de equivalencia (en la cabecera de `Icon.tsx`) y la certeza de que adoptar el
icono no es cosmético: va a cambiar tamaños visibles en 590 sitios.

**R4 (bloqueo de scroll mal desmontado) resuelto en la infraestructura, no en la app.**
`features/crm/components/Modal.tsx` —el único overlay del repo con intento de bloqueo de scroll—
captura el `overflow` previo del body y lo restaura al desmontar: correcto con un overlay, roto con
dos independientes, porque el que cierra primero restaura el scroll aunque el otro siga abierto.
`internal/overlayHooks.ts` (nuevo, compartido por `Sheet` y `Dialog`, no es una primitiva pública)
usa un contador a nivel de módulo: solo el ÚLTIMO overlay en cerrarse restaura. **Verificado con
overlays reales**, no simulado: se abrieron un `Dialog` y un `Sheet` a la vez y se cerraron en
orden inverso al de apertura —primero el que se abrió después—; `document.body.style.overflow`
siguió en `'hidden'` con uno de los dos todavía abierto, y solo se liberó al cerrar el segundo. La
primera versión de esta prueba reutilizaba por error la misma variable de estado para dos `Sheet`
distintos (abría 3 overlays donde el texto decía 2); se corrigió antes de dar la prueba por buena.

**Límite anotado, no resuelto:** dos overlays abiertos A LA VEZ no coordinan el foco atrapado entre
sí —cada uno escucha Tab por su cuenta—. Es el mismo caso que R3 deja abierto para F9.

**Verificado**

- `tsc --noEmit` y 263 pruebas en verde tras cada uno de los 14 commits.
- `npm run build` limpio en los 14; ningún chunk del escaparate en `dist/` (el `import.meta.env.DEV`
  envuelve el `lazy()`, no solo la ruta, así que Vite poda la rama entera).
- Foco atrapado y Escape probados con teclado real (Tab, Shift+Tab, Escape), no con `.focus()` por
  consola — un `.focus()` de consola no activa `:focus-visible` ni las heurísticas del navegador.
- Un error propio detectado antes de verificar: `Chip` anidaba un `role="button"` (la X de quitar)
  DENTRO de su botón de seleccionar — HTML inválido, el navegador repara el árbol moviendo el
  interior a un sitio impredecible. Reescrito como hermanos antes de medir nada.
- Otro error propio: `PageHeader` pasaba `<Icon>` como children del botón de volver en vez de la
  prop `icon`, perdiendo el tratamiento cuadrado de «solo icono» de `Button`. Corregido.
- Nota de método: leer `document.querySelectorAll` inmediatamente después de `.click()` en consola
  da falsos negativos —React no aplica la actualización de estado de forma síncrona—. Misma familia
  de error que R9 (estado caliente de HMR), aplicada a estado de React en vez de a CSS.

**Qué se dejó fuera, y por qué**

| Qué | Por qué |
|---|---|
| Adopción en pantallas de producción | Es F8. Cero pantallas importan de `ui/` fuera del escaparate |
| Conversión del CRM a re-exports | Decisión explícita: el CRM no se toca en F7, es adopción (F8) |
| `Skeleton` | No estaba en la lista pedida; además rompería la métrica `animate-pulse` (deuda a 29) sin el mismo tratamiento de ámbito que overlays |
| `@types/react` en el repo | Cuesta 3 errores, los tres el mismo bug real (`setEditorTab('volume')` en `MesocycleManager.tsx`, valor fuera de la unión `EditorTab`) — fuera de alcance de F7, anotado para arreglo aparte |

**Deuda anotada, no resuelta**

| Hallazgo | Fase |
|---|:--:|
| 590 iconos con tokens de texto inertes (primitiva lista, adopción pendiente) | F8 |
| `<select>` nativo junto a campos personalizados (primitiva lista, adopción pendiente) | F11 |
| 39 overlays artesanales sin foco atrapado ni Escape (plantilla lista en `Sheet`/`Dialog`) | F9 |
| `setEditorTab('volume')`, valor fuera de la unión `EditorTab` en `MesocycleManager.tsx` — invisible para `tsc` porque el repo no tiene `@types/react` | Ajena al DS |

---

## Sprint 5 · Adopción (en curso)

### F8 · Adopción de bajo riesgo

**Fecha:** 3-4 de agosto de 2026 (sesión en curso) · **Commits:** 64 hasta ahora · **Estado: no
cerrada**

**Alcance de esta sesión:** 9 de las 13 primitivas (`EmptyState`, `Badge`, `Chip`, `ListRow`,
`Card`, `Tabs`, `Button`, `PageHeader`, `Icon`) adoptadas en 57 de 79 archivos. `Select`, `Sheet` y
`Dialog` no se tocan — son F11 y F9 respectivamente. `src/components/cardio/`, `src/components/
roadmap/` y `src/features/crm/**` quedan fuera del alcance de F8 por decisión previa (ver
`DESIGN_SYSTEM_STATUS.md`).

**Orden de adopción, y por qué.** `EmptyState` primero, como piloto, para validar el flujo de
verificación antes de escalar. Luego `Badge`, `Chip`, `ListRow`, `Card` — cada una reduce parte de
la superficie de iconos sueltos que `Icon` (el paso más delicado) tendría que tocar directamente,
porque sus iconos internos ya quedan bien dimensionados por composición. `Tabs` y `PageHeader`
después, por ser los cambios visuales más notorios (ver más abajo). `Button` intercalado. `Icon`
standalone al final, y solo en la navegación principal (`App.tsx`) en esta sesión — el resto de los
~580 usos sueltos quedan para continuar la fase.

**El mismo falso positivo del inventario, seis veces.** Cada primitiva adoptada baja `Tokens del DS
en uso` y `font-sans` **por archivo** sin que sea una regresión real: las clases se centralizan en
`ui/*.tsx` (que F7 ya las contaba) en vez de repetirse en cada pantalla. Mismo mecanismo que el
falso positivo de `hex en tokens` en F1. Se verificó en cada lote que el archivo señalado era
exactamente el que se acababa de migrar, y se reescribió la línea base a propósito
(`--write`) — nunca a ciegas.

**`key` sin `@types/react`.** F7 ya había anotado esto como deuda ajena al DS
(`setEditorTab('volume')`). En F8 se volvió bloqueante de verdad: cualquier primitiva usada dentro
de un `.map()` necesita `key` en sus props, y sin `@types/react` TypeScript no lo excluye solo. El
propio repo ya tenía el workaround, sin documentar, en `CardProps` de `RecipesScreen.tsx`
(anterior a F8). Se replicó el mismo patrón (`key?: React.Key` explícito) en `Badge`, `Chip`,
`ListRow` y `Card` — un comentario en cada una remite a esta nota.

**Decisión de Dani, consultada antes de aplicarla.** El primitivo `Tabs` (F7) marca la pestaña
activa con `bg-raised` + negrita, nunca con oro — «el oro es la siguiente acción, no un indicador
de sección», ya escrito en el propio `Tabs.tsx`. Pero los seis interruptores reales de la app
(`TrainingLab`, `Entrenamiento`, `Nutrición` coach y atleta, `Ajustes de Entrenadores`, el hub de
cliente con sus dos niveles) usaban todos `bg-accent text-black`. Adoptar `Tabs` tal cual le quita
el dorado a la navegación por pestañas de casi toda la consola de coach en una sola sesión — se
detuvo el trabajo y se preguntó explícitamente antes de aplicarlo. Respuesta: adoptar tal cual, es
una decisión de F7 ya aprobada, F8 es adopción no rediseño. El mismo criterio se aplicó sin volver
a preguntar a `PageHeader` (título 24px/bold en vez de los 32px/extrabold de `TrainingLab` y
`Revisiones`), por ser la misma categoría de decisión.

**El bug de accesibilidad de la barra inferior, cerrado en parte.** F7 había dejado documentado
que los 7 iconos del dock no tienen `aria-hidden`, así que su ligadura de texto se cuela en el
nombre accesible del botón junto a la etiqueta visible. Al adoptar `Icon` en `App.tsx` (sidebar de
escritorio + barra inferior), el arreglo llega gratis: `Icon` sin prop `label` es decorativo por
defecto (`aria-hidden`), que es lo correcto porque ya hay texto visible al lado en los dos casos.

**Casos que no encajaron limpiamente — dejados tal cual a propósito:**

| Qué | Por qué |
|---|---|
| Filtros con color por categoría (`CAT_COLOR` en `FoodLibraryScreen`, `METRIC_COLOR` en `LoadHistoryPanel`, `recetasCat` en `RecipesScreen` con `bg-data`) | `Chip.selected` es un único color fijo; forzarlo aplanaría un sistema de color con significado real |
| Toggles con `min-h-[44px]` explícito (mismos archivos) | `Chip` no garantiza 44px; adoptarlo sería una regresión de objetivo táctil, no solo visual |
| Tarjetas con icono dentro del título (`ClientDietsPanel`, `ClientReviewsPanel`, `CoachNotesPanel`, decenas más) | `Card.title` es texto plano, sin slot para icono |
| Filas con un `<a>` real envolviendo título+subtítulo (`ResourcesPanel`), o con 3 líneas de texto (`NotificationBell`) | `ListRow.title`/`subtitle` son un string cada uno, no nodos |
| Cabeceras con indicador "Sincronizado" en vivo junto a la ceja (`TrainingCoachScreen`, `NutritionCoachScreen`, `ClientsScreen`) | `PageHeader.eyebrow` es solo texto, sin slot para un segundo indicador |
| Header de `ClientHub` (avatar + badge de plan + tarjeta de adherencia inline) | Composición propia, no el título simple que `PageHeader` resuelve |
| Contenido dentro de los 39 overlays artesanales (`WorkoutsScreen` picker, `MyDietsScreen` picker, `MyMenuScreen` modal de swap, `CommandPalette`) | F9 los reescribe enteros; tocar su contenido ahora es trabajo que esa fase podría deshacer |
| Botones de texto en oro sin fondo ni borde (`AcademyCoachScreen` acciones de cabecera, `ResourcesPanel` "Nuevo") | Ninguna de las 4 variantes de `Button` reproduce ese tratamiento |

**Verificado:** `tsc --noEmit`, 263 pruebas y `npm run build` limpios tras cada lote. `ds:inventario`
sin regresiones reales (solo el falso positivo ya descrito). Verificación visual en `/ui` a 375 px
tras recarga completa para cada primitiva, incluida una prueba de teclado real en `Chip` (Tab +
click) confirmando el foco visible y el toggle de selección.

**Sin verificar, y por qué.** Ninguna pantalla de producción se vio renderizada con una sesión real:
el login de coach usa Google OAuth y no existe sandbox de coach (limitación ya documentada en el
proyecto); el login de atleta (`atleta@enforma.com`) existe pero esta sesión no tenía la
contraseña. Es la comprobación pendiente de mayor prioridad antes de dar F8 por buena, sobre todo
en `App.tsx` (nav principal, se ve en cada sesión de cada usuario) y en las seis pantallas donde
`Tabs` cambió de color.

**Deuda anotada para continuar F8:**

| Hallazgo | Medida |
|---|--:|
| Archivos de `src/components/*.tsx` sin revisar — los más grandes del lote: `OnboardingForm`, `MesocycleTemplateLibrary`, `WorkoutsScreen`, `NutritionPlansScreen`, `MyMenuScreen`, `WeeklyMenuEditor`, `DietMealsView`, `CardioScreen`/`CardioCoachScreen`, `AthleteOnboardingWizard`, `ProfileScreen`, `QuestionnaireEditor`, `AiChatPanel`, `RoadmapTimeline`, `WelcomeScreen`, `CommandPalette`, `NutritionPeriodizationPanel`, `NutritionPerformanceDashboard` | 22 |
| Usos de `Icon` standalone pendientes de migrar (solo se adoptó donde ya tocaba por otra primitiva, o en componentes pequeños) | varios cientos, concentrados en los archivos de arriba |
| Cabeceras con `PageHeader` sin adoptar por el indicador "Sincronizado" | 3 (`TrainingCoachScreen`, `NutritionCoachScreen`, `ClientsScreen`) |
| Verificación visual con sesión real (atleta y coach) | Pendiente — bloqueada por credenciales |

### F8 · Cierre (continuación, 4 de agosto de 2026)

**Commits de esta continuación:** 17 (uno por archivo, más los rebaselines de `ds:inventario`
incluidos en cada commit) · **Total F8:** 81 commits · **Estado: ✅ cerrada**

Se retomó exactamente donde quedó la entrada anterior — 22 archivos listados como deuda — y se
revisaron uno a uno con el mismo ritmo (`lint` → `test` → `build` → `ds:inventario`, confirmar el
falso positivo, `--write`, commit): `AiChatPanel`, `AthleteOnboardingWizard`, `CardioScreen`,
`CardioCoachScreen`, `CommandPalette`, `DietMealsView` (revisado, sin cambios — tabla numérica pura
sin iconos/botones), `MesocycleTemplateLibrary`, `MyMenuScreen`, `NutritionPerformanceDashboard`,
`NutritionPeriodizationPanel`, `NutritionPlansScreen`, `OnboardingForm`, `ProfileScreen`,
`QuestionnaireEditor`, `RoadmapTimeline`, `WeeklyMenuEditor`, `WelcomeScreen`, `WorkoutsScreen`.

**Cuatro archivos más, fuera de la lista de deuda original, aparecieron al recontar los 79 al
cierre:** `ClientRoadmapPanel.tsx` (10 líneas, un *pass-through* a `roadmap/`, nada que adoptar),
`ProgressRing.tsx` (SVG puro, sin iconos ni botones), `ScheduleFields.tsx` (un `<select>`, F11, y un
selector de día-de-semana con el mismo patrón píldora rectangular documentado abajo) y
`Skeleton.tsx` (es infraestructura visual — el propio bloque base de los estados de carga — no una
pantalla de producción). Los cuatro se revisaron y se dejan intactos a propósito; ninguno tenía
contenido dentro del alcance de F8.

**El patrón repetido que sí se dejó fuera, documentado una sola vez para no repetirlo archivo a
archivo:** el selector de opción con forma de píldora rectangular (`rounded-control`,
`bg-accent text-black` cuando está seleccionado) aparece como abstracción compartida
(`PillSelect`/`YesNo`/`CheckboxGroup` de `OnboardingForm`, usada en decenas de campos de la
anamnesis) y como variantes locales casi idénticas en `WeeklyMenuEditor` (variedad, tipos de
plato), `ScheduleFields` (día de la semana) y el `Chip` local de `AthleteOnboardingWizard` (que
además soporta una variante "grande" de tarjeta que `Chip` del DS no tiene). `Chip` del DS es
`rounded-full` — cambiar la forma de prácticamente todos los controles de elección de la app habría
sido un rediseño, no la adopción de bajo riesgo que F8 tiene mandato de hacer. Se deja como
candidato documentado para F12.

**Un caso nuevo sí se resolvió con `Chip`:** los selectores de modo de dieta y categoría del
*picker* de alimentos en `NutritionPlansScreen` (botones sueltos `rounded-full`, sin abstracción
compartida) — mismo criterio ya aplicado a `Tabs`: la primitiva aprobada en F7 se adopta tal cual,
aunque el tono cambie de sólido dorado a tintado con borde.

**`danger` de `Button` es tenue, no sólido — aceptado en todos los modales de confirmación de
borrado de esta continuación** (`MesocycleTemplateLibrary`, `NutritionPlansScreen`,
`WorkoutsScreen`), incluidos los que partían de un rojo sólido (`bg-red-500/80`,
`bg-red-500 hover:bg-red-600`). Mismo razonamiento que `Tabs`: la primitiva ya la aprobó F7, F8
adopta, no rediseña.

**Verificado:** los mismos cuatro pasos (`tsc --noEmit`, 263 pruebas, `npm run build`,
`ds:inventario` con el falso positivo esperado y corregido) en los 17 commits de esta continuación,
sin ninguna regresión real ni fallo. **Sigue sin verificación visual en pantallas reales** — misma
limitación de credenciales que la entrada anterior; no cambió en esta sesión.

**F8 queda cerrada.** Los 79 archivos de `src/components/*.tsx` están revisados con una decisión
explícita cada uno — 74 con cambios, 5 sin ellos (justificado arriba, en ambas entradas). La deuda
que queda (`Select`, `Sheet`/`Dialog`, los overlays artesanales, `cardio/`, `roadmap/`,
`src/features/crm/**`, y el patrón píldora rectangular) es la reservada por diseño para F9/F11/F12,
no trabajo pendiente de F8. Siguiente fase: F9 (`Sheet`/`Dialog`).

### F9 · Sheet / Dialog: los modales artesanales

**Fecha:** 4 de agosto de 2026 · **Commits:** 28 · **Overlays artesanales: 39 → 7**

**Paso 0 — clasificar antes de migrar.** El plan lo exigía y fue lo que evitó el error de la fase:
migrar por patrón de clase habría convertido pantallas en diálogos. Cada overlay recibió una
etiqueta —`Sheet`, `Dialog`, o «no es un modal»— antes de escribir una línea.

**Y el instrumento contaba prosa.** De las 39 apariciones, una era un *comentario* en
`features/crm/components/Modal.tsx` que describía el patrón: los overlays reales eran **38**. La
misma trampa volvió al final: los comentarios que documentan los overlays no migrados subieron la
métrica de 7 a 12 hasta reescribirlos sin la cadena literal. Tercera fase seguida (F6, F7, F9) en la
que hay que entender el contador antes de fiarse de él.

**Tres ampliaciones de primitiva, las tres consultadas con Dani antes de tocarlas.** Ninguna era
previsible en F7, que construyó las primitivas sin un solo consumidor real:

| Ampliación | Qué la motivó |
|---|---|
| `Dialog` gana `xl` (`max-w-2xl`) | Censo de anchos reales: `sm` 11, `md` 9, `lg` 9, **`2xl` 5**, `4xl` 1. Los 5 de `2xl` son los que muestran prosa larga o dos columnas |
| `Sheet` gana la misma escala | Dos overlays son `2xl` **y** bottom-sheet, así que no podían irse a `Dialog`. La escala se extrae a `ui/internal/overlaySizes.ts`: el ancho es la misma decisión en ambas |
| `Sheet` gana el slot `toolbar` | 7 overlays son *pickers* con la misma anatomía y su barra de búsqueda no puede scrollear |

El `toolbar` es el hallazgo de la fase. Los pickers comparten título · barra fija (pestañas, chips,
buscador) · lista de resultados, y `Sheet` solo tenía cabecera + cuerpo scrollable + footer. Con la
barra dentro del cuerpo, el buscador desaparece al bajar por la lista — sobre el banco de 311
alimentos eso no es estética, es dejar de poder usar el picker. Verificado en `/ui` tras recarga
completa: con la lista desplazada 600 px de 2.480, la barra sigue en `top: 78px`.

**R4 cerrado en su origen.** `features/crm/components/Modal.tsx` pasa de 63 líneas a 33 envolviendo
`Sheet`. Era la única implementación del repo con bloqueo de scroll propio y tenía el bug exacto que
R4 describe: capturaba y restauraba el `overflow` del body por overlay, así que con dos abiertos el
primero en cerrarse devolvía el scroll. También le faltaba el foco atrapado. Su API (`titulo` /
`onCerrar` / `footer`) no cambia y sus 7 usos no se tocan.

**R3 se disuelve al clasificar, no al migrar.** El riesgo eran los modales que se abren durante un
entrenamiento en directo. Al leerlos: **5 de los 6 overlays de `cardio/` no son modales**.
`LiveSession` (degradado opaco por zona de FC), `EffortPrompt`, `CooldownPrompt`, `HrvTestScreen` y
`CardioSessionDetail` tienen fondo opaco, sin telón y sin caja — son vistas a pantalla completa.
El único modal de verdad era `ManualSessionModal`, que se abre desde la lista, no durante el esfuerzo.

**Los 7 overlays que no se migran, con el motivo escrito en el propio código** para que nadie
«termine el trabajo»:

| Overlay | Motivo |
|---|---|
| Las 5 vistas de `cardio/` | No son modales |
| `CommandPalette` | Anclada arriba (`pt-14`), convención de Cmd+K; ni `Dialog` (centra) ni `Sheet` (sube) tienen esa posición |
| `ReportEditor` | Único con `lg:grid-cols-2` (controles + vista previa en vivo) a `max-w-4xl`; a `xl` cada columna bajaría de ~430 a ~320 px |

Los dos últimos, **decisión de Dani**: no se les añade una variante ahora; van a la fase de diseño,
que decidirá si la posición superior merece ser parte de la primitiva y si el editor de reportes
debe ser modal, ruta propia o panel.

**Un caso donde el `footer` de la primitiva es el sitio equivocado.** En `ExerciseLibraryScreen` los
botones se quedan dentro del `<form>`: el de guardar es `type="submit"` y llevarlo al `footer` lo
habría sacado de su formulario. Queda escrito porque es contraintuitivo.

**Falso positivo de familia nueva.** Además del ya conocido (`Tokens del DS en uso` y `font-sans`
bajan al centralizar clases en `ui/`), en F9 bajó **`aria-label` 33 → 30, que es métrica de salud**.
Causa: los `aria-label="Cerrar"` escritos a mano desaparecen y los pone la primitiva, que ya
aportaba el suyo desde F7. Verificado leyendo `Sheet`/`Dialog`: ningún botón perdió su nombre
accesible, y en el CRM mejora — pasa a `aria-labelledby` apuntando al título visible.

**Arreglos que llegaron gratis**, sin ser objetivo de la fase: el confirmar-borrado del banco de
alimentos no decía *qué* se borraba (ahora muestra la etiqueta, dato ya disponible en pantalla); las
instrucciones fijas del asistente no tenían botón de cerrar ni Escape; el detalle de receta de Mi
Menú repetía el cierre en dos ramas y no tenía ninguno mientras cargaba; el picker de ejercicios
conserva su contador «N ejercicios disponibles» en el `footer` en vez de perderlo.

**Cambios visuales anotados, no accidentales.** La celebración de entreno completado pierde su borde
dorado (`accent/30` → `strong`); los iconos decorativos de las cabeceras de overlay se pierden
porque `title` es texto plano; los subtítulos dinámicos bajan del título al `toolbar` o al cuerpo.
Todos son adopción, no rediseño, y quedan como candidatos para la fase de diseño.

**Verificado:** `tsc --noEmit`, 263 pruebas y `npm run build` limpios tras cada uno de los 28
commits; `ds:inventario` sin regresiones reales. Verificación funcional de las primitivas en el
navegador (`/ui`, recarga completa): `Dialog xl` computa 672 px exactos, el `overflow` del body pasa
a `hidden` al abrir y Escape lo cierra devolviéndolo, y la barra del `toolbar` no se mueve al
desplazar la lista. **Sin verificación visual en pantallas reales** — misma limitación de
credenciales que F8, y decisión explícita de Dani el 4 ago: no dedicar tiempo a QA por pantalla,
porque la auditoría visual global la hace Claude Design sobre el conjunto.

**Siguiente fase: F10 (Chart unificado).**

---

## Sprint 5 · Gráficas

### F10 · Chart unificado

**Fecha:** 4 de agosto de 2026 · **Commits:** 8 · **7 paneles Recharts**

**Censo previo.** Antes de escribir nada, medir qué había realmente:

| | Valores distintos |
|---|---|
| Alturas | 160, 180, 200, 280, 300 y `height="100%"` — **6** |
| Márgenes | **6**, con `left` negativos (`-20`, `-28`) |
| Rejilla | horizontal (5 paneles), completa (1), ninguna (1) |
| Tamaño de tick | 9 px (5) y 10 px (1) |
| Tooltip | **4** tratamientos: constante compartida, dos `contentStyle` en línea distintos y dos componentes propios |

**`ui/chart.ts` no es una primitiva y no lo intenta.** Recharts se compone declarando sus propios
hijos, así que envolverlo obligaría a reimplementar su API entera y a mantenerla al día. Lo que se
comparte son las decisiones visuales —altura, rejilla, ejes, ticks, tooltip, márgenes y colores de
serie—, que se aplican con *spread* sobre los componentes de Recharts tal cual.

**Los `left` negativos eran un número mágico.** `-20` y `-28` compensaban a mano el ancho por
defecto del eje Y de Recharts (60 px). Fijar `width` en el `<YAxis>` hace lo mismo explícitamente y
permite que el margen sea idéntico en los siete paneles.

**Los ticks estaban por debajo del suelo tipográfico del DS.** F4 llevó a cero los textos por debajo
de 11 px en toda la app, pero no vio estos: son objetos JS, no clases de Tailwind, así que ni el
inventario, ni `tsc`, ni el build los detectan. Mismo punto ciego que la clase de Google Fonts que
fijaba los iconos a 24 px, encontrada en F7 — y encontrado igual, mirando el código real en vez del
contador.

Antes de subirlos se comprobó que no amontonan etiquetas en ningún panel: `BodyweightPanel`,
`QuestionnaireChartsPanel` y `NutritionPerformanceDashboard` delegan en `minTickGap` (56, 40 y 28),
que Recharts resuelve en píxeles descartando ticks; `CorrelationPanel` usa `preserveStartEnd`;
`LoadHistoryPanel` fuerza `interval={0}` pero su `tickFormatter` devuelve cadena vacía salvo en los
cambios de mes; y `MesocycleDashboard` etiqueta con `#1`, `#2`…

**Un defecto de fondo, no de forma.** `CorrelationPanel` sacaba los colores de una lista local de 8
entradas con **tres repetidas** (`warning`, `chart-3` y `data` aparecían dos veces). Al seleccionar
varias métricas, dos series distintas podían salir del mismo color — justo en el panel cuyo propósito
es compararlas. Los 5 tokens `--color-chart-*` que F1 declaró para esto llevaban desde entonces sin
un solo consumidor.

**Tres líneas de eje X invisibles.** `BodyweightPanel`, `NutritionPerformanceDashboard` y
`QuestionnaireChartsPanel` dibujaban `axisLine` en `var(--color-raised)` — el mismo color que la
rejilla, así que se leía como una línea de rejilla más pegada abajo. Se retira: los otros cuatro
paneles ya no la tenían.

**Dos hex literales menos** (25 → 23): el blanco del trazo de FC de `HrChart` y el del color de
texto del tooltip de `MesocycleDashboard`, que además llevaba un radio de 8 px fuera de la escala
de F3.

**Qué se dejó fuera, y por qué**

| Qué | Por qué |
|---|---|
| `METRIC_COLOR`, `GROUP_COLOR` (14 grupos musculares), `PHASE_COLORS`, `ZONE_COLOR` | Color asignado por **dominio**, no por posición en una lista. `GROUP_COLOR` además necesita 14 valores donde el DS define 5 |
| La altura de `HrChart` | Es una prop porque rellena el alto de su contenedor durante la sesión en directo: decisión de layout, no de escala |
| La ausencia de rejilla en `HrChart` | Sus bandas de zona de FC **son** la referencia; ponerle líneas encima cambiaría la gráfica en vez de unificarla |

**Verificado:** `tsc --noEmit`, 263 pruebas, `npm run build` y `ds:inventario` limpios tras cada uno
de los 8 commits. **Sin verificación visual:** seis de los siete paneles viven detrás del login de
coach, y el séptimo (`BodyweightPanel`) detrás del de atleta — misma limitación que F8 y F9.

**Siguiente fase: F11 recortada** (`Input`/`Select` para cerrar R8, y primitivas en `cardio/`,
`roadmap/` y CRM), la última antes de la auditoría visual con Claude Design.

---

## Sprint 6 · Formularios y módulos diferidos

### F11 (recortada) · `Input`/`Select` y primitivas en los tres módulos aplazados

**Fecha:** 4 de agosto de 2026 · **Commits:** 24 · **Última fase antes de Claude Design**

El alcance se recortó a propósito respecto a la F11 original: solo lo que es defecto de usabilidad
(R8) y lo que dejaba tres módulos visualmente desalineados. Lo cosmético —márgenes negativos,
monoespaciadas ambiguas, el patrón píldora rectangular, partir archivos— se deja para el rediseño,
porque hacerlo ahora es trabajo que el rediseño tiraría.

#### Paso 0 — R8 no era medible

Cuarta fase seguida (F6, F7, F9, F11) que empieza arreglando el instrumento. R8 llevaba abierto
desde F4 sin contador: la auditoría dijo 5 campos, F2 encontró 238, y desde entonces nadie podía
comprobar si subían o bajaban. Sin métrica, F11 habría sido la única fase verificable solo a ojo —
y en pantallas que están detrás del login de coach.

La métrica lee el `className` de la propia etiqueta de apertura de cada `<input>`, `<select>` y
`<textarea>`, no el heredado. Da **227**, el mismo número que un conteo independiente escrito con
otro método y otro lenguaje.

#### 11a · R8 cerrado: 227 → 0

Cuatro tandas: 57 en entrenamiento, 32 en nutrición, 99 en el resto de `components`, 39 en
`roadmap`/`cardio`/CRM.

**El CRM era R8 en bloque y no salía en ninguna cuenta.** Sus ~40 campos comparten la constante
`inputClass`, que fijaba `text-caption` (11 px); la métrica mide la clase escrita en la etiqueta y
ahí llegaba por variable. Un solo cambio los arregló todos, y explica por qué el total real era
mayor que los 227 medidos.

**Decisión de Dani, consultada con los números delante.** `Input` solo encajaba limpiamente en 50 de
los 227: excluye `type="number"` por diseño (F7), y su envoltorio `Campo` pone siempre una etiqueta
encima, lo que en una celda de tabla o un buscador es rehacer el layout. Se acordó **adoptar donde
encaja y subir el resto a 16 px en su sitio**, que es lo que cierra R8 sin reestructurar nada. Los
`type="number"` se quedan como están y conservan `min`/`max`/`step`.

**La adopción de la primitiva cubrió menos de lo estimado, y el desglose es el hallazgo:**

| Motivo | Cuántos |
|---|--:|
| `<textarea>` — la primitiva no tiene esa variante | 12 |
| Rejilla apretada o edición en línea: 44 px de alto rompen la fila | 9 |
| Campo en línea con botón al lado, etiqueta fuera de la fila | 5 |
| Deliberado: nombre de rutina como título editable (19 px, negrita) | 1 |
| **Falsos positivos**: `<label>` que *envuelve* su checkbox — asociación implícita, ya correcta | 9 |

**Consecuencia visual asumida:** los campos crecen. Se nota sobre todo en la tabla de registro de
series del atleta y en las filas de ejercicio de las plantillas, cuyos campos son estrechos
(`w-10`, `w-14`) y ahora llevan letra de 16 px.

**Arreglos que llegaron con la adopción**, sin ser objetivo: el error de nombre duplicado de las
plantillas deja de ser un `<p>` suelto y pasa a `aria-describedby` + `aria-invalid`; el campo de
correo del acceso gana `autoComplete="email"`, que no tenía; el buscador de ingredientes de recetas
cambia una lupa posicionada a mano (absolute + `pl-10` calculado) por la prop `icon`.

#### 11b · Primitivas en `cardio/`, `roadmap/` y `features/crm`

**`Icon`: 63 → 0.** Como en F8, esto no es cosmético: `.material-symbols-outlined` trae
`font-size: 24px` y llega sin capa CSS, así que los tokens de tamaño que esos iconos ya llevaban
escritos no hacían nada y todos se pintaban a 24 px. Al adoptar `Icon` los tamaños se aplican de
verdad y varios iconos se ven más pequeños — es la corrección, no una regresión.

**El CRM deja de reimplementar lo que el DS ya resuelve.** Mismo patrón que `Modal.tsx` en F9: la
API en español no cambia y ningún uso se toca.

| Componente del CRM | Envuelve | Qué gana |
|---|---|---|
| `EmptyState` | `EmptyState` del DS | Su CTA deja de ser un `<button>` a mano |
| `BotonPrimario` / `BotonSecundario` | `Button` | `focus-visible` y 44 px de alto en 36 usos |
| `StatusPill` | `Badge` | Sus 4 tonos ya existían en la primitiva con otro nombre |

#### Dos lecciones sobre el instrumento

**`htmlFor` no puede crecer, y su objetivo estaba mal planteado.** El literal vive dentro de `Campo`,
así que la métrica se queda en 1 por muchos formularios que se migren — mismo mecanismo que
`aria-label` en F9. El objetivo `≥ 116` que el panel tenía escrito significaba *116 literales
repetidos*: el correcto es 1, centralizado, y ya está cumplido. Se corrigió el panel.

**Los comentarios envenenan los contadores, cuatro veces ya.** Dos en F9 (la métrica de overlays
contando prosa que describía el patrón, y luego los propios comentarios que documentaban los
overlays no migrados), una en F10 (un hex citado en un comentario) y una aquí: escribir «es un
`<textarea>`» dejó la métrica en 1 con la deuda a 0. Esta vez se arregló **el instrumento**: la
métrica exige un espacio detrás del nombre de etiqueta, porque un control real siempre lleva
atributos y en prosa la etiqueta se escribe cerrada.

**Verificado:** `tsc --noEmit`, 263 pruebas, `npm run build` y `ds:inventario` limpios tras cada uno
de los 24 commits. **Sin verificación visual**, igual que F8, F9 y F10: las pantallas viven detrás
del login de coach.

**Con F11 termina la migración previa al rediseño. Lo siguiente es Claude Design.**

---

## Deuda heredada al integrar `feat/cuestionarios` (8 ago 2026)

La rama de cuestionarios se escribió **antes** del re-skin de F3.3 y se integró 286 commits
después (merge `6125521`). Sus ficheros nuevos y los que reescribió traen estilo pre-re-skin. Al
resolver los conflictos se conservó el estilo de HEAD en todo lo que colisionaba, y se reescribieron
con primitivas los controles que se pudo (`Button`, `SegmentedControl`, `Badge`, `EmptyState`), pero
queda deuda dentro de esos ficheros que nadie tocó porque no entró en conflicto.

Lo que sí se corrigió, porque no es cosmético: **4 campos de formulario por debajo de 16 px** en
`ClientReviewsPanel` y `ScheduleFields`. Por debajo de ese suelo iOS Safari hace zoom al enfocar y no
lo revierte. Esa métrica vuelve a 0.

Lo que queda, por fichero:

| Fichero | Hex literales | Texto < 11 px | Otros |
|---|---|---|---|
| `BodyMeasurementsPanel.tsx` (nuevo) | 20 | 2 | `border-white/>12`, 3 `font-mono` |
| `ClientReviewsPanel.tsx` | 22 | 5 | `border-white/>12`, 5 `font-mono` |
| `ScheduleFields.tsx` | 4 | — | — |
| `QuestionnaireEditor.tsx` | 3 | 3 | 3 `font-mono` |
| `ReportView.tsx` | 2 | 1 | — |
| `ProfileScreen.tsx` | 2 | — | — |

**Por qué no se migra en el merge.** No es una sustitución mecánica: `#fbcb1a` es el oro ANTERIOR y
el token `accent` vale `#FFC72C`. Cambiar los hex por tokens **altera el color renderizado** en seis
pantallas del coach — que es justamente lo que pretendía el re-skin, pero es una decisión de diseño
con revisión visual detrás, no algo que deba colarse dentro de un commit de integración.

La línea base se actualiza para que `ds:inventario` vuelva a detectar regresiones NUEVAS. Esta tabla
es el registro de lo que se acepta a sabiendas; es el siguiente trozo de migración, no deuda
olvidada.

### Y una quinta vez: centralizar baja el contador

`prefers-reduced-motion` bajó de 4 a 3 al hacer que `MachineCard` use el hook
`ui/internal/useReducedMotion` en vez de su propia llamada a `matchMedia`. El comportamiento
**mejora** —el hook reacciona si la preferencia cambia durante la sesión, la versión inline era de
un solo disparo al montar— pero el literal deja de estar en el componente y la métrica solo cuenta
apariciones del string.

Es el mismo mecanismo ya documentado en `htmlFor` (F11) y `aria-label` (F9): cuando la deuda se
resuelve *metiéndola en una primitiva*, el contador de "usos" cae. Para estas tres métricas el
número alto significa "repetido en muchos sitios", no "bien hecho en muchos sitios". Se acepta la
bajada.

### Sexta vez: Biblioteca centraliza las cabeceras del coach

`4b9eff2` agrupa los catálogos del coach bajo `CoachLibraryScreen`, así que
`NutritionCoachScreen` y `TrainingCoachScreen` dejan de poner su propia cabecera: sus contadores
caen a 0 y `App.tsx` sube. Neto −8 tokens y −3 `font-sans`, con el código mejor que antes.

Ya es la sexta vez que estos contadores bajan por hacer lo correcto (ver `htmlFor`, `aria-label`,
`prefers-reduced-motion`). Para las métricas de "usos" el número alto significa **repetido en muchos
sitios**, no bien hecho en muchos sitios. Se acepta la bajada.
