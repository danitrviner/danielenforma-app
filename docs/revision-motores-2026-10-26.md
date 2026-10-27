# Revisión de los motores de En Forma — 26-10-2026

Revisión de solo lectura sobre `origin/main` (`3120665`, PR #15 «recetas-vinculadas»), hecha en el worktree `/Users/dani/en-forma-calorias`. No se ha tocado código de la app, Firestore ni Storage. Todo lo dinámico se ha medido en local con scripts temporales (ya borrados) sobre `public/recetas/*.json`, `public/recetas-indice.json`, `src/nutricion_seed_en_forma.ts`, `src/utils/cdg/__fixtures__` y la copia del catálogo `~/Desktop/App enforma/copia-catalogo-2026-10-26.json`.

**Línea base:** `npx tsc --noEmit` 0 errores · `npm run lint` 0 avisos · `npx vitest run` 265 archivos, 3.073 pruebas en verde (4 saltadas).

---

## 1 · Resumen

1. El estado general es bueno: los motores están bien aislados, puros y con pruebas (224 archivos de test en `utils/`), y las fórmulas que se comprueban a mano (1RM con RIR, IF/IEM del CDG, Mifflin, Keytel, TRIMP, semanas ISO) salen exactas.
2. Donde falla es en la **capa nueva de recetas por alimentos** (26-10) y en la **coherencia entre motores** que calculan lo mismo de dos formas distintas.
3. **Crítico 1 — emparejado automático erróneo subido a producción:** `Calabaza → Pipas de calabaza` en 144 recetas (+213 a +1.599 kcal por receta; «Crema de calabaza» pasó de 255 a 1.302 kcal), `Tomate seco → Lechuga y tomate` en 47 y `Arroz basmati/integral` (sin estado) → `…cocido` en 134 (−118 kcal de mediana).
4. **Crítico 2 — el índice guarda un solo `porCien` por alimento** y gana la versión vieja (de intercambios) de las 79 Rápidas: para 34 alimentos corrientes (aceite, pollo, arroz, pasta, huevo, pan, plátano, salmón…) el generador y el diario calculan kcal distintas de la ficha en 4.138 de 8.103 recetas vinculadas (993 con más de 20 kcal, 231 con más de 50).
5. **Alto — la «semana de mantenimiento» suma +25 g de hidratos por COMIDA:** con la decisión de que el coach pauta solo el objetivo (dieta sin comidas) suma +0 kcal; con las 5 comidas fijas, +500 kcal sea cual sea el déficit.
6. **Alto — las propuestas de dieta del asistente no se pueden aprobar:** el prompt le ordena mandar `meals` vacío y la tarjeta bloquea la aprobación con «La dieta se ha quedado sin comidas». Y si se desbloquea, aprobar un ajuste sobre una dieta existente le borra las comidas que Dani tuviera colocadas.
7. **Alto — dos adherencias de dieta:** por kcal (Revisión, asistente) y por líneas marcadas (reportes, retos, proyección de peso y «gasto real» de la periodización). La segunda da ~100 % siempre desde que lo que el atleta añade nace marcado; el reto «Clava tu dieta al 97 %» se cumple solo.
8. **Alto — cambio de hora:** las cadencias «cada N días» (cuestionarios, fotos, días del plan) se calculan con `Math.floor` sobre medianoches locales y se desplazan un día desde finales de marzo hasta finales de octubre.
9. El generador de menús (banco de 1.134 días) cuadra bien: desvío mediano de 22 kcal, 5 % de días fuera de tolerancia, 0 repeticiones con variedad 3-5. Falla con vegano (32 % fuera) y «poco tiempo» (14 % fuera, 30 comidas vacías, hasta 924 kcal de acompañamientos en un día) porque los filtros se aplican después de recortar el pool a 300.
10. Los cinco problemas más graves, por orden: (1) emparejado calabaza/tomate seco/arroz, (2) `porCien` único en el índice, (3) mantenimiento por comida, (4) dieta del asistente no aprobable y borrado de comidas, (5) adherencia por líneas en retos/reportes/proyección. Después: cambio de hora, kcal de fase desde intercambios (pierde los mixtos), generador con filtros duros.

---

## 2 · Tabla de motores

| Motor | Archivo | Veredicto | Hallazgos | Tests |
|---|---|---|---|---|
| Macros y datos viejos | `utils/macros.ts`, `macrosLegado.ts`, `conversionNutricional.ts`, `gramosDeAlimento.ts`, `alimentosGenerales.ts`, `catalogoAlimentos.ts`, `migracionKcal.ts` | ✅ | 0 | macros, macrosLegado, conversionNutricional, gramosDeAlimento, alimentosGenerales, catalogoAlimentos, migracionKcal |
| Día del atleta y adherencia | `diaDeDieta.ts`, `resumenDelDia.ts`, `diarioCalorias.ts`, `objetivoDelDia.ts`, `registroDesdeElMenu.ts` | ⚠️ | 2 (A4 raíz, B4) | diaDeDieta, resumenDelDia, diarioCalorias, objetivoDelDia, registroDesdeElMenu, paridadDeCaminos |
| Generador de menús | `menuEngine.ts`, `menuMacros.ts`, `menuComplements.ts`, `slotWeights.ts`, `menuShoppingList.ts`, `services/menuSemanalAutomatico.ts` | ⚠️ | 4 (A7, M2, M3, B7) | menuEngine (75 casos), menuExtras, slotWeights, ajusteEnMenu, topeDeExtras |
| Recetas vinculadas | `recetaVinculada.ts`, `ajusteDeReceta.ts`, `recetaDesglosada.ts`, `macrosDeReceta.ts`, `db/recetasHidratacion.ts`, `scripts/vincularTodas.ts`, `scripts/generarIndiceRecetas.mjs` | ❌ | 4 (C1, C2, M1, M2) | recetaVinculada, ajusteDeReceta, recetaDesglosada, macrosDeReceta, escalarRecetaEntera · **sin test** el índice generado ni `vinculoAutomatico` contra el recetario real |
| Recetas: cambio, colecciones, selección | `recipeMatch.ts`, `coleccionesRecetario.ts`, `seleccionDeRecetas.ts`, `grupoDeReceta.ts` | ✅ | 0 | recipeMatch, coleccionesRecetario, seleccionDeRecetas, grupoDeReceta |
| Periodización nutricional | `semanasNutricion.ts`, `nutritionPeriodization.ts`, `ajusteDeCupo.ts`, `fasesNutricion.ts`, `comidaDeLaSemana.ts`, `nutritionAnalysis.ts` | ❌ | 6 (A1, A6, M4, M9, B9, B10) | semanasNutricion, nutritionPeriodization.recentDietAdherencePct (solo eso), ajusteDeCupo, fasesNutricion, comidaDeLaSemana, nutritionAnalysis |
| Objetivo corporal y gasto real | `objetivoDeFase.ts`, `verificacionObjetivo.ts`, `ritmoDePeso.ts`, `gastoReal.ts` | ⚠️ | 2 (M5, CR1) | objetivoDeFase, verificacionObjetivo, ritmoDePeso, gastoReal, historialObjetivos |
| Mesociclos y repartos | `calculadoraReparto.ts`, `trainingSplits.ts`, `distribucionDeMeso.ts`, `programacion.ts`, `semanasDelBloque.ts`, `asignacionMesociclo.ts`, `cicloDelAtleta.ts`, `cierreMesociclo.ts`, `scheduleEngine.ts` | ⚠️ | 4 (A5, M6, M7, B12) | calculadoraReparto, trainingSplits (+frecuencias), programacion, semanasDelBloque, asignacionMesociclo, cicloDelAtleta, cierreMesociclo, scheduleEngine, repartidor |
| Progresión y volumen | `progression.ts`, `volumeSuggestion.ts`, `volumeHistory.ts`, `seleccionEjercicios.ts`, `tecnicaDeSerie.ts`, `sesionEnCurso.ts` | ⚠️ | 2 (M11, CR4) | progression, volumeSuggestion, volumeHistory, seleccionEjercicios, tecnicaDeSerie, sesionEnCurso |
| Motor CDG | `utils/cdg/*` | ✅ | 1 (CR5) | cdg (hoja real), progresionIem, zonas, estimulo, integracion, agujetas (vigencia), programacion, emparejado, lecturaBloque, fichaEjercicio, borradorIem, cargaCruzada, tipificacion, zonasDesplegables |
| Cardio | `cardioProgression.ts`, `cardioMetrics.ts`, `cardioSession.ts` | ✅ | 0 | cardioProgression, cardioMetrics, cardioSession, cardioZones, cardioHistory, cardioAplazos |
| Revisión e informes | `revisionCoach.ts`, `revisionSemanal.ts`, `titularesRevision.ts`, `reportBuilder.ts`, `trainingReport.ts`, `reportNarrative.ts`, `reportExtras.ts`, `athleteMetrics.ts` | ⚠️ | 3 (A4, M5, B13) | revisionCoach, revisionSemanal, titularesRevision, trainingReport, reportNarrative, reportExtras, athleteMetrics · **sin test** reportBuilder |
| Calidad del plan, setup, historial | `calidadDelPlan.ts`, `clientSetup.ts`, `recorridoDelPlan.ts`, `cambiosAtleta.ts` | ⚠️ | 3 (A2 parte, M8, B10) | calidadDelPlan, clientSetup, recorridoDelPlan, cambiosAtleta |
| Latido diario | `api/latido-diario.ts`, `utils/latidoDiario.ts` | ✅ | 0 | latidoDiario (+sinNavegador) |
| Retos | `challengeOptions.ts`, `motorRetoSemanal.ts`, `challengeMemory.ts` | ⚠️ | 1 (A4) | challengeOptions, motorRetoSemanal, challengeMemory, weeklyChallenge, ensureWeeklyChallenge |
| Calendario y bandeja | `roadmapCalendar.ts`, `planEvents.ts`, `accionesCalendario.ts`, `questionnaireSchedule.ts`, `bandejaDelDia.ts` | ⚠️ | 2 (A5, B13) | roadmapCalendar, planEvents, accionesCalendario, questionnaireSchedule, bandejaDelDia |
| Asistente: tools y validadores | `ai/tools.ts`, `ai/validators.ts`, `ai/repartoAsistente.ts`, `ai/cambiosPropuesta.ts` | ⚠️ | 3 (A2, A3, B14) | validators, repartoAsistente, cambiosPropuesta, tools (parcial) |
| Asistente: prompt, tareas, perfil | `ai/systemPrompt.ts`, `ai/doctrina.ts`, `ai/tareas.ts`, `ai/perfilProgramacion.ts` | ⚠️ | 3 (A2, CR1, CR2) | doctrina, recorridoDelPlan (fija el guion), perfilProgramacion |
| Aprobación y deriva | `components/ai/useProposalActions.ts`, `edicionPropuesta.ts`, `derivaPropuestas.ts` | ⚠️ | 3 (A2, A3, B15) | edicionPropuesta, derivaPropuestas · **sin test** useProposalActions |

---

## 3 · Hallazgos

### CRÍTICO

**C1 · El emparejado automático vinculó mal alimentos de uso diario, y está en producción.**
- `src/utils/recetaVinculada.ts:168-183` (`emparejar`) y `:458-492` (`vinculoAutomatico`). Un alimento del catálogo cuya mitad de palabras aparece en el ingrediente y que «explica» todo el ingrediente sale con confianza `media` (`:181`), y `vinculoAutomatico` acepta `media` (`:481`). «Calabaza» contra «Pipas de calabaza»: `explica = 1`, `cubre = 0,5` → media → vinculado.
- Caso: `Crema de calabaza y zanahoria con queso feta y pipas de calabaza`, ingrediente «Calabaza 200 g» → 1.118 kcal puestas (pipas, 559 kcal/100 g) → correcto 52 kcal (calabaza, 26 kcal/100 g). La receta pasó de 255 a 1.302 kcal (`vinculo.antes.kcal` → `kcal`). Medido sobre los JSON: **144 recetas**, desvío por receta mediana +533 kcal (mín +213, máx +1.599).
- Mismo mecanismo: «Tomate seco» → «Lechuga y tomate» (47 recetas, −97 kcal de mediana; 60 g de tomate seco son 155 kcal reales y 10 puestas); «Arroz basmati» / «Arroz integral» sin estado escrito → «…cocido» (134 recetas, −118 kcal de mediana: 60 g de arroz integral seco son 216 kcal reales y 74 puestas; `Arroz integral / Tofu…` bajó de 396 a 281 kcal). La calabaza, además, es **palanca de grasa** (`KCAL_MIN_PALANCA = 70` en `:458`): el generador puede «subir calabaza» para cuadrar la grasa.
- Afecta: atleta (ficha, diario desglosado, menú), coach (editor de menús), datos (Firestore `recipes` y el índice, subidos con `--firestore` el 26-10).
- Arreglo: (1) en `emparejar`, un candidato solo puede ser `media` si **todas** sus palabras están en el ingrediente (`cubre === 1`); el caso `explica === 1 && cubre >= 0,5` pasa a `baja`. (2) Si el ingrediente no escribe estado y en el catálogo hay dos entradas del mismo nombre con estados distintos (`arroz integral crudo/cocido`), devolver `baja` (ambiguo). (3) `vinculoAutomatico` solo acepta `alta`, más una lista blanca revisada de sinónimos de `media` que sí son correctos (`Salsa de soja (tamari) → Salsa de soja`, `Almendras al natural → Almendras`, `Garbanzo cocido envasado → Garbanzos (cocido)`, `Atún en lata (al natural) → Atún al natural`…). (4) Volver a vincular en seco, revisar `scripts/out/vincular-dudas.csv`, `--aplicar`, regenerar el índice y resubir con OK de Dani.
- Test: `recetaVinculada.test.ts` — `emparejar('Calabaza', [calabaza, pipas-de-calabaza])` → `calabaza` con `alta`; `emparejar('Tomate seco', [lechuga-y-tomate])` → `baja`; `emparejar('Arroz integral', [arroz-integral-crudo, arroz-integral-cocido])` → `baja`; test de regresión que recorre `public/recetas/*.json` y falla si alguna receta tiene un ingrediente «calabaza» vinculado a «pipas» o un kcal/100 g del alimento >10× el esperado por familia.

**C2 · El índice guarda un único `porCien` por alimento y gana la versión equivocada.**
- `scripts/generarIndiceRecetas.mjs:112`: `ALIMENTOS.set(id, porCien)` por cada receta → el último archivo gana. El último es `recetas_05_basicas_p01.json` (79 Rápidas vinculadas el 24-10 con el catálogo viejo, derivado de intercambios); las 8.041 restantes se vincularon el 26-10 con valores reales. 34 alimentos tienen dos versiones (`aceite-de-oliva-listo` 884 vs 900 kcal; `pechuga-de-pollo-crudo` 110/23 p vs 100/25 p; `arroz-seco` 360/6,7 p/80 hc vs 333/0/83,3; `pasta-seco` 360/12,5 p vs 333/0; `huevo-crudo` 143/12,6 vs 166/20,8; `pan-listo` 265/9 vs 250/0; `platano-listo` 89 vs 100; también salmón, leche, merluza, atún, jamón, garbanzos, lentejas, aguacate, miel, manzana, avena…). El índice quedó con la versión vieja en todos ellos (comprobado en `public/recetas-indice.json`).
- Caso: `Salmón a la plancha / Arroz / Espárragos trigueros` — ficha 585 kcal; suma con el `porCien` del índice 476 kcal (−109, −19 %). Sobre las 8.103 recetas vinculadas con macros: 4.138 con |Δ| > 5 kcal, 993 > 20, 231 > 50; 2.921 con |Δ proteína| > 3 g.
- Dónde se ve: `src/db/recetasHidratacion.ts:148` inyecta ese `porCien` en `vinculo.ingredientes`; `menuEngine.ts:402-431` (`mejorEscalaAjustada`) calcula las kcal del plato con él (3.934 de 4.506 comidas del banco pasan por ajuste), y `NutritionScreen.tsx:1841` no baja la receta completa si el índice trae `vinculo`, así que el diario desglosa con los valores viejos. Resultado: la ficha dice 585, el menú/diario 476.
- Afecta: atleta, coach, asistente (lee kcal de recetas por el índice).
- Arreglo: (1) `scripts/vincularRecetas.ts recalcular` sobre las 79 Rápidas con el catálogo actual (su `antes` ya está guardado y no se pisa); (2) en `generarIndiceRecetas.mjs`, si dos recetas traen `porCien` distinto para el mismo `alimentoId`, abortar con la lista (no silenciar); (3) hasta entonces, en `hidratarEntradaIndice` no inyectar `porCien` cuando difiera… (no aplica si se hace 1+2).
- Test: nuevo `scripts/generarIndiceRecetas.test.ts` (o `db/recetasHidratacion.test.ts`) que carga `public/recetas-indice.json`, hidrata cada receta con `vin` y comprueba `suma(porCien × gramos) == kcal ± 3` y `p/hc/g ± 1,5 g` para el 100 %.

### ALTO

**A1 · La semana de mantenimiento depende del número de comidas; con dieta sin comidas no hace nada.**
- `src/utils/semanasNutricion.ts:131`: `mantenimiento ? meals.map(… delta: 1)` → un ajuste de +25 g de HC por cada comida de la dieta.
- Caso (medido): objetivo P150/HC200/G70 = 2.030 kcal; con 5 comidas → 2.530 kcal (+500); con 3 → 2.330; con **0 comidas → 2.030 (sin cambio)**. La decisión del 26-10 es que el coach pauta el objetivo, no los alimentos: las dietas nuevas no tienen comidas, así que «Semana de mantenimiento» no sube nada. La UI lo anuncia (`SemanasNutricionCoach.tsx:349` «ya incluye +25 g de hidratos por comida»), pero el mensaje es falso en ese caso, y con 5 comidas suma +500 kcal independientemente del déficit (un déficit de 300 kcal pasa a superávit de 200).
- Afecta: atleta (objetivo del día), coach, menú automático (`semanaQueNecesitaMenu` firma «m: true»).
- Arreglo: la semana de mantenimiento se aplica sobre el objetivo, no sobre las comidas: `g.hc += gramosDeMantenimiento`, con `gramosDeMantenimiento = round((mantenimientoKcal − objetivo.kcal) / 4)` si hay gasto (real o fórmula) y, si no, un valor explícito guardado en `program.mantenimientoG` (por defecto 100 g = 400 kcal, no «por comida»). Las comidas, si las hay, reciben el reparto como ahora.
- Test: `semanasNutricion.test.ts` — dieta sin comidas + `mantenimiento` → `objetivo.hc` sube; dieta con 3 y con 5 comidas → mismo objetivo final.

**A2 · Las propuestas de dieta del asistente no se pueden aprobar desde la tarjeta.**
- `src/ai/systemPrompt.ts:17` («Manda objetivo… y deja meals vacío»), `src/ai/tools.ts:3751` (`meals` siempre `[]` si no vienen) y `src/utils/edicionPropuesta.ts:186`: `motivoParaNoAprobar('diet')` devuelve «La dieta se ha quedado sin comidas» → `ProposalCard.tsx:54/151` deshabilita Aprobar y `useProposalActions.ts:640` para «Aprobar todas». La única salida es «Abrir en el editor de dietas».
- Lo mismo en `src/utils/calidadDelPlan.ts:141-146`: dieta activa sin comidas = defecto que **bloquea** («presupuesto de intercambios puesto pero ninguna comida»), mientras `exchangeHelpers.ts:122` (`isDietPending`) ya dice desde 10-2026 que sin alimentos es «los eliges tú».
- Afecta: coach (flujo «Montar el primer mes» se para en el paso 4), asistente.
- Arreglo: quitar la regla de `meals.length === 0` en `motivoParaNoAprobar` (dejar la de descuadre solo si hay líneas), y en `calidadDelPlan` eliminar `dieta_activa_sin_comidas` o bajarla a `revisa` con texto en kcal.
- Test: `edicionPropuesta.test.ts` — `motivoParaNoAprobar('diet', { objetivo, budget, meals: [] })` → `null`; `calidadDelPlan.test.ts` — dieta activa sin comidas no bloquea.

**A3 · Aprobar un ajuste de dieta sobre una existente borra sus comidas.**
- `src/ai/tools.ts:3751` + `:2290-2300` (`dietaDePropuesta` con `meals: []`) → `useProposalActions.ts:143` `updateDiet(baseEntityId, dietPayload)` escribe `meals: []` encima de la dieta base (`db/nutrition.ts:460` hace `{...d, ...updates}` y `updateDoc` con ese campo).
- Caso: dieta «Déficit» con 5 comidas colocadas por Dani; el asistente propone «bajar 25 g de HC» (`propose_diet_update` con `base_diet_id`); al aprobar, la dieta queda con objetivo nuevo y **0 comidas**. Hoy no ocurre solo porque A2 bloquea la aprobación; en cuanto A2 se arregle, aparece.
- Afecta: coach, atleta (su plan del día se vacía), datos.
- Arreglo: en `proposeDietUpdate`, si `propuesta.meals` no viene y hay `base`, no incluir `meals` en el payload (o copiar `base.meals`); en la aprobación, con `baseEntityId` escribir solo `objetivo` + `budget` (+ `meals` si la propuesta las trae).
- Test: `useProposalActions` no tiene test; añadir uno de `dietaDePropuesta`/`proposeDietUpdate` que compruebe que sin `meals` no se pisa `base.meals`.

**A4 · Dos adherencias de dieta que no coinciden; la de líneas se autocumple.**
- Por kcal (`diaDeDieta.ts:94-118` `adherenciaPorKcal`): Revisión (`nutritionAnalysis.ts` → `computeAdherenceRate`) y asistente (`get_nutrition_analysis`). Por líneas marcadas (`adherenciaDelDia`): `reportExtras.ts:97` (sección Nutrición de los reportes al atleta), `athleteMetrics.ts:160` → `challengeOptions.ts:380` (reto «Clava tu dieta esta semana»), `nutritionPeriodization.ts:138` (curva «con adherencia» y `computeRealMaintenanceKcal`), `conditions.ts`, `planPhase.ts`, `roadmapCalendar.ts`.
- Caso (medido): día con objetivo 2.030 kcal, tres líneas (pollo 165 kcal, aceite 45 kcal marcadas; arroz 300 kcal sin marcar) → **66,7 %** por líneas, **10,3 %** por kcal. Y desde que en «Mi plan» lo añadido nace marcado, por líneas sale 100 % coma lo que coma (lo dice el propio comentario de `diaDeDieta.ts:66-78`).
- Afecta: atleta (reporte «dieta al 100 %» y reto de adherencia que se gana solo), coach (proyección de peso «con adherencia»), asistente (lee los retos).
- Arreglo: sustituir `adherenciaDelDia` por `adherenciaPorKcal(...)?.pct` en los cinco consumidores (null = día sin objetivo, se excluye de la media); en retos, `target` con tope 110 % y mínimo 60.
- Test: `reportExtras.test.ts`, `athleteMetrics.test.ts`, `nutritionPeriodization` con el caso de arriba → 10 %.

**A5 · Cambio de hora: las cadencias por intervalo se desplazan un día medio año.**
- `src/utils/scheduleEngine.ts:73` (`isDueToday` interval), `src/utils/questionnaireSchedule.ts:96` (`ultimoPulso` interval → `hasAnsweredThisOccurrence`, `isOverdue`), `src/utils/clientSetup.ts:164` y `:409` (días del plan y días hasta vencer): `Math.floor((hoy − inicio) / 86400000)` con fechas construidas a medianoche LOCAL. Entre el cambio de marzo y el de octubre la diferencia es `n días − 1 h` y `floor` da `n − 1`.
- Caso (medido con TZ Europe/Madrid, 2026): intervalo de 7 días desde el 20-03 → vence el 27-03 (bien), el **03-04 no**, el **04-04 sí** (sábado), el 10-04 no, el 11-04 sí… hasta el 25-10. «Cada 14 días» desde el 13-03: el 10-04 no está vencido, el 11-04 sí. Las plantillas de cuestionarios usan `interval` con `cadaNSemanas × 7` (`plantillasCuestionarios.ts:194`) y el check-in rápido `interval 7` (`CheckInScreen.tsx:229`).
- Afecta: atleta (cuestionario que no aparece el día que toca y aparece al siguiente), coach (`isOverdue`, pasos «semana 1» de la checklist desplazados).
- Arreglo: usar `diasEntreFechas` de `trainingWeek.ts:75` (mediodía) o `Math.round` en los cuatro sitios.
- Test: `scheduleEngine.test.ts` y `questionnaireSchedule.test.ts` con reloj falso en `2026-04-03` y `2026-04-10` → `isDueToday` true; `clientSetup.test.ts` con plan iniciado el 20-03 y hoy 03-04 → día 14.

**A6 · Las kcal de una fase salen de los intercambios sin mixtos y sin `objetivo`.**
- `src/utils/nutritionPeriodization.ts:52` `resolvePhaseTargetKcal`: `exchangeToKcal(diet.budget)` (solo HC/PROT/GRASA). Lo usan `buildPhaseEnergyPlans` → `NutritionPeriodizationPanel`, `NutritionPerformanceDashboard`, `NutritionPlansScreen`, `AthleteRoadmapScreen`, `planNutritionBridge`, `useRetoDeLaSemana` y `get_diet` del asistente.
- Caso (medido): dieta vieja `{HC 6, PROT 4, GRASA 3, MIX_HC 4, MIX_GRASA 2}` → fase a **1.297 kcal**; `objetivoDeDieta` (lo que ve Nutrición y el diario) → **1.896 kcal**. 600 kcal de diferencia entre dos pantallas del mismo atleta. Mismo patrón en `nutritionAnalysis.ts:213` (`computeMacroDeviation` usa `budget × 25`, ignora `objetivo` y mixtos).
- Afecta: coach (panel de periodización, proyección, alertas de macros), atleta (roadmap), asistente.
- Arreglo: `kcalDeDieta(diet)` en `:52`; `objetivoDeDieta(diet)` en `nutritionAnalysis.ts:213`.
- Test: `nutritionPeriodization.test.ts` nuevo con la dieta de arriba → 1.896; `nutritionAnalysis.test.ts` con dieta con `objetivo`.

**A7 · El generador falla con filtros duros porque se filtra después de recortar a 300.**
- `src/db/recipes.ts:387-410` (`queryRecetasForGenerator`) devuelve 300 recetas por franja barajadas; `menuEngine.ts:459-470` (`rankCandidates`) aplica después vegano/condiciones/tiempo/alergias. Con vegano quedan ~20-40 por franja; con «≤15 min + Rápidas» menos.
- Caso (banco de 1.134 días, ver §5): vegano 32 % de días fuera de tolerancia (a 3.000 kcal, 11 de 21; a 3.600, 10 de 21; proteína −80 g en el peor día); «poco tiempo» 14 % fuera, 30 comidas vacías, acompañamientos de 185 kcal/día de media y **924 kcal** en un día (5 comidas × 300 kcal de tope cada una, `menuEngine.ts:100/718`); día de 3.000 kcal con −419 kcal y −82 g de HC.
- Afecta: atleta vegano o con poco tiempo, coach.
- Arreglo: pasar a `queryRecetasForGenerator` el predicado de filtros duros (`dietType`, `conditions`, `allergies`, `cookingMaxTime`) y aplicarlo **antes** del `slice(0, 300)` (ya hay un mecanismo parecido con `tambien`); y un tope de acompañamientos por DÍA (p. ej. 400 kcal), no solo por comida.
- Test: `menuEngine.test.ts` con pool de 300 en el que solo 15 son veganas → todas las franjas con receta.

### MEDIO

**M1 · Palancas con `min` mayor que los gramos de la receta.**
- `src/utils/recetaVinculada.ts:186` (`redondear5 = max(5, …)`) y `:200`. Aceite 3 g → `{min 5, max 5}`; 1.100 palancas del índice tienen `min > gramos` (sobre todo aceite, 4.283 recetas con aceite como palanca). `ajusteDeReceta.ts:99` (`limitar`) sube siempre a 5 y `:108` lo cuenta como cambio.
- Caso (medido): receta pollo 150 g + aceite 3 g, objetivo = la receta tal cual → resultado «Aceite 3 → 5 g (faltaba grasa)», +2 g de grasa que nadie pidió.
- Arreglo: `min = Math.min(gramos, redondear5(gramos × 0,5))`, `max = Math.max(gramos, …)`; en `ajustarReceta`, no mover un ingrediente cuyo `delta` sea 0.
- Test: `recetaVinculada.test.ts` `propuestaDeRango(3, aceite)` → `min ≤ 3`; `ajusteDeReceta.test.ts` objetivo igual a la receta → `cambios = []`.

**M2 · El ajuste por alimento produce platos raros en los extremos.**
- `src/utils/menuEngine.ts:402-431` + `ajusteDeReceta.ts`. En el banco: 405 comidas con la palanca de HC recortada por debajo del 60 % (Goulash / arroz blanco: arroz 50 → 25 g, patata 113 → 65 g, plátano 100 → 50 g), 191 con aceite ≥ 30 g tras el ajuste (boniato con pollo ×3,75: aceite 19 → 34 g), 1.820 de 10.857 palancas en su tope (mín o máx), 313 comidas a escala ≥ 3,5 (plato mediano 1.133 kcal, máx 1.896) y 375 a escala 0,5 (193 de ellas por debajo de 200 kcal: «media tostada», «medio muffin»).
- Arreglo (criterio): escalar primero y permitir palancas solo ±30 % (no ×0,5-×2); aceite con `max = gramos + 10`; escala mínima 0,75 para platos < 250 kcal (mejor otra receta que medio bocadillo); escala máxima 3 para platos > 450 kcal.
- Test: banco reproducible (semilla fija) con umbrales: 0 aceites > 30 g, 0 palancas HC < 70 %.

**M3 · Dos «gasto real» y dos proyecciones distintas.**
- `nutritionPeriodization.ts:377` (`computeRealMaintenanceKcal`: `targetKcal × adherencia por líneas`, dos puntos de peso) vs `gastoReal.ts` (kcal registradas, regresión, ventana de 4 semanas, umbral de infra-registro). `NutritionPerformanceDashboard.tsx` enseña el primero; `revision/GastoReal.tsx` el segundo. Con adherencia por líneas ≈ 100 %, el primero es «target − Δpeso×7700/días», que no mide nada.
- Arreglo: borrar `computeRealMaintenanceKcal` y la curva `expectedAdherence` de la proyección; usar `calcularGastoReal`/`evolucionDelGasto` en el dashboard.

**M4 · Cuatro estimadores del cambio de peso.**
- `reportExtras.ts:41` (último antes del periodo → último del periodo), `revisionCoach.ts:517` (media de la ventana vs media de la anterior), `verificacionObjetivo.ts` (mediana con 3+ pesajes y regresión), `nutritionAnalysis.ts` `computeWeightTrend` (primero/último dentro de la ventana) y `ritmoDePeso.ts:103` (primero − último de medias). Un mismo atleta con un 83 suelto entre 81 sale con «+1,2 kg» en el reporte y «en rango» en Cuerpo.
- Arreglo: una `pesoDeVentana(logs, desde, hasta)` (mediana ≥3, media <3) en `verificacionObjetivo` reutilizada por los cuatro; `ritmoReal` por regresión.

**M5 · El cierre de mesociclo compara lo hecho con el bloque entero aunque esté en curso.**
- `src/utils/cierreMesociclo.ts:133` `programadas = semanales × meso.weeks` con `enCurso = hoy <= fin` (`:91`). Semana 2 de 8 → «Hizo el 25 % del volumen programado». Además `:125` filtra logs por fecha, no por `mesocycleId`.
- Arreglo: `programadas = semanales × min(weeks, semanasVividas)` cuando `enCurso`; filtrar por `mesocycleId` con fallback a fechas.
- Test: `cierreMesociclo.test.ts` con hoy en la semana 2 → `pct` sobre 2 semanas.

**M6 · Tres constantes para «series por sesión y grupo» y ninguna es la de la doctrina.**
- `programacion.ts:342` `SERIES_POR_SESION_Y_GRUPO = 6`, `calculadoraReparto.ts:35` `/ 6`, `volumeSuggestion.ts:71` `SERIES_POR_SESION = 8`; doctrina §3: «8-12 series por músculo y sesión», §5: «2 por grupo por defecto; sube a 3 solo si no cabe». Con 15 series de pecho `frecuenciaPorDefecto` propone 2,5 (ciclo de 14 días) y `sesionesDelGrupo` 3; con 8 por sesión serían 2.
- Arreglo: una sola constante (8) exportada desde `volumeSuggestion.ts` y usada en las tres.

**M7 · Historial de cambios del coach: nunca lista alimentos y enseña intercambios.**
- `src/utils/cambiosAtleta.ts:50` lee `item.name` (el campo es `foodLabel`) → «Añade/Quita …» no sale nunca; `:62-66` enseña «Proteína 6 → 7 int.» en vez de gramos.
- Arreglo: `foodLabel` y `objetivoDeDieta` en gramos. Test: `cambiosAtleta.test.ts` con dos dietas que difieren en un alimento → una línea «Añade …».

**M8 · Textos de intercambios que siguen llegando al coach y al asistente.**
- `nutritionAnalysis.ts:289` («…de su cupo de intercambios…», lo lee el asistente en `alertas`), `calidadDelPlan.ts:144` («presupuesto de intercambios»). Cambiar a «objetivo».

**M9 · Dos tolerancias de «día en objetivo».**
- `diaDeDieta.ts:121` ±10 % (`enObjetivo`) y `comidaDeLaSemana.ts:104` ±100 kcal (`TOLERANCIA_DIA`, titulares «se pasó del cupo N días»). A 2.600 kcal son 260 vs 100 kcal. Unificar (sugiero ±10 % con mínimo 100).

**M10 · `volumeHistory` compara series ponderadas con series programadas.**
- `src/utils/volumeHistory.ts:161` `performed = sets ponderados (secundario 0,5) / semanas` vs `planned` (solo principal). Infla lo hecho un 20-40 % y la regla «adherencia < 70 % → techo en lo hecho» rara vez recorta. Usar `seriesRealizadasPorGrupo` / semanas.

**M11 · Catálogo de alimentos: hay al menos dos versiones circulando.**
- La copia `copia-catalogo-2026-10-26.json` (468 alimentos) difiere del índice en 93 de 396: `almendras-listo` 660 kcal/**0 p/0 hc**/73 g, `avellanas-listo` igual, `pasta-seco` 333/0/83/0, `aceitunas-escurrido` 165/0/0/18 (valores derivados de intercambios, `fuente: "intercambios"`). No he podido leer Firestore: si ese es el catálogo vivo, un atleta que apunta 30 g de almendras desde «Buscar alimento» registra 0 g de proteína, y `recetaDesglosada` (camino 3, `repartirReceta`) reparte con esos valores. Comprobar `catalogoAlimentos` en consola antes de la tanda 1 y, si es la copia, reimportar el CSV real.

### BAJO

- **B1** `menuEngine.ts:428`: `ajuste.gramos` se redondea después de calcular `macros` → 396 comidas del banco con 4-5 kcal entre `macros` y la suma de sus gramos. Recalcular `macros` tras redondear.
- **B2** `menuEngine.ts:979`: al cambiar un plato se busca contra el plato actual, no contra lo que la comida necesita → se replica el desencaje del plato que se sustituye. Usar `objetivoDeLaComida(meal)`.
- **B3** `objetivoDelDia.ts:102-105`: `gramos` se derivan del cupo (0,01 intercambios = ±0,25 g) en vez de `objetivoDeDieta`. Cosmético.
- **B4** `comidaDeLaSemana.ts:213`: el «desvío por comida» reparte el objetivo a partes iguales entre comidas, ignorando `slotWeights` (20/10/38/10/27) → la cena siempre sale «por encima».
- **B5** `bandejaDelDia.ts:128/189` (`!approved || !feedback`) vs `revisionCoach.ts:56` (`approved || feedback`): un check-in aprobado sin texto queda «revisión pendiente» para siempre en la bandeja.
- **B6** `clientSetup.ts:407`: `new Date(y, m−1+meses, d)` desborda (31-08 + 3 meses = 1-12); usar fin de mes.
- **B7** `menuEngine.ts:100`: tope de acompañamientos por comida (300 kcal) pero no por día (ver A7).
- **B8** `programacion.ts:440`: «días seguidos» no mira el salto de vuelta (último día del ciclo y primero del siguiente); `gruposEnDiasSeguidos` sí lo hace.
- **B9** `semanasNutricion.ts` `salidaDeDeficit`/`bajadaProgresiva`: pasos fijos de 25 g HC/11 g G (≈100 kcal) por semana sin mirar el peso del atleta; para 55 kg es un 7 % del gasto, para 110 kg un 3 %. Escalar por kcal (2-4 %).
- **B10** `calidadDelPlan.ts:141` (ver A2) y `clientSetup.ts` `prog_calendario_dietas` cuenta «hecho» con 1 día de 7 puesto.
- **B11** `useProposalActions.ts:293`: la nota del «día señalado» solo se guarda si ya hay sesión ese día; si el bloque se publica después, se pierde sin aviso.
- **B12** `scheduleEngine.ts` `monthly` con `dayOfMonth 31` en febrero: `isDueToday` nunca (compara `getDate() === 31`); `proximaOcurrencia` sí recorta. Unificar.
- **B13** `titularesRevision.ts:124`: «lo que más sube» usa el mejor 1RM de ejercicio de la ventana contra la anterior; con 3 series mínimas una serie de calentamiento mal apuntada (RIR vacío = 0) puede ser el «récord». Exigir `s.weight > 0` y `repsDone ≥ 3`.
- **B14** `ai/tools.ts:2619`: `number = existing.length + 1` → tras borrar un mesociclo se repite el número. Usar `max(number) + 1`.
- **B15** `derivaPropuestas.ts` y `edicionPropuesta.ts` comparan fases por `name`: renombrar una fase cuenta como «quitó la fase». Comparar por posición cuando el número de fases coincide.
- **B16** `recetaVinculada.ts:181`: 0 emparejados con confianza `baja` en la muestra (correcto), pero «Levadura → Levadura de cerveza» (179 recetas, inocuo en kcal) y «Pan integral → Pan integral sin gluten» (287, ±5 %) muestran que `media` mezcla sinónimos buenos con malos: por eso C1 propone lista blanca.

---

## 4 · Mejoras de criterio

**CR1 · Proteína (doctrina §7, `ai/doctrina.ts:327`): 0,8-1 g/kg en volumen/mantenimiento y 1-1,4 en déficit.** La evidencia sitúa el punto de inflexión para hipertrofia en ~1,6 g/kg/día (Morton et al., 2018, Br J Sports Med, metaanálisis de 49 ECA; intervalo superior ~2,2) y en déficit entre 1,6 y 2,4 g/kg para conservar masa magra (Helms et al., 2014, IJSNEM: 2,3-3,1 g/kg de masa magra en atletas magros; Longland et al., 2016, AJCN: 2,4 vs 1,2 g/kg en déficit del 40 %, más músculo y más pérdida de grasa con 2,4). La propia app ya calcula 2 g/kg en el alta (`energyCalc.ts` `computeAuto`), así que la doctrina y el motor se contradicen: el asistente propondrá 80 g de proteína a un hombre de 80 kg mientras el alta le puso 160. Propuesta: 1,6-2,2 g/kg (2,0-2,4 en déficit profundo o atleta magro), y que `validators.ts` avise por debajo de 1,4 g/kg cuando conozca el peso.

**CR2 · Ritmo de volumen: doctrina 0,2 %/sem (150-250 g) vs `verificacionObjetivo.ts:46` 0,25-0,4 %/sem.** Para 80 kg la doctrina dice 160 g y el motor da por «lento» todo lo que no llegue a 200 g y por bueno hasta 320 g. Alinear ambos (0,2-0,35 %/sem está dentro de lo que recomiendan Iraki et al., 2019, Sports, y Helms, 2014: 0,25-0,5 % para principiantes/intermedios, menos para avanzados).

**CR3 · Déficit (doctrina §6: techo 700 kcal) y la semana de mantenimiento (A1).** Un diet break de 1-2 semanas a mantenimiento real reduce la adaptación (MATADOR, Byrne et al., 2018, IJO: más pérdida de grasa y menor caída del gasto con periodos de 2 semanas a mantenimiento). El motor debería llevar las kcal al gasto real medido (`gastoReal.ts` ya lo calcula), no sumar un fijo.

**CR4 · Descarga (doctrina §11: 1 serie en complejos, 2 en el resto; `progression.ts:209`: la mitad redondeando arriba).** Con 4 series sale 2 en todo. Coinciden en espíritu (volumen −40/−60 % manteniendo intensidad, cf. Bell et al., 2023, SportRxiv), pero el código no distingue complejos. Añadir `esCompuesto` (ya existe en CDG `esAislamiento`) y bajar a 1 en los multiarticulares.

**CR5 · Series a peso corporal no cuentan en el CDG ni en el 1RM (`adaptadores.ts:74`, decisión 16-10).** Un atleta de dominadas y fondos tiene 0 IEM, 0 tonelaje y nunca un PR. Propuesta: contar peso corporal (perfil) + lastre en `rmDeSerie` y en el tonelaje cuando `weight = 0` y el ejercicio esté marcado `bodyweight`.

**CR6 · Frecuencia por grupo (M6).** Con el mismo volumen semanal la frecuencia no cambia la hipertrofia (Schoenfeld et al., 2019, J Sports Sci, metaanálisis), así que repartir 15 series en 2 sesiones de 7-8 es lo que dice la doctrina; el distribuidor hoy fragmenta en 3 y abre ciclos de 14 días por 1-3 series.

**CR7 · Platos del menú.** Escalas ×3,5-×4 (313 comidas) producen platos de 1.100-1.900 kcal y 500-700 g de proteína animal al día en atletas de 3.000-3.600 kcal; medias raciones de 150 kcal (193) no son una comida. Sugiero topes por franja (desayuno/merienda ≤ 2,5×, comida/cena ≤ 3×) y, cuando no cabe, completar con un segundo plato en vez de multiplicar el primero.

**CR8 · Cardio.** Zona 2 fija 3 sesiones/semana (`cardioProgression.ts:214`) sin mirar los días de fuerza: con 5-6 días de pesas son 8-9 sesiones semanales. Hacer `sesionesPorSemana` dependiente de `daysPerWeek` del mesociclo (2 con ≥5 días de fuerza).

---

## 5 · Experimentos numéricos

### 5.1 Índice del recetario (`public/recetas-indice.json`, 8.929 recetas, 8.120 vinculadas)

| Comprobación | Resultado |
|---|---|
| kcal − (4·P + 4·HC + 9·G), todas (n = 8.825 con macros) | mediana −2 kcal, p5 −18, p95 +11, 432 recetas con \|Δ\| > 20, 63 > 50 (fibra, alcohol, etiquetas) |
| Autoconsistencia en los JSON (kcal = Σ porCien propio × gramos) | 8.120 / 8.120 correctas |
| Alimentos con dos `porCien` entre recetas | 34 / 396 (Rápidas 24-10 vs resto 26-10) |
| Recetas cuya suma con el `porCien` del índice ≠ kcal | 4.138 / 8.103 (> 5 kcal) · 993 (> 20) · 231 (> 50) · peor: salmón + arroz −113 kcal |
| Δ kcal antes → después de vincular (8.108 con `antes`) | mediana −2 % · 809 con \|Δ\| > 25 % · 227 > 50 % · 111 > 100 % |
| Palancas / fijos / no cuentan | 21.657 / 18.264 / 10.622 · 441 recetas vinculadas sin ninguna palanca · 1.100 palancas con `min > gramos` · aceite palanca en 4.283 |

### 5.2 Muestra de 200 recetas vinculadas (semilla 20261026)

1.374 ingredientes: 315 «no cuentan», 1.059 vinculados, 0 con confianza `baja`. Pares revisados a mano (253 distintos):

| Par | En la muestra | En todo el recetario | Veredicto |
|---|---|---|---|
| Calabaza → Pipas de calabaza | 4 | 144 | **Error grave** (+533 kcal/receta de mediana) |
| Tomate seco → Lechuga y tomate | 1 | 47 | **Error** (−97 kcal) |
| Arroz basmati / integral (sin estado) → … cocido | 2 | 134 | **Error probable** (−118 kcal; «60 g» es seco) |
| Arroz cocido → Arroz en vasito (cocido) · Quinoa cocida → Quinoa en vasito | 2 + 3 | 93 + 129 | Aceptable (misma composición) |
| Pan integral → Pan integral sin gluten | 6 | 287 | Aproximación (±5 %) |
| Levadura → Levadura de cerveza | 3 | 179 | Inocuo (2-3 g) |
| Pechuga de pavo → Pechuga de pavo (crudo) | 3 | 60 | Correcto (no va a pollo) |
| Arroz basmati cocido → Arroz basmati cocido · Patata → Patata (cocido) · Garbanzo cocido envasado → Garbanzos (cocido) | — | 455 + 247 | Correcto |

«Arroz basmati cocido» no se empareja con arroz crudo ni «Pechuga de pavo» con pollo: lo que pedías no falla. Falla el caso contrario (sustantivo compuesto que contiene el nombre).

### 5.3 Las 809 recetas sin vincular

| Categoría | Recetas |
|---|---|
| Suplementos deportivos (geles, barritas, BCAA, glutamina, whey de marca) | 355 |
| Platos salados | 308 |
| Bebidas | 90 |
| Desayuno y dulces | 56 |

805 de 809 se quedan por **un solo ingrediente dudoso** (679 distintos). Los más repetidos: Pistachos crudos (35), Pulpo cocido (5), Huevo cocido (5), Bebida de soja de vainilla (4), Infusión (4), Raviolis frescos (6), Salchicha de heura (3), Proteína aislada (3), Berberechos (3), Cebada (3), Chocolate blanco / con leche (6), Codorniz (3), Bonito en lata (3), Mejillones en escabeche (3), Chorizo (3), Salmonete (3), Yogur de oveja (3), Bacon, Boquerón, Batata, Halloumi… Con ~40 alimentos nuevos en el catálogo (y «Infusión», «Semillas de cilantro», «Planta de clavo» a «no cuenta») se recuperan del orden de 250-300. Los 355 suplementos de marca no deberían vincularse: su etiqueta ya es el dato; mejor conservarlos como plato entero con sus macros de origen.

### 5.4 Generador de menús (banco local: índice real + `SYSTEM_FOODS`, 9 escenarios × 6 kcal × 3 conteos = 162 semanas, 1.134 días)

| Métrica | Valor |
|---|---|
| Desvío kcal del día | mediana −12, p5 −83, p95 +47, mín −419, máx +213 |
| \|Desvío\| kcal | mediana 22, p95 98, media 33 |
| Desvío por macro (g) | P mediana 0 (p5 −6, mín −80) · HC 0 (p5 −4, mín −82, máx +64) · G 0 (p5 −4, mín −32) |
| Días fuera de tolerancia | 59 / 1.134 (5 %) |
| Comidas vacías | 30 (29 días), todas en «poco tiempo» |
| Comidas con ajuste por alimento | 3.934 / 4.506 (87 %) |
| Palancas movidas | 10.857 · ratio después/antes mediana 1,05 (p5 0,5, p95 2,0) · 1.820 en tope |
| Acompañamientos | mediana 0/día · kcal de extras mediana 0, p95 199, máx 924 |
| Escalas | 0,5: 375 · 1-2: 2.333 · ≥3,5: 313 (3.600 kcal: 144) |
| Repetición de recetas | variedad 3 y 5: 100 % distintas · monótono/batch: 14 % (por diseño) |
| Tiempo por semana (Node, M-series) | mediana 237 ms, p95 440, máx 559 |
| `isMenuStale` sobre el mismo menú | false (correcto) · `reajustarDia` deja Δ igual · `findSwapAlternatives`: 10 alternativas «exactas» con drift ≤ 23 kcal |

Por escenario (media de |Δ| kcal · % fuera · comidas vacías · kcal extras/día):

| Escenario | \|Δ\| | fuera | vacías | extras |
|---|---|---|---|---|
| base (variedad 3) | 22 | 0 % | 0 | 0 |
| variedad 5 | 22 | 0 % | 0 | 0 |
| monótono | 26 | 0 % | 0 | 0 |
| vegano | **71** | **32 %** | 0 | 11 |
| celíaco (cond. 66 + alergia gluten) | 26 | 0 % | 0 | 0 |
| alergia frutos secos + huevo | 25 | 0 % | 0 | 0 |
| no me gusta pescado | 25 | 1 % | 0 | 0 |
| poco tiempo (≤15 min, Rápidas) | **61** | **14 %** | **30** | **185** |
| batch cooking | 18 | 0 % | 0 | 0 |

Por kcal: 1.400 → |Δ| 17 (1 % fuera); 1.800 → 24 (3 %); 2.200 → 40 (7 %); 2.600 → 34 (7 %); 3.000 → 42 (8 %); 3.600 → 40 (5 %). Por comidas: 3 → 33, 4 → 35, 5 → 31 (indistinto).

Platos raros encontrados: Goulash / arroz blanco con el arroz a 25 g; pizza casera con 80 g de aceite (la receta original lleva 90); «Pechuga de pollo / Boniato / Judías verdes» ×3,75 (1.141 kcal, aceite 34 g); «Merluza / Patata» ×3,75 (1.134 kcal); 193 medias raciones de menos de 200 kcal.

### 5.5 Comprobaciones a mano

| Fórmula | Caso | Motor | A mano |
|---|---|---|---|
| 1RM CDG con RIR | 100 kg × 8 reps, RIR 2 | 132,9 | Epley 133,0 · Mayhew 130,9 · Wathen 134,7 → media 132,9 ✓ |
| 1RM 10-15 reps (solo Epley) | 100 × 10 RIR 0 | 133,0 | 100 × (1 + 0,033 × 10) ✓ |
| 1RM con RIR 5 / sin RIR / 0 kg | 100 × 10 | 149,5 / 133 / 0 | `rmCdg` sí acepta RIR 5 (el motor CDG lo pone a 0: incoherencia documentada) |
| CDG IF e IEM | «Sentadilla búlgara…», RPE 8, 8-12 | IF 6,192 | (Σ tamaño × valor + inestabilidad) × 0,59 × 1,0 = 6,192 ✓ · IEM = valor × 2,55 ✓ |
| Mifflin | H, 80 kg, 180 cm, 36 a, activo, reducir | BMR 1.750 · TDEE 2.713 · 2.170 kcal · P 160 g | ✓ (coincide con `estimateMaintenanceKcal`) |
| Keytel / TRIMP / hrTSS / ATL-CTL | revisadas contra la fórmula publicada | ✓ | ✓ |
| Semana ISO | 31-12-2026 → 2026-W53 · 01-01-2027 → 2026-W53 · 04-01-2027 → 2027-W01 | ✓ | ✓ |
| Viernes del ciclo | lunes 26-10 → 23-10 · martes 27-10 → 30-10, caduca 03-11 | ✓ | ✓ |
| `aplicarAjustes` mantenimiento | ver A1 | +500 / +300 / **+0** | — |
| `resolvePhaseTargetKcal` dieta vieja con mixtos | ver A6 | 1.297 | 1.896 |
| Intervalo 7 d tras el cambio de hora | ver A5 | 04-04 | 03-04 |
| Adherencia por líneas vs kcal | ver A4 | 66,7 % | 10,3 % |

### 5.6 Datos viejos: ¿dan lo mismo que antes?

- Un día viejo (`doneItemIds` por posición, sin `meals`) → `comidasDelDia` cae a la dieta: igual que antes. Sus kcal por intercambios (25/25/11, mixtos mitad y mitad) coinciden con `resumenDelDia` y con `macrosDeLinea` (comprobado: 210 kcal por los dos caminos).
- Un cupo viejo con mixtos: antes el diario los ignoraba (según el comentario de `macrosLegado.ts:88`); ahora cuentan. Es una corrección (un yogur es comida), pero baja la adherencia histórica de quien tenía mixtos en el cupo. Y la periodización (A6) sigue sin contarlos: esa es la incoherencia que queda.
- Un menú viejo (`exch`, `target`) → `macrosDeIntercambios` da las mismas kcal que `exchangeToKcal`. ✓

---

## 6 · Plan de arreglos por tandas

| Tanda | Qué | Esfuerzo | En paralelo |
|---|---|---|---|
| **1 · Datos en producción** | C1 (emparejado + lista blanca + revincular en seco → revisar dudas → `--aplicar` → índice → `--firestore` con OK) · C2 (recalcular Rápidas + abortar en conflicto) · M11 (comprobar catálogo vivo) | 1-1,5 días (Opus; 1 h de revisión de Dani sobre el CSV de dudas) | Sí con 2 y 3 |
| **2 · Asistente y nutrición** | A2 + A3 (dieta sin comidas aprobable y sin borrar comidas) · A1 (mantenimiento sobre el objetivo) · A6 (kcal de fase y desviación de macros con `objetivoDeDieta`) · M8 textos | 1 día (Sonnet) | Sí |
| **3 · Fechas y adherencia** | A5 (cuatro `floor` → `diasEntreFechas`) · A4 (adherencia por kcal en reportes, retos, proyección, conditions, planPhase, roadmapCalendar) · M3 (borrar el segundo gasto real) · B5 | 1 día (Sonnet) | Sí |
| **4 · Generador y palancas** | A7 (filtros antes del recorte + tope por día) · M1 (rangos) · M2 (topes de escala y palancas, criterio CR7) · B1 · B2 · banco de regresión con semilla | 1,5 días (Opus) | Después de 1 (depende del índice) |
| **5 · Coherencia de cifras** | M4 (una función de peso) · M5 (cierre prorrateado) · M6 (una constante de series/sesión) · M7 · M9 · M10 · B3-B4 · B13-B15 | 1,5 días (Sonnet) | Sí |
| **6 · Criterio** | CR1 proteína (doctrina + aviso en validadores) · CR2 ritmo · CR3 diet break sobre gasto real · CR4 descarga por tipo de ejercicio · CR5 peso corporal · CR6 frecuencia · CR8 cardio | decisión de Dani + 1 día | Después de 2 y 5 |

Orden Sonnet→Opus: 2, 3 y 5 primero; 1 y 4 (motores y datos) al final, como acordado.

---

## 7 · Lo que no he podido comprobar

- **Firestore y Storage** (sin `serviceAccount.json`, por regla): qué catálogo de alimentos está vivo (M11), si las 8.120 recetas de `recipes` coinciden con los JSON, las dietas y menús reales de los atletas, los `dietCompletionLogs` históricos con mixtos. Todo lo de datos viejos se ha medido con dietas y días construidos a mano según los tipos.
- **Lecturas de Firestore por pantalla**: solo por lectura de código (índice en bundle, catálogos con sello de versión, `queryRecetasForGenerator` cacheado por franja). No he medido lecturas reales ni rendimiento en móvil; en Node el generador tarda 240 ms/semana y la hidratación del índice es una pasada por 8.929 entradas.
- **Pantallas**: sin credenciales no he abierto la app. Las citas a componentes (`ProposalCard`, `NutritionScreen:1841`, `SemanasNutricionCoach:349`, `WeeklyMenuEditor:162`) son de código, no de ver la pantalla.
- **El asistente en ejecución**: no he lanzado el modelo. He revisado tools, validadores, prompt y aprobación; no sé cómo responde a las contradicciones (A2, CR1) en la práctica.
- **`search_knowledge`, la bóveda y las notificaciones**: fuera de alcance.
- **El latido en Vercel**: lógica pura comprobada por tests existentes y lectura; no he ejecutado el endpoint ni en seco.
- **Pools reales del generador**: el banco usa 300 recetas por franja del índice barajadas con semilla y el banco de 310 alimentos del sistema; en producción se suman las recetas del coach y el banco de `foodItems` de Firestore.
- **Los 1.100 rangos con `min > gramos`** son del índice; no he comprobado si el CSV revisado a mano de las Rápidas tiene los mismos.
