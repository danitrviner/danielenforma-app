# CDG · decisiones tomadas por defecto y cosas por decidir

Todo lo de abajo lo elegí yo con el criterio más conservador mientras no estaba cubierto por D1-D6. Revísalo y dime qué cambio.

## Por decidir (afectan a lo que ve el atleta o al dato guardado)

1. **Reto semanal en curso al desplegar.** Los retos de carga guardan `metric.target` y `metric.baseline` calculados con el Epley viejo. Con el RM de CDG (que cuenta el RIR, y usa 0,033 en vez de 1/30) el progreso de ESA semana se evalúa contra un objetivo en otra escala. Solo afecta al reto activo en el momento del despliegue; los nuevos salen bien. Lo más limpio: desplegar un lunes.
2. **Umbrales del IEA antiguo.** En `revisionCoach.ts` y `cierreMesociclo.ts` NO había umbrales ni avisos ligados al IEA «acumulado»: solo se mostraba. Por eso no hay nada que desactivar. Si quieres avisos de estímulo con el IEM, hay que decidir el umbral (el IEM va en otra escala que el antiguo IEA: por serie es `valor del catálogo × 2,55` a RIR 2, y se suma por músculo).
3. **Código muerto del IEA antiguo.** `utils/accumulatedStimulusIndex.ts` y `seriesIEAPorGrupo` (en `stimulusSeries.ts`) siguen en el repo con sus tests pero ya nada los usa. No los borré. ¿Los quito?
4. **Carga crónica entre mesociclos.** La crónica usa las 6 últimas semanas realizadas DENTRO del bloque que estás mirando, y la semana comparada es «la siguiente a la última realizada». Con bloques de menos de 7 semanas nunca habrá cálculo. Si quieres que mire también el bloque anterior, hay que decidir cómo se encadenan las semanas.
5. **Umbrales de aviso por atleta** se guardan en `user_profiles/{uid}.cdgUmbralesCarga` (escribe el coach con `updateUserProfile`). La regla de `user_profiles` (`allow update: if isCoach() || …`) lo permite; no lo probé en el emulador.
6. **Persistencia del catálogo en el móvil/PC.** React Query persiste TODAS las consultas en localStorage (`main.tsx`), y el catálogo CDG son ~362 KB de texto. Ya hubo un incidente de localStorage lleno (`enforma_ai_chats_v1`). No toqué el persister. Opciones: excluir la clave `['cdgCatalogo']` de la persistencia, o dejarlo.
7. **RIR 5 en el RM.** La hoja no tiene RIR 5 y devolvería RM 0. En la app el RM usa `reps + RIR` directamente (igual que la hoja para RIR 0-4) y para RIR 5 sale un valor normal, para no perder el dato de una serie real. En IF/IEM (programación) RIR 5 sigue contando 0, como pediste, con aviso.
8. **RIR vacío o ilegible en un log** cuenta como RIR 0 (el RM más bajo, la lectura prudente).
9. **Retos «mejora tu ejercicio»** (`challengeOptions.ts`): el objetivo hipotético (+2,5 kg o +1 rep) se calcula con el MISMO RIR que la mejor serie (`BestSet.rir`, nuevo campo). Con RIR 0 fijo el objetivo quedaba por debajo de la marca.

10. **Zonas de IEM** (`utils/cdg/zonas.ts`): agrupé los 33 músculos CDG en 14 zonas para los objetivos, las agujetas y el freno/acelerador. Es una SUMA, como los «IEM [COMPUESTO]» de la hoja. Decisiones mías: el glúteo junta mayor y medio; «Erectores (lumbares)» junta lumbares y dorsales; abdomen junta abdomen y oblicuos; rotadores externos (hombro y cadera) y psoas se quedan fuera. Revisa si quieres otras.
11. **Zonas «sensibles»** (con un 4 de agujetas se espera una semana): isquios, glúteo, aductores y dorsal, sacado de las clases (trabajo en estiramiento). El resto, con un 4, frena.
12. **Actitud del bloque.** Estático: solo se sube con un 1 y en zonas objetivo. Dinámico: se sube con 1-2. Agresivo: incluso con 3. La clase habla de estático, dinámico y agresivo, pero no fija dinámico = 2; lo puse yo. Por defecto el bloque es estático.
13. **Cuestionario nuevo «Agujetas a las 48 h»** (1-5 por zona, semanal, miércoles en la plantilla «Hipertrofia · 6 sem»). NO sustituye al DOM's 0-10, porque el IRP (readiness) y el sugeridor de volumen leen ese. Si un atleta solo tiene el antiguo, el seguimiento lo convierte con max(1, round(v/2)) y lo marca con *. ¿Retiramos el 0-10 y pasamos el IRP a la escala nueva?
14. **Aviso IEM ↔ estrés articular:** salta cuando, de una semana a la siguiente, el estrés de una articulación de la zona sube MÁS (en %) que su IEM. Sin umbrales nuevos.

## Decisiones menores que tomé

- **Emparejado:** los ejercicios «probables» son los 123 cuyo id (`sys_…`) coincide con UN solo nombre CDG aunque la limpieza acortara el nombre (p. ej. quitó «(caja torácica plana)»). Por defecto `aplicarEmparejadoCdg.mjs` escribe SOLO los exactos; los probables entran con `--incluir-probables` y las revisiones de la pantalla con `--revisiones`.
- **No se pisa un `cdgNombre` ya distinto** salvo con `--sobrescribir` (las revisiones de la pantalla sí mandan).
- **«Sin equivalente»** se guarda como `Exercise.cdgSinEquivalente = true` (campo nuevo) para distinguirlo de «aún sin emparejar».
- **La pantalla de revisión NO escribe en Firestore**: guarda un borrador en el navegador y exporta un JSON que aplica el script (simulacro primero).
- **Catálogo en Firestore:** un solo documento `cdgCatalogo/v4` con el JSON compacto como string (362 KB; el script se niega a subir más de 900 KB). Lectura solo `isCoach()`; escritura `false` (lo sube el script con el Admin SDK).
- **El atleta no descarga el catálogo:** `useMotorCdg` ni lo pide si el correo no es el del coach.
- **Semana del panel de programación:** se resuelve con `resolverEjercicioDelMeso` (incluye descarga y test), que es lo que dice su comentario. Ojo: las tarjetas de ejercicios del editor usan `resolveExerciseForWeek` (sin descarga), así que en una semana de descarga el panel puede enseñar la mitad de series que la tarjeta. No lo toqué: es de otra pantalla.
- **Sesiones sin colocar:** en el seguimiento, los logs de rutinas sin `dayIndex` o con `dayIndex` > 6 (ciclos de 8-10 días: la hoja solo tiene 7 sesiones) no se cuentan, y la pantalla dice cuántos son.
- **Logs anteriores al inicio del bloque** (`mesocycleWeekNumber` les da la semana 1) se descartan aparte.
- **Una semana con sesiones pero sin series contables** (todo peso corporal) existe y vale 0.
- **Técnicas (D3):** amrap y fallo cuentan como serie normal. La semana de test mete `amrap` automáticamente, así que no suma técnica.
- **Imports con `.js`:** los archivos de `src/utils/cdg/` que alcanza `api/` (vía `oneRepMax.ts` → `trainingReport.ts`) llevan `.js` en los imports relativos (el test `api/importsConExtension` lo exige).
- **Textos:** «1RM por Epley» → «RM con la fórmula de CDG» en `BloqueMejoresEjercicios`, en el prompt del asistente (`systemPrompt.ts`) y en la descripción de la herramienta de métricas.

## Lo que NO hice

- No toqué `reparto-propio` ni `~/en-forma` (el árbol de trabajo original). Todo está en el worktree `~/en-forma-cdg`, rama `cdg-motor`.
- No hice commits ni push. No escribí nada en Firestore (solo lecturas y simulacros).
- No cambié el selector de RIR, ni el persister, ni `App.tsx`.
- Avisos de ESLint de `ExerciseTriageScreen.tsx` y `CorrelationPanel.tsx`: ya existían en `main`.
