# Acompañamiento · Galería de variantes para elegir

29-10-2026 · rama `acompanamiento-variantes` (apilada sobre la 5b) · regla de Dani (29-10): cada pieza nueva de la app se enseña en 2-3 versiones y se elige al final, también las de las tandas 1-4.

Todo vive en `/dev/variantes` (una sección por pieza, una columna por versión, mismos datos de mentira; `?pieza=…` enseña una sola). Lo elegido se fija en **`src/data/variantes.ts`**: una línea por pieza; cada componente lee su variante de ahí y la admite como prop para la galería. Hasta la elección, la app usa la **A** de cada una.

| Pieza | Dónde | A | B | C | Captura |
|---|---|---|---|---|---|
| Panel de retención | Coach, encima de la bandeja | **cifras**: 4 cifras en rejilla | **línea**: una frase con lo que pide mirar en ámbar | **dos grandes**: apagándose y sin contestar en grande, el resto en una línea | `12a` |
| Cuadro de respuesta a la revisión | Coach, Recibidas | **tres**: un campo por bloque | **uno**: un solo campo con el borrador entero (con títulos) | — | `12c` |
| «Dani ha revisado tu semana» | Atleta, Perfil › Revisión | **bloques**: tres títulos y su texto | **corrido**: un párrafo con los títulos en negrita | — | `12d` |
| «Lo último de Dani» | Atleta, Inicio | **lista**: todo por fecha | **último**: solo lo más reciente y «y N más» | **carrusel**: tarjetas en horizontal | `12b` |
| «Tu primera semana» | Atleta, Inicio | **lista**: tres filas | **pasos**: tres pasos en horizontal con barra | — | `12e` |
| Sala de espera, fecha comprometida | Atleta, día 0 | **insignia**: «LO TENDRÁS EL SÁBADO 31» | **cuenta atrás**: «2 días · sábado 31» en grande | — | `12f` |
| «Lo que viniste a buscar» | Atleta, Inicio y Mi objetivo | **cita**: la frase grande y una línea de cifras | **cifras**: empezaste · ahora · meta y la frase pequeña | — | `12g` |
| Road map | Atleta, Perfil › Road map | **camino**: escalera vertical de fases, la actual abierta | **mapa**: barra del plan entero + tarjetas | **compacta**: una tarjeta con las fases como píldoras | `11a/11b/11c` |

Lo que no cambia entre versiones: los datos, los textos (voz de Dani), nada firmado sin que lo vea, nada de rojo ni «desvío».

## Cómo

- `src/data/variantes.ts` (la elección) · `components/coach/PanelRetencionCard.tsx` (el panel, sacado de `HomeCoachScreen`) · prop `variante` en `LoUltimoDeDani`, `RespuestaCoachBox`, `RespuestaDelCoach`, `PrimeraSemanaCard`, `PlanInPreparationCard`, `LoQueVinisteABuscar`, `RoadmapDelAtletaVista`.
- Los bancos `/dev/respuesta`, `/dev/primera-semana` y `/dev/roadmap` exportan sus fixtures para la galería.

## Pruebas

`tsc` 0 · `vitest` 3.363 en verde · eslint e iconos OK · `/dev/variantes` comprobado pieza a pieza.

## Qué tiene que hacer Dani

Abrir `/dev/variantes` (o mirar las capturas 11-12) y decir una letra por pieza. Después: una línea por pieza en `variantes.ts`, se borran las versiones no elegidas y las piezas antiguas del Road map (`PhaseHeroCard`, `PhasePathStepper`, `LevelLadderCard`, `PlanPhaseEditor`, `planPhase.ts`).
