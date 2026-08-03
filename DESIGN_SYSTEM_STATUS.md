# Estado de la migración al Design System

**Documento vivo.** Es la referencia del estado del refactor: dónde estamos, qué queda y qué
riesgos hay abiertos. Se actualiza al cerrar cada fase.

> **Última actualización:** 3 de agosto de 2026 · **Sprint 1 completado** · rama `ds/f0-linea-base`
> · 30 commits sin pushear

**Dos documentos, dos funciones.** Este es el *panel de estado*: se lee de un vistazo y siempre
refleja el presente. [`docs/DS-migracion.md`](docs/DS-migracion.md) es la *bitácora*: histórico por
fase, solo crece, no se reescribe. Las decisiones de diseño no viven en ninguno de los dos — están
en la auditoría UX/UI, el Design System y el plan de migración, que son externos y cerrados.

---

## Progreso

```
Sprint 1  ████████████████████  F0 F1        COMPLETADO
Sprint 2  ░░░░░░░░░░░░░░░░░░░░  F2 F3        pendiente
Sprint 3  ░░░░░░░░░░░░░░░░░░░░  F4 F5        pendiente
Sprint 4  ░░░░░░░░░░░░░░░░░░░░  F6 F7        pendiente
Sprint 5  ░░░░░░░░░░░░░░░░░░░░  F8 F9 F10    pendiente
Sprint 6  ░░░░░░░░░░░░░░░░░░░░  F11          pendiente
Sprint 7  ░░░░░░░░░░░░░░░░░░░░  F12          pendiente
Sprint 8  ░░░░░░░░░░░░░░░░░░░░  F13 F14 F15  pendiente
```

**2 de 16 fases completadas.**

## Fases

| Sprint | Fase | Título | Estado | Fin | Riesgo |
|:--:|:--:|---|---|:--:|---|
| 1 | **F0** | Red de seguridad y línea base | ✅ Completada | 2026-08-03 | Nulo |
| 1 | **F1** | Tokens reales en `@theme` | ✅ Completada | 2026-08-03 | Medio |
| 2 | **F2** | Defectos objetivos | ⬜ Pendiente | — | Bajo |
| 2 | **F3** | Radios — fase aislada | ⬜ Pendiente | — | **Crítico** |
| 3 | **F4** | Escala tipográfica y suelo de tamaño | ⬜ Pendiente | — | Medio |
| 3 | **F5** | Mono → Sans | ⬜ Pendiente | — | Medio |
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
| Hex literales en componentes | ↓ | 4.638 | **29** | ~0 | F1 ✅ |
| Tokens del DS en uso | ↑ | 0 | **4.279** | — | F1 ✅ |
| Imports de `theme.ts` | ↓ | 0 | **borrado** | 0 | F1 ✅ |
| Bordes `border-white/>12` | ↓ | 93 | 93 | 0 | F2 |
| Textos por debajo de 11 px | ↓ | 1.151 | 1.150 | 0 | F4 |
| Tamaños de texto distintos | ↓ | 12 | 12 | ≤ 8 | F4 |
| `font-black` / `font-extrabold` | ↓ | 117 | 117 | ~0 | F4 |
| `font-mono` | ↓ | 1.527 | 1.527 | < 500 | F5 |
| `font-sans` | ↑ | 590 | 590 | > mono | F5 |
| Espaciado fuera de escala | ↓ | 1.170 | 1.170 | 0 | F6 |
| Overlays `fixed inset-0` | ↓ | 39 | 39 | 0 fuera de `ui/` | F9 |
| `transition-all` | ↓ | 377 | 377 | 0 | F13 |
| `animate-pulse` | ↓ | 29 | 29 | solo en `Skeleton` | F13 |
| `prefers-reduced-motion` | ↑ | 0 | 0 | > 0 | F13 |
| `aria-label` | ↑ | 23 | 23 | — | F14 |
| `htmlFor` | ↑ | 0 | 0 | ≥ 116 | F14 |
| `focus-visible` | ↑ | 0 | 0 | > 0 | F14 |
| Archivos > 600 líneas | · | 21 | 21 | 0 (a un año) | F15 |
| Radios `lg / xl / 2xl` | · | 425/257/278 | 425/257/278 | 3 + `full` | F3 |

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
| R1 | **Colisión de radios.** `rounded-lg` y `rounded-2xl` renderizan ambos 16 px en 703 sitios, y `rounded-xl` (20 px) queda fuera de orden. Un renombrado que asuma la semántica estándar de Tailwind rompe 703 elementos sin un solo error de compilación ni aviso en consola. | F3 | **Abierto — el mayor del plan** |
| R2 | **Sin capturas de referencia.** Se decidió no añadir Playwright ni Puppeteer. Para F1 no hicieron falta (sus cambios son medibles por contador), pero F3 declara la revisión visual obligatoria y no opcional. | F3 | **Abierto — bloqueante en F3** |
| R3 | **Modales dentro de una sesión de cardio en directo.** `LiveSession`, `EffortPrompt`, `CooldownPrompt` y `HrvTestScreen` se abren durante un entrenamiento real; un fallo ahí lo interrumpe. | F9 | Abierto |
| R4 | **Bloqueo de scroll mal desmontado** al migrar los 39 overlays deja la página congelada. Es el bug clásico de esta migración. | F9 | Abierto |
| R5 | **Desbordamiento de layout al subir tamaños.** Subir 1.150 textos por encima de 11 px hace que cosas que hoy caben dejen de caber. No rompe nada: solo empeora, y en sitios que nadie mira. | F4 | Abierto |
| R6 | **Capacitor empaqueta el mismo build.** Cualquier regresión llega también a iOS y Android, donde no hay «recargar». No sincronizar a mitad de sprint. | Todas | Vigente |
| R7 | **Fatiga de revisión.** 16 fases con un solo revisor: el riesgo real no es técnico, es que a partir del PR 20 se apruebe sin mirar. | Todas | Vigente |

## Deuda técnica del Design System

Detectada y **no** resuelta, con la fase a la que pertenece.

| Hallazgo | Medida | Fase |
|---|--:|:--:|
| Bordes blancos por encima del 12 % en 36 archivos (79 estáticos + 14 en hover) | 93 | F2 |
| Escala de z-index elegida por orden de aparición | 11 valores | F2 |
| `sticky top-[65px]` calibrado para el header de escritorio; el de móvil mide 69 px | 1 | F2 |
| `MetricsScreen.tsx` no lo enruta nadie: código muerto, y aun así se migró en F1 | 441 líneas | F2 |
| Campos de `ProfileScreen` por debajo de 16 px: provocan zoom automático en iOS | 5 | F2 |
| Radios: 6 valores renderizados con dos colisiones | 1.209 usos | F3 |
| Textos por debajo de 11 px | 1.150 | F4 |
| El 72 % de la tipografía es monoespaciada, párrafos incluidos | 1.527 | F5 |
| Emojis usados como iconografía funcional (🔥 en calentamiento, 🏅⚡⭐ en insignias) | — | F5 |
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
