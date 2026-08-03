# Bitácora de la migración al Design System

Registro de ejecución del plan de migración. **Una entrada por fase**, escrita al cerrarla:
qué contadores movió, qué se revisó y qué se dejó fuera a propósito.

No es documentación de diseño. Los tres documentos de referencia — auditoría UX/UI, Design System
y plan de migración — son externos y no se duplican aquí.

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
| Hex distintos | ↓ | F1 | 102 |
| Hex literales (apariciones) | ↓ | F1 | 4.656 |
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

_Pendiente._
