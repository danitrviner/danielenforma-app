# Revisión del modo claro y de las animaciones · 2026-10-27

Fase 1: informe y maquetas. **No se ha tocado la app** salvo un banco de pruebas temporal
(`/dev/clientes`) para poder ver la lista de clientes sin sesión de coach, retirado al cerrar
la fase 2 por decisión de Dani (las capturas de Clientes de este informe salen de él). Rama `modo-claro-3` (worktree `/Users/dani/en-forma-modo-claro-3`), sobre
`origin/main` 3120665.

Las maquetas están en `docs/revision-modo-claro-2026-10-27/` (hojas `sel-*` = variantes de
seleccionado, `sup-*` = propuesta de superficies, `antes-*` = claro frente a oscuro tal cual hoy).

---

## 0. Resumen: qué falla de verdad

Los cuatro síntomas que describe Dani tienen tres causas, y ninguna es «un color mal elegido»:

1. **No hay UNA receta de «seleccionado»: hay cuarenta.** `grep` cuenta 40 combinaciones distintas
   de `bg-accent/N + border-accent/M + text-…` en ternarios `activo ? … : …`, más las primitivas
   `Chip`, `Tabs`, `SegmentedControl` y los `aria-pressed` sueltos (77). En oscuro todas convergen
   visualmente (oro sobre negro siempre se lee como oro); en claro cada tinte del 5 al 16 % sobre
   blanco da un beige distinto, y el texto `accent-ink` (#875C05) encima lo convierte en «mostaza
   apagada». El amarillo que no gusta es `accent-bg`/`bg-accent/15` + `text-accent-ink` sobre papel.
   Arreglo: una sola receta en el token y en las primitivas, y las 40 copias migran a ella.

2. **La escalera de superficies de claro no tiene escalones.** `raised` (#FAF9F6) contra `surface`
   (#FFF) da 1,05:1: no existe. `field` = `surface` = blanco: un campo dentro de una tarjeta blanca
   es invisible salvo por un borde `hairline` al 12 % que mide **1,27:1**. La página (`bg` #F8F6F2)
   contra la tarjeta blanca da 1,08:1. Resultado: todo es «blanco o casi» y nada dice «esto se toca».
   Lo que en oscuro resuelve el cambio de superficie (+6 puntos de gris por escalón) en claro no se
   ve, y no se compensó con línea ni sombra.

3. **Nutrición usa papeles tipográficos propios.** La ficha del alimento pinta la tabla de
   información nutricional a `text-body` (16 px) cuando toda tabla de la app va a `body-s` (14);
   la hoja de añadir pone nombre a 16/700 **y** el dato secundario («100 kcal · 100 g») también a
   16; las filas del día llevan nombre a 16/700 + gramos en `accent-ink`. En oscuro la tinta clara
   sobre negro «adelgaza» ópticamente y pasa; en claro la tinta oscura engorda y se percibe «letra
   más grande con poco contraste» (que es exactamente lo contrario: hay 15:1 de contraste y
   demasiado peso).

(Corrección: en una primera lectura anoté que `tema.ts` e `index.html` tenían fondos distintos;
era una rama vieja. En `main` coinciden. Se quedan sincronizados al cambiar el fondo.)

---

## 1. Método

- 20 rutas × 2 temas × 2 tamaños (375×812 y 1280×800) con Chromium sin interfaz (Playwright,
  `deviceScaleFactor` 2). Tema forzado con `localStorage['enforma_tema_v1']` antes del primer
  pintado, como hace `index.html`.
- Más 12 estados interactivos (hoja de añadir, ficha del alimento con y sin tabla, opciones de
  comida, día con comida registrada, Sheet y Dialog del showcase, pestañas del calendario…).
- Contraste medido en el navegador: script que recorre todo nodo de texto visible, toma su color,
  sube por los padres mezclando alfas (incluido `color-mix` en `oklab`, que es lo que emite
  Tailwind v4 para `bg-accent/15`) hasta un fondo opaco, y calcula el ratio WCAG. Umbrales: 4,5:1
  texto normal; 3:1 texto grande (≥ 24 px o ≥ 18,66 px negrita), iconos y bordes de controles.
  Excluidos del cómputo: controles deshabilitados (la norma los exime) y la pastilla del
  `SegmentedControl` en oscuro (el script la mide contra el fondo del grupo porque la pastilla es
  un hermano absoluto: falso positivo, confirmado a ojo).
- Total: 3.900 textos y 420 bordes medidos.

---

## 2. Contraste · lo que falla, con ratio

### 2.1 Texto e iconos (claro)

| Pantalla | Elemento | Medido | Mínimo | Causa | Arreglo |
|---|---|---|---|---|---|
| Calendario (año) | Etiquetas de mes `MAR`, `ABR`… sobre bloque de fase | 4,33–4,39 | 4,5 | `text-caption opacity-60` apilada sobre `ink` (`NivelAno.tsx`) | Quitar `opacity-60`; usar `text-ink-3` (7,2:1) |
| Nutrición (banner «¿No te apetece algo?») | Icono `close` | 2,43 | 3 | `text-accent-ink` con opacidad apilada (`NutritionScreen.tsx` ~2116) | Sin opacidad; `text-accent-ink` da 5,2 sobre el tinte |
| Revisión (atleta) | Icono `check` del paso hecho sobre relleno `success` | 2,68 | 3 | `text-on-accent` (tinta oscura) sobre verde `#0B6B47` (`CheckInScreen.tsx`) | **`text-on-fill`** (blanco): 6,55:1. Es la regla de la paleta, incumplida |
| Revisión (atleta) | Contador «2» en `bg-warning/20` | 4,16 | 4,5 | tinte al 20 % ensucia el fondo | `bg-warning/12` → 5,9:1 |
| Revisión (atleta) | Icono `close` de banner | 2,52 | 3 | igual que Nutrición | igual |
| Plantilla de mesociclo | Badge `MRV` sobre `danger/50` | 4,42 | 4,5 | tinte al 50 % | `danger/12` + `text-danger` |
| Orden del ciclo | Chevrones de mover (deshabilitados) | 1,6 | — | exento (disabled) | Nada; ver §7 para que se vea que están apagados |
| Cardio en vivo (modo demo) | Botones `bg-veil/70` del harness | — | — | cromo del banco de pruebas, no de la app | Nada |

Todo lo demás pasa. `ink` a `ink-4` sobre blanco, `bg` e `inset` están entre 5,0 y 15,9:1; los
macros sobre su tinte entre 5,2 y 6,0; `accent-ink` sobre `accent-bg` 5,16; los estados de
`success/danger/warning/info` sobre papel entre 4,6 y 7,3. La paleta de texto del claro está bien
calibrada: **el problema del claro no es de texto, es de superficies y bordes.**

### 2.2 Bordes de control (los dos temas)

| Par | Ratio | Dónde (pantallas) | Qué es |
|---|---|---|---|
| `hairline` sobre `surface` (claro) | **1,28** | 9 | Inputs, selects, chips sin seleccionar, botón «+ Añadir comida», filas de progresión |
| `hairline` sobre `bg` (claro) | **1,27** | 8 | Inputs sobre página, tarjetas pulsables, botón «Mi gimnasio», «Peso» del calendario |
| `accent-line` (oro al 55 %) sobre blanco/bg (claro) | **2,06–2,13** | 9 | Borde del botón **secundario** (`Button variant="secondary"`): «Continuar», «Editar», «Ver detalle», «Aceptar cambios» |
| `accent` sólido sobre blanco (claro) | 2,65–2,86 | 2 | Chip «Push» seleccionado, fila de progresión activa |
| Bloques de fase del calendario (claro) | 1,33–1,44 | 1 | Bordes del tinte de fase sobre blanco |
| `hairline` sobre `surface`/`bg` (oscuro) | 1,19–1,21 | 16 | Lo mismo en oscuro |
| `accent-line` (oro al 45 %) (oscuro) | 2,83 | 9 | Botón secundario en oscuro |

Conclusión: **ningún control de la app pasa 3:1 por su borde, en ningún tema.** En oscuro no se
nota porque `field` (#1A1A1A) sobre `bg` (#121212) y el relleno de la fila hacen el trabajo. En
claro no hay relleno que lo haga. Es el origen de «unas partes que se pueden tocar son blancas y
otras no».

### 2.3 Oscuro: lo que sí falla en texto

| Pantalla | Elemento | Medido | Causa |
|---|---|---|---|
| Cardio en vivo › gráfica | Etiquetas `Z1`, `Z5` a 11 px | 4,06–4,17 | `text-[11px]` + `dark:opacity-*` apilado (`PageGrafica.tsx` 125–202) |
| Cardio en vivo › gráfica | Tiempo `0:15` en `ink-3` | 3,56 | `ink-3` + opacidad apilada |
| Plantilla | Badge `MRV` | 3,68 | `danger/50` |
| Showcase, Legal | Botón primario deshabilitado | 2,72 | exento |

---

## 3. Superficies · la regla propuesta

### 3.1 La regla (claro)

> **La página es crema. Lo que contiene es blanco. Lo que se toca, dentro de un contenedor blanco, vuelve a ser crema. Lo hundido es un escalón más oscuro. Nada es «casi blanco».**

| Papel | Token | Claro hoy | Claro propuesto | Para qué |
|---|---|---|---|---|
| Página | `bg` | #F8F6F2 | **#F3F0EA** | Fondo de pantalla. Baja un punto para que el blanco de la tarjeta se lea como tarjeta (1,14:1 en vez de 1,08) |
| Contenedor | `surface` | #FFFFFF | #FFFFFF | Tarjeta, hoja, diálogo, barra de navegación, fila de lista que vive sobre la página |
| Control dentro de contenedor | `raised` | #FAF9F6 | **= bg (#F3F0EA)** | Chip sin seleccionar, botón de icono, hover de botón fantasma, segmentado (su pista), toast. Hoy es invisible (1,05:1); pasa a ser el mismo crema de la página, que ya se lee como «un escalón» |
| Campo | `field` | #FFFFFF | **= bg (#F3F0EA)** | Input, select, textarea, buscador. Un campo deja de depender de un borde al 12 % para existir: va relleno |
| Hundido | `inset` | #EBE8E1 | **#E7E3DB** | Pista del segmentado, botón «menos» del stepper, miniatura, fondo de deshabilitado. Un punto más abajo que el nuevo `bg` para que siga habiendo escalón (1,125:1) |
| Pista | `track` | #DFDBD2 | #DBD6CC | Barra de progreso vacía |
| Línea | `hairline` | 12 % | **14 %** | Separador entre filas y borde de tarjeta blanca sobre crema |
| Línea fuerte | `strong` | 18 % | **30 %** | Borde de control en reposo (chip, botón secundario neutro) y hover. Hoy casi igual a hairline |
| Nueva: línea de campo | `control-line` | — | **48 % (#92918F)** | Borde de input/select/textarea: 3,16:1 sobre blanco. Es el único alfa que roza el 3:1 sin parecer un marco negro. Si se prefiere más suave, 40 % (#A4A3A2, 2,5:1) y que el relleno crema haga el resto |

Texto sobre las nuevas superficies: `ink-4` sobre el nuevo `bg` da 5,34; `accent-ink` 5,18.
Nada cae por debajo. Oscuro: **no cambia ningún valor** (la escalera de oscuro ya tiene escalón;
solo `control-line` se declara también allí, = `strong`, para que el token exista en las dos
pieles como exige el archivo).

### 3.2 Cómo se ve que algo se toca

Tres señales, y una basta:

1. **Relleno un escalón distinto del padre** (crema dentro de blanco, blanco dentro de crema).
2. **Borde `strong` o `control-line`**, nunca `hairline` (hairline es separador, no contorno).
3. **Oro** solo en lo seleccionado y en la acción siguiente (como ya dice la paleta).

Lo que informa y no se toca (`Badge`, banner, etiqueta mono) **no** lleva borde de control ni
escalón de relleno: va plano sobre su padre o con su tinte de estado.

### 3.3 Incumplimientos (dónde la regla no se cumple hoy)

| Sitio | Qué pasa | Qué toca |
|---|---|---|
| `ui/Input.tsx`, `ui/Select.tsx`, `ui/SearchField.tsx` | `bg-field` blanco + `border-hairline`: 1,28:1 | `bg-field` (nuevo crema) + `border-control-line` |
| `ui/Chip.tsx` sin seleccionar | `bg-raised border-hairline` sobre tarjeta blanca: no se ve | `bg-raised` (nuevo = crema) + `border-strong` |
| `ui/Button.tsx` `secondary` | borde `accent-line` 2,1:1 | borde `accent-press` (#A87510, 4,0:1 sobre blanco) en claro; en oscuro `accent/60` (4,0:1). Relleno transparente se mantiene |
| `ui/Button.tsx` `ghost` | sin contorno ni relleno; en claro un texto suelto | hover/active `bg-raised` ya existe; en reposo nada que cambiar, pero **sin** `hairline` |
| `ui/SegmentedControl.tsx` | pista `bg-surface` (blanca) sobre tarjeta blanca | pista `bg-inset`, pastilla según la opción elegida en §4 |
| `ui/ListRow.tsx` pulsable | solo hover `bg-raised` (invisible) | hover `bg-raised` nuevo + `active:` |
| `NutritionScreen.tsx` 2259 | botón «+» de comida: `bg-raised` redondo dentro de tarjeta blanca | queda bien con el nuevo `raised` |
| `NutritionScreen.tsx` hoja de añadir (`AnadirAlimentoCalorias.tsx` 112-135) | filas `bg-raised` sin borde flotando sobre fondo de hoja: parecen deshabilitadas | fila = `bg-surface` + `border-hairline` (es contenedor) o lista con separadores |
| `useToast.tsx` | toast `bg-inset` gris, sin sombra, en claro parece un control apagado | `bg-surface` + `shadow-e2` + `border-hairline` (es un overlay: elevación e2) |
| `CheckInScreen.tsx` pasos | círculos 3 y 4 en `bg-raised` invisibles; «+ Añadir» en `bg-inset` parece deshabilitado | raised nuevo; «Añadir» → `Button variant="secondary" size="s"` |
| `mesociclo/OrdenCiclo*` | filas «Descanso» en `bg-inset` + filas de sesión en `bg-accent/5` con `border-accent-line` | sesión = `bg-surface border-hairline` (contenedor); descanso = `bg-raised` (hundido pero no apagado); el oro no es «tipo de día» |
| `roadmap/calendario/NivelAno.tsx` 137 | bordes de bloque de fase al 35 % del tinte: 1,3–1,4:1 | borde `color-mix(fase 60 %)` o sin borde y relleno al 14 % |
| `features/gimnasio/MiGimnasioPanel`, `CatalogoSwipe` | botón «Mi gimnasio» `border-hairline` | `Button secondary` |
| `ClientsScreen.tsx` 440-470 | «Invitar atleta»: borde `accent/35` (1,4:1) | `Button secondary size="s"` |

---

## 4. Estado seleccionado · tres opciones

Hoy: tinte de oro (`accent-bg` 14 % o `bg-accent/8…16`) + borde `accent-line` + texto `accent-ink`.
Sobre papel: beige con mostaza. Además convive con el **oro sólido** que ya usan 60+ sitios
(`bg-accent text-on-accent`: la pastilla del segmentado, «Todo», «TODAS · 11» de Clientes, los
días del calendario…), así que ya hay dos lenguajes de «elegido» en la misma pantalla
(Revisión del atleta: «Todo» sólido junto a «SIGUE AQUÍ» tintado).

Maquetas sobre pantallas reales (claro), en `docs/revision-modo-claro-2026-10-27/sel-*.png`:
Nutrición (día, hoja de añadir, ficha, día con comida), Revisión del atleta, Orden del ciclo,
Clientes (móvil y escritorio), Revisión del coach, Calendario, Chips del showcase.

| | A · Tinta | B · Oro sólido con borde | C · Blanco + borde oro + `accent-ink` |
|---|---|---|---|
| Receta | `bg-ink text-bg` (#1B1916 / #F8F6F2) | `bg-accent text-on-accent border-accent-press` | `bg-surface text-accent-ink border-accent` (1,5 px) |
| Contraste texto | 16,3:1 | 6,1:1 | 5,9:1 |
| Borde del control | — (relleno) | 4,0:1 | 2,9:1 (oro sobre blanco), compensado por relleno blanco sobre crema |
| Qué dice | «esto está elegido», sin color | «esto está elegido y es lo siguiente» | «esto está elegido, pero quieto» |
| Coherencia con oscuro | Oscuro seguiría en oro (no hay tinta blanca sobre negro que no sea `ink`); el claro y el oscuro usarían recetas DISTINTAS para lo mismo | **La misma receta en los dos temas** (en oscuro ya es así) | Oscuro seguiría con tinte: dos recetas |
| Riesgo | Compite con el botón primario como «lo más oscuro de la pantalla»; el día «hoy» en negro parece un error | «Máximo un elemento amarillo relleno por pantalla» se rompe en listas de chips (7 días, 5 filtros) | El más suave: en pantallas densas (Calendario, Progresión) se pierde entre los bordes |

**Recomendación: B, con dos matices.**
1. Chips de FILTRO (varios a la vez: categorías, días de la semana) en B; chips de VALOR ÚNICO
   (segmentado, pestaña) en B con la pastilla deslizante que ya existe. Pestañas de navegación
   (`Tabs`) siguen con su línea de oro: no son chips.
2. El relleno `accent-bg` se queda **solo** para lo que informa (banner, badge «SIGUE AQUÍ», fondo
   de icono) y deja de usarse para «elegido». Así el beige significa una cosa.

Si Dani prefiere que lo elegido no grite, C es la segunda opción y la que mejor casa con las
superficies de §3 (el blanco levanta sobre el crema). A queda descartada por lo de los dos temas.

---

## 5. Tipografía

### 5.1 Nutrición (lo que Dani señala)

| Dónde | Papel | Hoy | Debe ser | Archivo:línea |
|---|---|---|---|---|
| Ficha del alimento › tabla «Información nutricional» | fila dato/valor | `text-body` 16 | `text-body-s` 14, valor en `font-mono` | `nutrition/calorias/FichaAlimentoCalorias.tsx:181` |
| Ficha › «Ración», «Nº de raciones», «Comida» | etiqueta de campo | `text-body` 16 | `text-body-s` 14 + `font-medium` (`Input` usa caption mono para etiqueta; aquí son etiquetas de fila, 14 es el papel de ListRow subtitle) | `FichaAlimentoCalorias.tsx:200,237,251,263` |
| Ficha › chips de ración | valor | `text-body` 16 + bold al elegir | `text-body-s` 14 `font-semibold` siempre; el peso no debe cambiar con la selección (salta la maquetación) | `FichaAlimentoCalorias.tsx:221,230` |
| Ficha › nombre | título de hoja | `text-title-m` 19/700 | ok, es el título | `:128` |
| Hoja de añadir › nombre de alimento | nombre en lista | `text-body` 16/700 | `text-title-s` 16/**600** (igual que `ListRow` title) | `AnadirAlimentoCalorias.tsx:115` |
| Hoja de añadir › «100 kcal · 100 g» | dato secundario | `text-body-s` 14 `ink-2` | ok, pero en `font-mono` como los demás datos numéricos de la app | `:119` |
| Hoja de añadir › pestañas | pestaña | `text-[14px]` suelto | `text-body-s` | `:93` |
| Diario › nombre de comida («Desayuno») | título de tarjeta | `text-title-s` 16/700 | ok | `NutritionScreen.tsx:2271` |
| Diario › fila de alimento registrado | nombre | `text-body` 16/700 + gramos `accent-ink` | `text-body` 16/**500**, gramos en `font-mono text-body-s text-ink-2`; el oro es acción, no dato | `NutritionScreen.tsx:2380-2400` |
| Diario › kcal de la comida («0 kcal») | cifra + unidad | `text-body-s` bold + `caption` mono | ok | `:2279` |
| Diario › «ENCAJAN» + chip de receta | etiqueta + chip | ok (`caption` mono) | chip con `border-strong` (§3) | `:2310,2317` |
| Diario › anillo «2334 quedan» | cifra protagonista | mono 32 (`text-display`) | ok | — |
| Selector de día (L M X…) | letra + número | `text-label` mono | ok | `SemanaNutricionAtleta.tsx` |

Regla que sale de aquí, para todas las pantallas: **nombre de ítem en lista = 16/600; dato
secundario = 14 mono `ink-2`; fila de tabla = 14; etiqueta de campo = 14/500; cifra protagonista =
display/feature mono.** Y en claro no hay que bajar tamaños: hay que bajar **peso** (700 → 600 en
nombres de lista; 600 → 500 en filas). `Plus Jakarta` 700 a 16 px sobre blanco pesa como 800.

### 5.2 Tamaños fuera de la escala (archivo:línea)

63 apariciones de `text-[Npx]` en 17 archivos y 21 de `text-base/xs/3xl`. Las que importan
(texto que se lee, no un ajuste de SVG):

- `roadmap/calendario/NivelSemana.tsx` 166–252: once tamaños entre 10,5 y 11,5 px → `text-caption`
  (12) y `text-label` (13). Con 11 px y mono ya están por debajo del suelo del DS.
- `roadmap/calendario/NivelMes.tsx` 86, 172, 305, 352 y `SheetDia.tsx` 260, 289, 322 y
  `ModalPlantillaCuestionarios.tsx` 112–143: `text-[12.5px]`/`[13.5px]` → `caption`/`label`/`body-s`.
- `cardio/live/pages/PageGrafica.tsx` 125–202: `[11px]`, `[13px]`, `[13.5px]`, `[15px]`,
  `[12.5px]` → `caption`/`label`/`body-s`. Es también donde fallan `Z1`/`Z5` en oscuro.
- `mesociclo/BarraDeSemanas.tsx` 179–189 y `PlanificadorProgresion.tsx` 220–225: `[9px]`/`[10px]`.
  9 px no se lee en ningún tema; → `caption` con `tracking-tight` si no cabe, o abreviar.
- `QuestionnaireEditor.tsx` 376–404, `ExerciseConfigEditor.tsx` 569: `[9px]` → `caption`.
- `CheckInScreen.tsx` 368, 478, 529: `text-[18px]` → `text-title-m` (19) o `title-s` (16).
- `RecetarioDescubrir.tsx` 206, 212, 224: `[32px]`, `[40px]`, `[56px]` → `display` (32),
  `headline` (38), `hero` (46); 465: `[18px]` → `title-m`.
- `AnadirAlimentoCalorias.tsx` 93: `[14px]` → `body-s`.
- `text-base` (14 usos: `EditorDeListaDeMenu`, `EditorDePaquete`, `MyMenuScreen`,
  `RecetasDelAtletaPanel`, `ReglasDeRecetasPanel`, `ReportView`, `NutritionScreen:2975`,
  `QuestionnaireChartsPanel`) → `text-body`; `text-xs` (6: `ReportView` 253–254, `ScheduleFields`
  116–137) → `caption`; `text-3xl` (`ClientBodyPanel.tsx:131`) → `display`.
- `App.tsx:1087` `text-[10px]`, `ReportView.tsx:257` `[10px]`, `SemanasNutricionCoach.tsx` 218–219
  `[10px]`/`[9px]`, `CeldaDia.tsx:28` `[11.5px]`, `NivelAno.tsx:143` `[9px]`: → `caption`.

### 5.3 Pesos que engordan en claro

`font-extrabold`/`font-black` (800/900) en 37 sitios. Correctos en `Wordmark`, `PageHeader`
(display Archivo 900), `ReportView` portada, `RecetarioDescubrir` hero. Dudosos en `Tabs.tsx`
(pestaña activa a 800: en claro salta respecto a la inactiva en 400 y mueve el ancho; → 600 y
color), `CardioToday` (4), `ClientFichaPanel` (3), `MesocycleManager` (3), `CorrelationPanel`,
`HomeScreen` (2): son cifras de dato, → `font-bold` 700 en mono.

---

## 6. Sombras y líneas (claro)

La paleta lo dice y no se aplica: «en claro la sombra SÍ trabaja». Hoy `shadow-e1`/`e2` solo se usan
en Sheet/Dialog. Falta en:

- **Barra de navegación inferior y cabecera** (`App.tsx`): solo `border-hairline`; en claro la barra
  se funde con la página al hacer scroll. → `shadow-e1` + `border-t hairline`.
- **Toast** (`useToast.tsx`): `bg-inset` sin sombra. → `bg-surface shadow-e2 border-hairline`.
- **Mini-reproductor de cardio** (`CardioMiniPlayer`): borde 1,27:1 sobre página. → `shadow-e1`.
- **Barras sticky** de Mesociclo/Progresión/Calendario: → `shadow-e1` cuando están pegadas
  (ya existe el patrón `CollapsingHeader`).
- **Tarjeta sobre tarjeta** (`revision-coach` tiles «SESIONES/TONELAJE…», Ficha del cliente): hoy
  `bg-raised` invisible dentro de `surface`. Con el nuevo `raised` (crema) se resuelve sin sombra.
- `FAB` y popovers/menús: `e1`/`e2` según la tabla de elevación. Hoy `CommandPalette` y
  `NotificationBell` dropdown van sin sombra.

Líneas: `hairline` sube a 14 %. Separador entre filas de lista: queda en `hairline`. Borde de
tarjeta blanca sobre crema: `hairline` basta con el nuevo `bg` (1,14 de relleno + línea).

---

## 7. Restos sin tema

Muy pocos: el re-skin del 16-09 limpió casi todo.

| Archivo:línea | Qué | Arreglo |
|---|---|---|
| `nutrition/ScannerSheet.tsx:85,93` | `bg-black`, `text-white/80` en el visor de la cámara | Correcto a propósito (el vídeo es negro); cambiar a `bg-veil`/`text-on-veil` para que lo diga el token |
| `RecetarioDescubrir.tsx:181-182` | `#F8F6F2` literal en un degradado | `var(--color-bg)`; con el nuevo `bg` quedaría desfasado |
| `RoadmapTimeline.tsx:56` | `#C68F14` literal | `var(--color-accent)` |
| `BodyMeasurementsPanel.tsx:24` | `#1e1e1e #c6c9ab #fbcb1a` (colores de gráfica) | `--color-chart-*` |
| `academy/PortadaCurso.tsx:39-44` | 12 hex de portadas de curso | decisión: son ilustración (portadas), se quedan; documentarlo |
| Deshabilitados (`Button`, chevrones de Orden del ciclo) | `opacity-30/40` sobre el control entero | Está bien (exento), pero en claro un botón primario deshabilitado queda beige-gris casi igual que `inset`; → `bg-inset text-ink-5` sin opacidad, que es lo que hace el patrón de «Guardando» |

---

## 8. Animaciones · inventario y propuesta

Sistema: 8 duraciones nombradas, 1 curva (`--ease-brand`), 8 `--animate-*`, `stagger-child`
(40 ms), `useReducedMotion` para lo que va por JS, y `prefers-reduced-motion` global en CSS.
El sistema está bien hecho; **el problema es que casi nadie lo usa**: `animate-fade-up` en 11
sitios, `stagger-child` en 10 (6 en `Skeleton`), y 181 `transition-all` sueltos (19 en
`MesocycleManager`, 12 `CoachesScreen`, 11 `OnboardingForm`, 11 `NutritionScreen`).

### 8.1 Primitivas (`ui/`)

| Primitiva | Hoy | Falta | Propuesta |
|---|---|---|---|
| `Sheet` | entrada `sheet-in` 380, salida 240 con curva suelta `cubic-bezier(0.4,0,1,1)`, arrastre, velo con fundido | la salida no usa la escala (240 ≠ `--duration-exit` 140; «las salidas más cortas que las entradas») | salida `--duration-exit`·1,5 = 210 ms con `ease-brand`; o declarar `--duration-exit-sheet: 220ms` |
| `Dialog` | entrada `sheet-in` | **sin salida**: desaparece de golpe; sin fundido del velo al cerrar | mismo mecanismo `saliendo` de `Sheet` (ya existe, extraer a `overlayHooks`) |
| Toast (`useToast`) | `toast-in` 340 | sin salida; sin apilado | salida fundido `--duration-exit`; `translateY(8px)` + opacity |
| `Tabs` | color y línea (`state` 200) | la línea no se desliza entre pestañas; el contenido cambia de golpe | indicador con `transform` medido del DOM (como la pastilla del segmentado), `--duration-slide`; contenido de la pestaña nueva con `fade-up` corto (`--duration-base`) sin stagger |
| `SegmentedControl` | pastilla deslizante `slide` 340 | nada | ok, es el modelo |
| `Collapsible` | solo gira el chevron; el contenido aparece/desaparece (`{open && …}`) | **altura sin animar** | `grid-template-rows: 0fr → 1fr` + opacity (`--duration-base`), el patrón de `FichaAlimentoCalorias` |
| `ListRow`, `ActionRow`, `Card` pulsable | hover `bg-raised` | sin respuesta al pulsar en táctil | `active:scale-[.985]` + `active:bg-raised` con `transition-[transform,background-color] duration-(--duration-base)` (como `Button`) |
| `Button` | `active:scale-[.97]`, spinner | ok | — |
| `Chip` | color (`state`) | sin respuesta al pulsar | `active:scale-[.96]` |
| `ProgressBar` | ancho `--duration-bar` | ok | — |
| `RingSeal` | rAF + `seal-pop` | ok | — |
| `Skeleton` | sweep + stagger | ok | — |
| `EmptyState` | nada | entrada | `fade-up` del icono + texto (uno, sin stagger) |
| `Stepper` | color | la cifra cambia de golpe | no animar la cifra (regla: números que se leen no se animan) ✔; el botón `active:scale` |
| `Badge`/`Banner` | nada | banner al aparecer/descartarse | `fade-up` al montar; al descartar `grid-rows 1fr→0fr` + opacity `--duration-exit` |
| `SwipeRow` | transform `slide` | ok | — |
| `Pager` | puntos `state` | ok | — |

### 8.2 Pantallas (inventario sobre lo que se ha podido ver)

| Pantalla | Entrada | Pestañas | Listas | Hojas | Pliegues | Pulsar | Cifras/anillos | Barras | Toast/vacío/carga | Propuesta |
|---|---|---|---|---|---|---|---|---|---|---|
| Nutrición · diario | ninguna | — | 4 `stagger-child` (comidas) ✔ | Sheet ✔ | — | «+» `active:scale-90` ✔; filas no | anillo kcal: **cambia de golpe** | macros: `transition-all` | toast sin salida; vacío «Nada apuntado» sin entrada | anillo con `transition: stroke-dashoffset --duration-ring` (como `RingSeal`); barras `--duration-bar`; cambiar de día: `fade-up` de la tarjeta «Hoy» con `--duration-base`; fila de alimento nueva `fade-up` |
| Nutrición · hoja de añadir | Sheet ✔ | pestañas: cambio seco | lista sin stagger | — | — | «+» `active:scale-90` ✔ | — | — | — | lista `stagger-child` (máx. 8 ítems, 40 ms); pestaña con `fade-up` corto |
| Nutrición · ficha | Sheet ✔ | — | — | — | tabla `grid-rows` ✔ (modelo) | chips `state` ✔ | donut: salta | — | — | donut con `stroke-dasharray` transicionado `--duration-ring` |
| Recetario «Descubrir» | ninguna | — | filas sin stagger | — | — | tarjetas sin `active` | — | — | — | `stagger-child` por fila (no por tarjeta: 40 ms × 30 tarjetas = 1,2 s) |
| Revisión (atleta) | ninguna | segmentado ✔ | pasos sin stagger | — | «Ver los 8 restantes»: seco | filas sin `active` | peso: gráfica Recharts con su animación propia (1,5 s, curva de Recharts) | — | `pulse-dot` ✔ | `fade-up` de la tarjeta de pasos; Recharts `animationDuration` = `--duration-bar` y `isAnimationActive={!reducedMotion}`; pliegue con `grid-rows` |
| Revisión (coach) | ninguna | segmentado ✔; «Desplegar todo» seco | — | — | secciones: seco | — | tiles: salto | — | — | tiles `fade-up` escalonado (4); secciones `grid-rows`; cambio de ventana (7/14/bloque) `fade-up` del contenido |
| Clientes | ninguna | filtros: seco | lista sin stagger | Sheet objetivos ✔ | «Todos los atletas»: seco | filas sin `active` | — | — | `animate-pulse` «Sincronizando» (Tailwind, no del sistema) | `stagger-child` en las dos listas (tope 8); pliegue `grid-rows`; `pulse-dot` en vez de `animate-pulse` |
| Asignados (revisiones) | ninguna | `Tabs` ✔ | sin stagger | — | — | — | — | — | — | igual que Clientes |
| Calendario (coach) | `fade-up 260ms cubic-bezier(0.2,0.8,0.2,1)` **fuera del sistema** (`NivelAno/Mes/Semana`) | Año/Mes/Semana/Día: cada nivel entra con ese fade | — | SheetDia ✔ | — | celdas `transition 160ms` suelto | — | adherencia: salto | — | sustituir por `animate-fade-up` con `--duration-base` (240) y `ease-brand`; celdas `--duration-state`; `useReducedMotion` ya está (3 usos) ✔ |
| Cardio en vivo | páginas con `Pager` ✔ | — | — | — | — | — | FC: no se anima ✔ (regla) | zonas `duration-700` suelto | — | zonas con `--duration-bar` (450) |
| Mini-reproductor | ninguna | — | — | — | — | — | — | — | — | entrada `toast-in` al aparecer; salida `--duration-exit` |
| Gimnasio (catálogo swipe) | — | — | — | — | — | `active:scale-95` ✔ | — | — | — | ok |
| Muro legal | `sheet-in` ✔ | pasos: seco | — | — | — | — | — | barra de pasos `--duration-bar` | — | cambio de paso con `fade-up` |
| Onboarding | ninguna | pasos: seco | — | — | — | `active:scale-95` ✔ | — | `transition-[width] --duration-bar` ✔ | — | cambio de paso `fade-up` (`--duration-base`) |
| Orden del ciclo | ninguna | segmentado ✔ | filas: al mover **saltan** | — | — | chevrones | — | — | — | reordenar con FLIP sobre `transform` (`--duration-slide`): es la única animación «cara» que merece la pena aquí |
| Plantilla / Progresión | `MesocycleManager` 1 `fade-up`; 19 `transition-all` | `Tabs` | — | — | semanas: seco | — | — | — | 10 `Skeleton` ✔ | `transition-all` → `transition-colors`; pliegues `grid-rows` |
| Bienvenida | ninguna | — | — | — | — | — | — | — | — | logo + tarjeta `fade-up` (una sola, 550 ms): es la única pantalla donde una entrada «de marca» tiene sentido |
| Home atleta / Entreno / Perfil / Mi menú / Recetas / Home coach / Hub (sin banco de pruebas) | ninguna (`grep`: 0 `fade-up`, 0 `stagger`) | `Tabs`/segmentado | sin stagger | — | — | 0–2 `active:scale` | — | — | `Skeleton` ✔ en 7 | mismo patrón: primera tarjeta `fade-up`, listas `stagger-child` (tope 8), pliegues `grid-rows`, `transition-all` → explícito |

### 8.3 Criterio

- **Una entrada por pantalla** (la tarjeta protagonista, `fade-up` 550) y **un stagger por lista**
  con tope de 8 elementos (del noveno en adelante `--i: 8`): más de 320 ms de espera ya se nota.
- **Cambio de pestaña/segmento**: contenido nuevo con `fade-up` a `--duration-base` (240), **sin**
  stagger y **sin** mover la altura.
- **Salidas**: siempre `--duration-exit` (140) salvo Sheet (210, porque recorre 26 px + escala).
- **Pliegues**: `grid-template-rows` 0fr/1fr + opacity, `--duration-base`. Nunca `height`.
- **Cifras que se leen mientras cambian** (cronómetro, reps, FC): no se animan. Anillos y barras de
  progreso sí (`--duration-ring`, `--duration-bar`).
- **Pulsar**: `active:scale` .97 (botón) / .985 (fila) / .96 (chip) sobre `transform`, 240 ms.
- `transition-all` → propiedad explícita (`colors`, `transform`, `[grid-template-rows,opacity]`).
  181 sitios; se hace con búsqueda-y-reemplazo por archivo y se revisa a ojo.
- Reducción de movimiento: el bloque global de `index.css` cubre todo lo CSS. Falta
  `useReducedMotion` en Recharts (`isAnimationActive`), en el FLIP de Orden del ciclo y en el rAF
  del anillo de Nutrición si se añade.
- Rendimiento: solo `transform`/`opacity`/`grid-template-rows`/`stroke-dashoffset`. Nada de
  `height`, `top/left` (`TourOverlay.tsx:111` anima `top/left/width/height` 300 ms: → `transform` +
  `--duration-slide`).

---

## 9. Oscuro: lo que toca (poco, y compartido)

- Bordes de control: `control-line` = `strong` (12 %) en oscuro; el relleno `field` sobre `bg`
  ya distingue el campo. Botón secundario: `accent/60` (4,0:1) en vez de `accent-line` 45 %
  (2,83). **Este cambio sí se ve en oscuro**: el borde del secundario sube un punto de brillo.
- `PageGrafica.tsx`: quitar `dark:opacity-*` apilado sobre `ink-3` y los `text-[11px]`.
- `MRV` en Plantilla: `danger/12`.
- Toast con `shadow-e2` (ya está en `e2` del oscuro: 0.55 de negro; se nota poco, correcto).
- Todo lo de animaciones (§8) es de los dos temas.
- Nada más cambia de valor en `.dark`.

---

## 10. Lo que no he podido ver sin cuenta (lista para Dani)

Con usuario real, en claro, mirar sobre todo:

- Home del atleta (anillos de racha, tarjetas de hoy) y **Entreno › sesión en curso**
  (`WorkoutSessionPlayer`: cronómetro, RIR, serie hecha).
- Perfil del atleta (bloques reordenables, ajuste de tema).
- Mi menú / Recetas del atleta (tablero, favoritos).
- Home del coach (`HomeCoachScreen` con datos reales: alertas, propuestas del asistente).
- Hub del cliente: todas las pestañas (Entrenamientos, Dietas, Cuerpo, Cardio, Ficha, Notas).
- CRM (lista, detalle, pagos, reuniones).
- Editor de dietas (`NutritionPlansScreen`), Biblioteca de alimentos y de ejercicios, Mesociclo
  en vista ancha (`fila-ejercicio` con `hover`).
- Asistente (`AiChatPanel`): burbujas, propuestas editables.
- Academia (portadas con hex fijos).
- Cardio con banda real (zona rellenando la pantalla).

Los bancos de pruebas cubren Nutrición, Recetario, Revisión (atleta y coach), Asignados, Clientes
(nuevo), Calendario, Cardio (demo), Gimnasio, Legal, Onboarding, Orden del ciclo, Plantilla,
Progresión, Bienvenida y el showcase.

---

## 11. Plan de fase 2 (un commit por tanda, rama `modo-claro-3`)

1. **Tokens y paleta**: §3.1 (`bg`, `raised`, `field`, `inset`, `track`, `hairline`, `strong`,
   nuevo `control-line` en las dos pieles), `accent-line` oscuro a 60 %, `tema.ts` ↔ `index.html`,
   y los 4 ajustes de contraste de §2.1 que son de token.
2. **Superficies**: §3.3 (primitivas `Input`/`Select`/`SearchField`/`Chip`/`Button secondary`/
   `SegmentedControl`/`ListRow`, toast, barra inferior y cabecera con `e1`, hoja de añadir, pasos de
   Revisión, Orden del ciclo, Calendario bloques, «Invitar atleta», «Mi gimnasio»).
3. **Seleccionado**: la opción que elija Dani en `Chip`, segmentado y una utilidad `.seleccionado`
   (o `data-selected`) en `index.css`; migración de las 40 recetas a ella; `accent-bg` solo
   informativo.
4. **Tipografía**: §5.1 Nutrición primero; luego §5.2 por archivo; §5.3 pesos.
5. **Animaciones**: §8.1 primitivas (Dialog salida, Toast salida, Collapsible, Tabs, ListRow
   active, EmptyState), luego §8.2 por pantalla, `transition-all` por archivo, Calendario al
   sistema, FLIP de Orden del ciclo al final.

Comprobación tras cada tanda: el mismo script de contraste sobre las 20 rutas + 12 estados, en los
dos temas; capturas antes/después para el PR.

---

## 12. Fuera del encargo pero urgente

**El disco del Mac está lleno**: 151 MB libres de 460 GB en el momento de escribir esto. Las
capturas de página completa de esta revisión (40 MB) han llegado a fallar por `ENOSPC`. Antes de
la fase 2 (que vuelve a capturar todo) hace falta liberar espacio; no he borrado nada que no fuera
mío.

---

## Decisiones que necesito de Dani

1. **Seleccionado**: A, B o C (recomiendo B; ver `sel-*.png`).
2. **Superficies**: ¿vale la regla de §3.1 con el nuevo `bg` #F3F0EA y `field`/`raised` en crema?
   (ver `sup-*.png`). Y `control-line` al 46 % (3:1) o al 40 % (más suave).
3. ¿Se queda `/dev/clientes` (banco de pruebas) o lo borro antes del PR?

---

# Fase 2 · ejecutada el 27-10-2026

## Decisiones de Dani (tras ver las maquetas)

- **Fondo de página: gris tibio `#F3F2F0`**, no el crema propuesto ni gris neutro. Se maquetaron los
  tres (`hojas gris-*`); el tibio mantiene el oro integrado y lee como gris.
- **Seleccionado: B, oro sólido**, en todo (chips, filtros, raciones, toggles, segmentado, días).
  El segmentado lleva además la pista hundida (`inset`) que se vio en la maqueta C.
- **Regla de superficies aprobada** tal cual §3.1, con `control-line` al 48 % (3,16:1).
- **Fuera el ocre `#7D5300`** del anillo de calorías: «esa tonalidad no existe en la app».
- Ficha del alimento y Revisión del atleta: con la regla de superficies.

## Qué se hizo, por tanda (un commit cada una, rama `modo-claro-3`)

| Tanda | Commit | Qué cambia |
|---|---|---|
| 1 · Tokens | `a5e76f7` | `bg` #F3F2F0; `raised` y `field` = `bg`; `inset` #E6E5E2; `track` #DAD9D5; `hairline` 14 %; `strong` 30 %; nuevo `control-line` (48 % claro, = `strong` oscuro); `accent-line` sólido #A87510 en claro y oro al 60 % en oscuro; `macro-hc` texto = `accent-ink`; nuevos `macro-*-fill` para anillo, barras y donut (ámbar/azul/naranja de verdad); `zone-3-ink` = `accent-ink`; `tema.ts` e `index.html` con el fondo nuevo |
| 2 · Superficies | `9e8a449` | `Input`/`Select`/`SearchField` con `control-line`; `Chip` sin seleccionar con `strong`; pista del `SegmentedControl` en `inset`; toast blanco con sombra e2 y borde; cabecera y barra inferior con `shadow-e1`; mini-reproductor con e1; filas de la hoja de añadir con borde; Orden del ciclo sin oro de tipo (sesión blanca, descanso `raised`); «+ Añadir» del peso con `strong`; «Invitar atleta» con `accent-line`; y los 6 fallos de contraste medidos (check sobre verde → `on-fill`, etiquetas del calendario sin opacidad, banner sin opacidad, gráfica de cardio sin `dark:opacity`, contador `warning/12`, leyenda MRV al 55 %) |
| 3 · Seleccionado | `d1c8822` | Una receta: `bg-accent border-accent-press text-on-accent` en `Chip` y en 44 sitios que tenían la suya (chips de filtro, raciones, toggles, CRM); tarjeta elegida (opción con descripción) con marco `accent-press` + `ring` en blanco; los tintes `accent-bg`/`bg-accent/N` que quedan son informativos (banner, badge, columna «semana actual», fila «hecho») |
| 4 · Tipografía | `fb2542c` | Ficha del alimento: tabla y etiquetas a `body-s`, raciones a `body-s` 600 sin cambiar de peso al elegir; hoja de añadir: nombre `title-s` 600, dato mono; diario: nombre 16/500, gramos mono en tinta, kcal `body-s`; 63 `text-[Npx]` y 21 `text-base/xs/3xl` a la escala; pestaña activa 700 (era 800); cifras de dato 700 |
| 5 · Animaciones | `6a0423a` | Salida animada de `Dialog` (nuevo `dialog-out`, 140 ms) y del toast (`toast-out`); `Collapsible` con `grid-template-rows` + `inert`; `active:scale` en `ListRow`, `ActionRow`, `Card` pulsable y `Chip`; `EmptyState` con `fade-up`; anillo del día, anillos de la semana, barras de macros y donut de la ficha transicionan con `--duration-ring`/`--duration-bar`; Calendario y tutorial sobre `--duration-*` y `--ease-brand`; listas escalonadas (Clientes, hoja de añadir, pasos de Revisión; tope `--i` 8); bienvenida con `fade-up`; 181 `transition-all` → `transition-[color,background-color,border-color,opacity,transform,box-shadow]` |
| Ajuste | `424bc30` | `control-line` 46 → 48 % (el 46 daba 2,98); chips «encajan» y «añadir comida» con `strong` |

## Lo que NO se ha hecho, y por qué

- `Tabs` no desliza el subrayado: el código lo decide a propósito (entra/sale por opacidad para no
  «recorrer» la barra entre pestañas lejanas). Se respeta.
- Recharts (peso corporal, gráficas del coach) sigue con su animación propia; falta
  `isAnimationActive={!reducedMotion}` y `animationDuration` del sistema. Es por gráfica.
- `TourOverlay` sigue animando `top/left/width/height` (solo pasó a tokens); el FLIP con
  `transform` es trabajo aparte.
- Reordenar en Orden del ciclo no tiene FLIP.
- El borde de un chip neutro (`strong`, 1,9:1) no llega al 3:1 estricto; la regla lo compensa con
  el relleno un escalón distinto del padre. El 3:1 estricto se reserva a los campos (`control-line`).
- Las pantallas sin banco de pruebas (§10) no se han visto; heredan los tokens y las primitivas.

## Comprobación

Mismo script de contraste, 20 rutas + 12 estados, claro y oscuro, 375 y 1280 px, tras la tanda 5.
Resultado en la sección siguiente.

## Resultado de la auditoría final (tras `ce9dbc9`)

16.986 textos e iconos y 1.440 bordes medidos (20 rutas + 12 estados × 2 temas × 2 tamaños).

**Texto e iconos:** quedan 10 fallos por tema y **todos son controles deshabilitados** (botón
primario «Acepto y continúo» / «Añadir» apagado, chevrones de mover en Orden del ciclo, «−» del
stepper al mínimo, icono de candado del showcase). La norma los exime. Ningún texto legible
queda por debajo de 4,5:1 ni ningún icono activo por debajo de 3:1, en ninguno de los dos temas.

**Bordes:** todos los campos de formulario pasan 3:1 (`control-line`). Lo que queda por debajo es
lo que la regla de superficies resuelve con relleno y no con línea:
- `hairline` en tarjetas y botones neutros (1,33:1 claro / 1,2:1 oscuro): la tarjeta se lee por
  el blanco sobre gris; el botón neutro, por su relleno un escalón distinto.
- `strong` en chips sin seleccionar (1,9:1): el chip gris sobre tarjeta blanca.
- Bloques de fase del Calendario (1,4:1): son bandas de color con etiqueta, no controles.
- Oro `accent` sólido sobre blanco (2,86:1, 2 sitios: círculo «hecho» del diario y una celda
  cambiada en Progresión): el relleno es oro, el borde solo lo remata.
