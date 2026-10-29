# Acompañamiento · Galería de variantes → elección (cerrada)

29-10-2026 · galería en rama `acompanamiento-variantes` (apilada sobre la 5b) · elección aplicada en `acompanamiento-10-eleccion` (apilada sobre la 9). Regla de Dani (29-10): cada pieza nueva de la app se enseña en 2-3 versiones y se elige al final, también las de las tandas 1-4.

## Lo que eligió Dani (29-10)

| Pieza | Dónde | Elegida | Descartadas | Captura |
|---|---|---|---|---|
| Panel de retención | Coach, encima de la bandeja | **A · cifras**: 4 cifras en rejilla | línea · dos grandes | `12a` |
| Cuadro de respuesta a la revisión | Coach, Recibidas | **A · tres**: un campo por bloque | un solo campo | `12c` |
| «Dani ha revisado tu semana» | Atleta, Perfil › Revisión | **A · bloques**: tres títulos y su texto | texto corrido | `12d` |
| «Lo último de Dani» | Atleta, Inicio | **B · último**: solo lo más reciente y «y N más esta semana», **sin fecha** | lista por fecha · carrusel | `12b` |
| «Tu primera semana» | Atleta, Inicio | **A · lista**: tres filas | tres pasos con barra | `12e` |
| Sala de espera, fecha comprometida | Atleta, día 0 | **A · insignia**: «LO TENDRÁS EL SÁBADO 31» | cuenta atrás | `12f` |
| «Lo que viniste a buscar» | Atleta, Inicio | **A · cita**: la frase grande y una línea de cifras | — (la forma «cifras» sigue en Mi objetivo, a propósito) | `12g` |
| «Bienvenido de vuelta» | Atleta, Inicio | **A · banda**: tarjeta con icono | una línea | `13a` |
| «Tu plan termina pronto» | Atleta, Inicio | **A · tarjeta**: con el antes → ahora | una línea | `14a` |
| «Hecho con lo que me dijiste» | Atleta, Mi menú | **B · chips**: píldoras | una frase | `15` |
| Road map | Atleta, Perfil › Road map | **A · camino**: escalera vertical de fases, la actual abierta | mapa · compacta | `11a/11b/11c` |

## Qué se hizo al elegir

- Cada componente se queda con su versión: fuera la prop `variante` y fuera `src/data/variantes.ts` y la galería `/dev/variantes` (`VariantesDevHarness`). `/dev/roadmap` enseña solo el camino.
- Borradas las piezas viejas del Road map que ya no usaba nadie: `PhaseHeroCard`, `PhasePathStepper`, `LevelLadderCard`, `PlanPhaseEditor`, `RecentAchievements`, `utils/planPhase.ts`, `data/phasePresets.ts`, `utils/planNutritionBridge.ts` (+ su test). `LevelLadderEditor` sigue (lo usa el coach en Road map › Niveles, que alimenta la Academia y los retos).
- Lo que no cambia: los datos, los textos (voz de Dani), nada firmado sin que lo vea, nada de rojo ni «desvío».

## Pruebas

`tsc` 0 · `vitest` 3.368 en verde · eslint e iconos OK.
