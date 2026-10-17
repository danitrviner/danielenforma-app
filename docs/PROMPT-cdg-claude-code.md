# Prompt para Claude Code — Integrar el motor CDG (Índice de hipertrofia) en En Forma

Pega todo lo que hay debajo de la línea en Claude Code, dentro del repo `en-forma`.

---

## Contexto

Quiero programar y hacer el seguimiento de mis atletas en En Forma con **exactamente los mismos cálculos** que la plantilla de Google Sheets "Índice de hipertrofia V4" (CulturaDeGym), que uso con licencia y solo para mí.

El motor ya está escrito, probado y validado contra la hoja real (diferencia 0). **NO lo reescribas ni "mejores" las fórmulas.** Las rarezas marcadas con «RAREZA DEL ORIGINAL» son intencionadas.

- `src/utils/cdg/motor.ts`: IF, IEM (33 músculos) y IEA = estrés articular (11 zonas) por serie y por fila de programación. También filtros y tiempo de sesión.
- `src/utils/cdg/seguimiento.ts`: semana realizada (Semana X), filas de Gestión, carga aguda/crónica, RM estimado, tonelaje, rendimiento del ciclo e incrementos de antropometría.
- `src/utils/cdg/adaptadores.ts`: `WorkoutExercise` / `WorkoutLog` → entrada del motor.
- `src/utils/cdg/cdg.test.ts`: 22 tests con valores reales de la hoja. Tienen que seguir en verde siempre.
- `src/utils/cdg/LEEME.md`: resumen.
- `scripts/emparejarCdg.mjs`: empareja ejercicios de la app con el catálogo CDG. Solo escribe en `scripts/out/`, nunca en Firestore.
- El catálogo completo es `catalogo-cdg.json`, con 1.034 ejercicios en formato compacto. Va en `scripts/cdg/catalogo-cdg.json`, ignorado por git; **no lo metas en `src/` ni en el bundle**.

## Reglas de trabajo

1. **No hagas commits ni push.** Trabaja en una rama nueva `cdg-motor` creada desde `main`.
   - OJO: `src/utils/cdg/` se coló en el commit `c87191a` de la rama `reparto-propio`.
   - Tráete esos archivos a `cdg-motor` con `git checkout reparto-propio -- src/utils/cdg scripts/emparejarCdg.mjs`.
   - No toques `reparto-propio`.
2. Después de cada fase: `npm run lint` y `npx vitest run`. Al terminar cada fase, para y enséñame qué has cambiado antes de seguir.
3. Respeta CLAUDE.md: base Firestore NOMBRADA, `stripUndefined`, queries filtradas por dueño, reglas con `isOwner()`/`isCoach()`.
4. Antes de tocar cualquier pantalla, lee el componente entero y dime qué vas a cambiar.

## Decisiones ya tomadas (no las vuelvas a preguntar)

- **D1 · Vincular ejercicios.**
  - Los ejercicios de la app salen del Excel de CDG quitando " - Grupos musculares" del nombre.
  - Cada `Exercise` lleva un campo nuevo `cdgNombre?: string` con el nombre EXACTO del catálogo CDG. Sin él, el ejercicio calcula 0.
  - El emparejado es automático y los dudosos los reviso yo en una pantalla.
- **D2 · Nombres de los índices: los del Excel.**
  - IF = fatiga, IEM = estímulo muscular, IEA = estrés **articular**.
  - El "IEA = Índice de Estímulo Acumulado" que ya existe en la app (`utils/accumulatedStimulusIndex.ts`, usado en `revisionCoach.ts`, `cierreMesociclo.ts`, `stimulusSeries.ts`, `MesocycleReviewPanel.tsx`) se sustituye por el **IEM** de CDG para hablar de estímulo.
  - La etiqueta "IEA" pasa a significar estrés articular en toda la app.
- **D3 · Técnicas.** Se adaptan al funcionamiento de la app: la técnica de un `WorkoutExercise` se aplica a su ÚLTIMA serie.
  - dropset → Drop 1
  - myoreps → Myo rep
  - restpause → Rest Pause 1
  - amrap y fallo → serie normal

  Ya está así en `adaptadores.ts` (`TECNICA_POR_DEFECTO`).
- **D4 · 1RM.** El RM de CDG sustituye a `utils/oneRepMax.ts::epley` en TODA la app.
  - Usa RIR: reps hasta el fallo = reps + RIR.
  - Con 10-15 reps usa solo Epley; con cualquier otro número, la media de Epley, Mayhew y Wathen.
- **D5 · Igual que la hoja.**
  - "Al fallo" cuenta como RIR 0.
  - Las series sin kg (peso corporal = 0 kg) NO cuentan.

  Ya está así en `adaptadores.ts` (`contarSinPeso = false`).
- **D6.** Nada de commits hasta que lo hayamos verificado todo.

## Fase 0 — Verificación (no cambies nada de la app)

1. Crea la rama y tráete los archivos (regla 1).
2. Ejecuta `npx vitest run src/utils/cdg`: 22 tests en verde.
3. Comprueba que existe `scripts/cdg/catalogo-cdg.json` y añade `scripts/cdg/` a `.gitignore`.
4. Escribe `scripts/cdg/probarCatalogo.mjs`. Debe cargar el catálogo con `expandirCatalogo` y comprobar:
   - 1.034 ejercicios.
   - 33 valores de músculos y 11 de articulaciones en todos.
   - Ningún nombre repetido.
   - Estos IF:
     - "Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo", 4 series, "10-12", "4x2" → **24.76702**
     - "Pike push up con déficit- Deltoides anterior, tríceps", 4 series, "10-12", "4x2" → **9.01756**

## Fase 1 — Emparejado de ejercicios (D1)

1. Exporta los ejercicios ACTUALES de Firestore (`exercises`) a `scripts/out/ejercicios-app-actual.json`, solo lectura, usando `scripts/_lib/firestoreDb.mjs`. Ojo: el catálogo se limpió de 840 a 633 y puede haber ejercicios propios nuevos.
2. Ejecuta `node scripts/emparejarCdg.mjs scripts/cdg/catalogo-cdg.json scripts/out/ejercicios-app-actual.json`.
3. Usa `scripts/out/reporte-limpieza-ejercicios.md` para los ejercicios FUSIONADOS o renombrados en la limpieza. El `cdgNombre` correcto es el del ejercicio que se quedó (el destino de la fusión).
4. Dame un resumen con:
   - nº de exactos, probables, ambiguos y sin pareja;
   - la lista de los que no son exactos.
5. Pantalla de revisión dentro de `ExerciseTriageScreen` (o una pestaña nueva al lado, como encaje mejor):
   - por cada ejercicio, su `cdgNombre` propuesto y los 3 candidatos;
   - un buscador sobre el catálogo CDG;
   - botones "Confirmar", "Cambiar" y "Sin equivalente".
6. Script `scripts/aplicarEmparejadoCdg.mjs`:
   - simulacro por defecto;
   - con `--aplicar` escribe `cdgNombre` en `exercises`;
   - en simulacro me enseña qué escribiría.

## Fase 2 — Catálogo en Firestore + hook

1. Sube el catálogo a Firestore como documento(s) en una colección nueva `cdgCatalogo`, con lectura SOLO para el coach. Añade la regla en `firestore.rules` con `isCoach()` y el test de reglas que corresponda.
2. Crea el hook `useMotorCdg()`:
   - carga el catálogo una vez con React Query, con caché persistente igual que el resto de la app;
   - devuelve `crearMotor(expandirCatalogo(json))`.
3. El atleta NO descarga el catálogo. Lo que vea el atleta se calcula en la vista del coach y se guarda ya calculado, o se le enseña solo al coach. Proponme cuál encaja mejor con la arquitectura actual antes de hacerlo.

## Fase 3 — Programación (editor de mesociclo)

1. En el editor de sesiones del mesociclo (`MesocycleManager` / el editor de `Workout`), añade un panel en vivo por sesión y por semana:
   - IF total;
   - IEM por grupo (con las columnas compuestas de `iemCompuesto`);
   - IEA articular;
   - tiempo estimado de sesión.
2. La semana se resuelve con la progresión de `utils/progression.ts` antes de calcular.
3. RIR 5:
   - la plantilla no lo admite (no hay RIR 5, así que IF e IEM salen 0);
   - en los ejercicios con `cdgNombre`, limita el selector de RIR a 0-4 o muestra un aviso claro;
   - proponme cuál antes de hacerlo.

## Fase 4 — Seguimiento

1. Semana realizada a partir de `WorkoutLog`, agrupando por `Workout.dayIndex` (`semanaRealizadaDesdeLogs`).
2. Gestión:
   - filas por sesión y total, calculadas al vuelo desde los logs;
   - no se guardan copias, para que no se queden desactualizadas como en la hoja.
3. Carga aguda/crónica:
   - aguda = lo programado para la semana que viene (`cargaProgramada`);
   - crónica = media de las 6 últimas semanas realizadas;
   - avisos fuera de 0,8-1,6, configurables por atleta;
   - con menos de 6 semanas no hay cálculo, y lo dice.
4. Rendimiento: RM y tonelaje por ejercicio y sesión, mejora del ciclo por ejercicio y por categoría (Empuje, Tracción, Brazo, Pierna, Cadera).
5. Antropometría: los índices ya existen en `utils/anthropometricIndices.ts`. Añade solo el incremento inicio → último.

## Fase 5 — Sustituciones (D2 y D4)

1. Sustituye `utils/oneRepMax.ts::epley` por el RM de CDG en todos sus usos:
   - `loadTrend.ts`, `WarmupEngine.ts`, `LoadHistoryPanel.tsx`, `ExerciseCloseCard.tsx`, `CorrelationPanel.tsx`, `TrainingScreen.tsx`;
   - cada uso debe pasar el RIR real de la serie.
2. Sustituye el "IEA estímulo acumulado" por el IEM de CDG en sus usos (D2). Enséñame antes la lista de pantallas y textos que cambian, porque los umbrales y avisos antiguos de `revisionCoach.ts` y `cierreMesociclo.ts` están en otra escala.

## Criterio de terminado

- `npm run lint` y `npx vitest run` en verde.
- `scripts/cdg/probarCatalogo.mjs` en verde.
- Para la atleta de pruebas, un día de mesociclo programado igual que el Día 1 de la hoja "MESOCICLO 1 ISRAEL" da los mismos IF que la hoja: 24.76702, 16.91235, 9.01756, 12.0135, 4.626 y 7.068.
- Ningún commit hecho: lo reviso yo y decido.
