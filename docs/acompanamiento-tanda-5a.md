# Acompañamiento · Tanda 5a · El Road map sale de los objetivos

29-10-2026 · rama `acompanamiento-5a-roadmap` (apilada sobre la tanda 4) · plan §5a · hallazgos H-28, H-23.

Encargo de Dani (28-10): el Road map es la pantalla con la que el cliente sabe en qué momento está, qué le queda y cuáles son los objetivos a corto y medio plazo; tiene que salir de los objetivos planteados desde la asesoría inicial, no montarse aparte. Decisiones (28-10): fases manuales fuera; hitos que salen solos (cambio de fase, peso objetivo, fin de bloque, constancia: 4 semanas seguidas con todos los entrenos, 4 cuestionarios seguidos, 4 semanas cumpliendo pasos); horizonte = plan entero con la actual destacada; además bloque de entreno, esta semana (kcal, pasos, cardio, reto) y logros recientes; escalera de niveles NO; peso con su franja esperada, sin rojo ni «desvío»; si va lento, qué hacer esta semana.

## Qué cambia para el atleta (Perfil › Road map)

- **Dónde estás:** la fase en curso con su objetivo en su idioma («Déficit · bajar a 79,0 kg antes del 29 nov»), «semana 2 de 6», su peso y la franja esperada esta semana, cuánto queda hasta el peso meta, y una frase que nunca es un reproche: «Vas en el plan. Sigue igual esta semana.» / «Esta semana: registra la comida todos los días y llega a los 9.000 pasos. Con eso Dani ajusta el lunes si hace falta.»
- **El plan entero:** todas las fases del programa de nutrición (pasadas, actual, futuras) con semanas, fechas y objetivo; el bloque de entreno en curso (nombre, semana N de M).
- **Esta semana:** kcal, pasos y bloque; el reto de la semana (tarjeta de siempre); **el próximo hito** («Mantenimiento en 5 semanas», «Fin del bloque en 4 semanas», «Peso objetivo a 1,2 kg»).
- **Conseguido:** los hitos automáticos (fase completada, peso objetivo de la fase, bloque terminado, 4 semanas seguidas con todos los entrenos, 4 revisiones seguidas, 4 semanas cumpliendo los pasos) y los retos conseguidos. Los 16 `roadmap.items` manuales dejan de pintarse (archivo de datos: pendiente de Dani).
- La escalera de niveles desaparece de la pantalla (sigue calculándose en silencio para la Academia).
- **Tres variantes** en `/dev/roadmap` para que Dani elija (A camino · B mapa · C compacta), mismos datos. Hasta la elección, la app usa la A. Capturas `11a/11b/11c`.

## Qué cambia para Dani

- Road map › **Fases** (`PlanPhaseEditor`, «Usar plan estándar») desaparece: ya no hay nada que montar aparte. Quedan Retos, Niveles (alimentan la Academia y los retos) y Calendario. El objetivo y las fases se editan en Plan › Objetivo (sesión «App Enforma actualizada», rama `objetivo-desde-objetivo`).

## Cómo

- `utils/roadmapDelAtleta.ts` (puro, con tests): `construirRoadmap` ← `semanasDelPlan` + `evaluarPlan` (la misma fuente que ve Dani en Plan › Objetivo; no se tocan) + mesociclos + asignaciones + respuestas + pasos. `caminoDeFases`, `dondeEstas`, `bloqueEnCurso`, `proximoHito`, `hitosAutomaticos`.
- `components/roadmap/RoadmapDelAtletaVista.tsx`: la vista (tres variantes hasta el 29-10; Dani eligió «camino», ver `acompanamiento-variantes.md`). `AthleteRoadmapScreen.tsx` reescrito (carga, escalera en silencio, vista). `CoachRoadmapView.tsx` sin la pestaña Fases.
- `PhaseHeroCard`, `PhasePathStepper`, `LevelLadderCard`, `PlanPhaseEditor`, `planPhase.ts` quedaron sin uso en el atleta; BORRADOS el 29-10 (rama `acompanamiento-10-eleccion`) con `RecentAchievements`, `phasePresets.ts` y `planNutritionBridge.ts`.
- Banco `/dev/roadmap`.

## Pruebas

`tsc` 0 · `vitest` todo en verde (+8) · eslint e iconos OK · `/dev/roadmap` comprobado en las tres variantes.

## Hipótesis y métrica (4 semanas)

Si el Road map dice en qué semana está, qué viene y por qué, el cliente deja de sentir que el plan es «lo de esta semana y ya». Métrica (A.5): atletas con Road map con fase e hito: **1 de 15 → todos los que tengan programa** (hoy 9 con programa; los 6 sin programa ven «en cuanto Dani te ponga el objetivo»); hitos vencidos sin cerrar 7 → 0 (ya no existen hitos manuales).
