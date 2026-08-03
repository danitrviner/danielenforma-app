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
