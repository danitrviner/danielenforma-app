# Periodización · hoja de control (coach) + Road map «el camino» (atleta)

30-10-2026 · rama `periodizacion-hoja-control` · maquetas en `App enforma/maquetas-periodizacion/` (Dani eligió **coach C** y **atleta A**; el entreno NO se toca desde la periodización).

## Decisiones de Dani (30-10)

- Por fase fija **objetivo, ritmo (% del peso/sem) y semanas**; el **peso al final sale solo**, encadenando fases. Los programas de antes (peso objetivo + kg/sem → semanas) siguen funcionando.
- **Plantillas suyas, editables** (`coachSettings/plantillasPeriodizacion`); cuatro por defecto: Definición 12 + salida, Definición + diet break, Recomposición 16, Volumen 12. «Guardar estas fases como plantilla».
- **Macros por g/kg** (proteína, grasa; hidratos el resto) → kcal. Al publicar, una fase sin dieta **crea su dieta base** con esos macros (sin comidas: las monta el coach o el generador).
- **Escalones** (cada N semanas, ±kcal, ±pasos): los propone la hoja y se **confirman al publicar**, escribiéndose donde ya lee el día del atleta (`cambiosSemana` en gramos de HC, `pasosPorSemana`). La primera semana de cada fase se vuelve a cuadrar para que un escalón no se cuele en la siguiente.
- **Pérdida acelerada**: ritmo 0,6-1 %/sem, proteína 1,8-2 g/kg, máximo 8 semanas; avisa si se sale.
- El atleta ve: fases con su **para qué** (texto del coach), meta, lo de ahora (comida, pasos, cardio, bloque de entreno, fuerza), **semana a semana solo de la fase en curso**, el **próximo cambio programado** (escalón, pasos o fase) y el entreno dentro del camino. Solo en el Road map: **Nutrición › Periodización desaparece**.

## Qué cambia

**Modelo** (`types.ts`): `NutritionPhase.modo | ritmoPctSem | proteinaGKg | grasaGKg | pasos | cardio | escalon | paraQue`; `PlantillaPeriodizacion`, `PlantillaFase`.

**Motor** `utils/hojaDePeriodizacion.ts` (puro, 14 tests): `encadenarFases`, `fasesParaGuardar` (escribe `targetWeight`/`targetRateKgWeek` calculados para que el resto del motor no cambie), `kcalParaElRitmo`, `macrosPorKg`, `dietaDesdeMacros`, `avisoAcelerada`, `escalonesDeFase` / `confirmarEscalones` / `confirmarTodosLosEscalones`, `filasSemanaASemana`, plantillas. `utils/seguimientoPlan.ts`: `kcalPlan` de cada semana sale de `kcalPorSemana` (con escalones y ajustes), no de la fase.

**Coach** `components/plan/HojaDePeriodizacion.tsx` en Cliente › Plan › Objetivo › Plan: cabecera (objetivo, peso → meta, semanas, fechas, mantenimiento, pasos→kcal, proteína mínima editable, límites de acelerada, Plantilla ▾, + Fase, Deshacer, Guardar y publicar); **tabla de fases** (nombre, objetivo, semanas, ritmo con suave/normal/rápido, peso inicio→fin, kcal de inicio con «sugerir», déficit/día, P·G g/kg con gramos, pasos, escalones n·✓, dieta crear/enlazar, subir/bajar/borrar) con **fila de detalle** (fechas, pesos, kcal inicio→fin, gramos, dieta; escalones editables con su estado; para qué, cardio); debajo la **barra de semanas de siempre** (ciclado, reglas por peso, mínimos, comidas libres, suplementos) y la **tabla semana a semana** (fechas, fase, kcal y pasos tocables por semana, cardio, peso esperado, real). Banco `/dev/hoja` (`?vacio=1`).

**Atleta** `utils/roadmapDelAtleta.ts` + `roadmap/RoadmapDelAtletaVista.tsx`: `paraQue` y `cardio` por fase, `semanasDeFase`, `bloques` (todos los mesociclos con estado), `proximoCambio`; en el camino: cardio en «Esta semana», fuerza en una línea, tira semana a semana (verde en franja / gris esperado), próximo cambio, y el paso de entreno (bloque en curso → siguientes). Fuera la pestaña Nutrición › Periodización.

## Pruebas

`tsc` 0 · vitest en verde (+4 Road map, +14 hoja) · eslint e iconos OK (`dashboard_customize` añadido al subconjunto) · `/dev/hoja` y `/dev/roadmap` comprobados.

## Lo que queda

- QA de Dani con un atleta real (crear desde plantilla, publicar, ver que la dieta base y los escalones aparecen en la barra de semanas y en el diario del atleta).
- Los parámetros extra que pida Dani en la tabla de fases (dijo que quiere más info y control).
- `NutritionPeriodizationPanel` sigue para la barra de semanas (`parte="semanas"`) y para `/dev/revision-coach`; su editor viejo ya no se monta.
