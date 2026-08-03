# Estado de la migración al Design System

**Documento vivo.** Es la referencia del estado del refactor: dónde estamos, qué queda y qué
riesgos hay abiertos. Se actualiza al cerrar cada fase.

> **Última actualización:** 3 de agosto de 2026 · **Sprints 1, 2 y 3 completados** · rama
> `ds/f0-linea-base` · 57 commits sin pushear

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
Sprint 4  ░░░░░░░░░░░░░░░░░░░░  F6 F7        pendiente
Sprint 5  ░░░░░░░░░░░░░░░░░░░░  F8 F9 F10    pendiente
Sprint 6  ░░░░░░░░░░░░░░░░░░░░  F11          pendiente
Sprint 7  ░░░░░░░░░░░░░░░░░░░░  F12          pendiente
Sprint 8  ░░░░░░░░░░░░░░░░░░░░  F13 F14 F15  pendiente
```

**6 de 16 fases completadas.**

## Fases

| Sprint | Fase | Título | Estado | Fin | Riesgo |
|:--:|:--:|---|---|:--:|---|
| 1 | **F0** | Red de seguridad y línea base | ✅ Completada | 2026-08-03 | Nulo |
| 1 | **F1** | Tokens reales en `@theme` | ✅ Completada | 2026-08-03 | Medio |
| 2 | **F2** | Defectos objetivos | ✅ Completada | 2026-08-03 | Bajo |
| 2 | **F3** | Radios — fase aislada | ✅ Completada | 2026-08-03 | **Crítico** |
| 3 | **F4** | Escala tipográfica y suelo de tamaño | ✅ Completada | 2026-08-03 | Medio |
| 3 | **F5** | Mono → Sans | ✅ Completada | 2026-08-03 | Medio |
| 4 | **F6** | Espaciado, ritmo vertical y sombras | ⬜ Pendiente | — | Medio |
| 4 | **F7** | Primitivas en `src/components/ui/` | ⬜ Pendiente | — | Bajo |
| 5 | **F8** | Adopción de bajo riesgo | ⬜ Pendiente | — | Bajo |
| 5 | **F9** | Sheet / Dialog: los modales artesanales | ⬜ Pendiente | — | **Alto** |
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
| Hex distintos en componentes | ↓ | 101 | **15** | ≤ 22 | F1 ✅ |
| Hex literales en componentes | ↓ | 4.638 | **28** | ~0 | F1 ✅ |
| Tokens del DS en uso | ↑ | 0 | **5.224** | — | F1 ✅ |
| Imports de `theme.ts` | ↓ | 0 | **borrado** | 0 | F1 ✅ |
| Bordes `border-white/>12` | ↓ | 93 | **0** | 0 | F2 ✅ |
| Textos por debajo de 11 px | ↓ | 1.151 | **0** | 0 | F4 ✅ |
| Escalones de tamaño en uso | ↓ | 16 | **8 + 2 excep.** | ≤ 8 | F4 ✅ |
| Pesos de fuente distintos | ↓ | 6 | **4** | 4 | F4 ✅ |
| `font-mono` | ↓ | 1.527 | **1.030** | mono < sans | F5 ✅ |
| `font-sans` | ↑ | 590 | **1.057** | > mono | F5 ✅ |
| Espaciado fuera de escala | ↓ | 1.170 | 1.157 | 0 | F6 |
| Overlays `fixed inset-0` | ↓ | 39 | 39 | 0 fuera de `ui/` | F9 |
| `transition-all` | ↓ | 377 | 372 | 0 | F13 |
| `animate-pulse` | ↓ | 29 | 29 | solo en `Skeleton` | F13 |
| `prefers-reduced-motion` | ↑ | 0 | 0 | > 0 | F13 |
| `aria-label` | ↑ | 23 | 23 | — | F14 |
| `htmlFor` | ↑ | 0 | 0 | ≥ 116 | F14 |
| `focus-visible` | ↑ | 0 | 0 | > 0 | F14 |
| Archivos > 600 líneas | · | 21 | 21 | 0 (a un año) | F15 |
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
| R3 | **Modales dentro de una sesión de cardio en directo.** `LiveSession`, `EffortPrompt`, `CooldownPrompt` y `HrvTestScreen` se abren durante un entrenamiento real; un fallo ahí lo interrumpe. | F9 | Abierto |
| R4 | **Bloqueo de scroll mal desmontado** al migrar los 39 overlays deja la página congelada. Es el bug clásico de esta migración. | F9 | Abierto |
| R5 | **Desbordamiento de layout al subir tamaños.** Subir 1.150 textos por encima de 11 px hace que cosas que hoy caben dejen de caber. No rompe nada: solo empeora, y en sitios que nadie mira. | F4 | Abierto |
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
| 590 iconos Material Symbols dimensionados con tokens de TEXTO; falta una primitiva `Icon` | 590 | F7 |
| Espaciado fuera de la escala de 4 px | 1.170 | F6 |
| Glow en cuatro tarjetas donde no señala nada | 4 | F6 |
| Overlays artesanales sin foco atrapado ni Escape | 39 | F9 |
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
