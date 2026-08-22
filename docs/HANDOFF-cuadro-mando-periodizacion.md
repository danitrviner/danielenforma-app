# Handoff — Cuadro de mando de periodización (Bloque H)

> Resumen para continuar esta conversación en otra sesión sin perder contexto.
> Fecha: 2026-08-23. Repo: `/Users/dani/en-forma`.

## Qué se pidió originalmente

Dani pidió una batería de mejoras a la vista de coach de "Plan y Entrenamientos":
menús desplegables para notas/técnica/calentamiento, botón de vídeo más pequeño,
long-press para ver vídeo en móvil, días en carriles laterales con swipe,
separar Info vs Programación, simplificar la generación de sesiones, y
periodización automática por ejercicio (progresión de series por semana).
Además, la parte más importante para él: **un calendario/cuadro de mando** donde
programar y ver de un vistazo entrenamiento + nutrición + revisiones, para no
perder tiempo revisando semana a semana.

El plan completo, con los bloques A–H y el brief de diseño, está en:
**`/Users/dani/.claude/plans/sprightly-hatching-kettle.md`** — léelo primero.

## Investigación previa

- Se exploró el código real y se comparó con **HubFit** (plataforma de referencia
  de Dani) en vivo, incluyendo su "Periodise Planner" (confirmado: NO es un motor
  de progresión automática, solo duplica entrenamientos ya armados a semanas
  futuras — lo que Dani pide en periodización no existe en HubFit, se construyó
  desde cero aquí).
- Se descubrió que `RoadmapTimeline.tsx` (747 líneas) ya era casi exactamente el
  calendario que Dani pedía — carriles Entrenamiento/Nutrición/Objetivos/Peso,
  línea de "hoy", bloques pasado/actual/futuro. Se decidió **evolucionarlo**, no
  construir uno nuevo.
- Diseño visual: se generaron mockups de las 6 pantallas del brief con
  **superdesign** (proyecto "En Forma — Periodización" en superdesign.dev,
  créditos agotados a mitad) y con la **skill de Claude Design** para las
  Pantallas 5 y 6 (publicadas como Artifact). El Design System real de la app
  (tokens de `src/index.css`) se documentó en `.superdesign/init/`.

## Qué está HECHO (commiteado en working tree, sin pushear)

### Bloque F — Periodización automática por ejercicio ✅ completo
- `src/types.ts`: campo `weeklyProgression?: WeeklyProgressionRule[]` en
  `WorkoutExercise` (aditivo).
- `src/utils/progression.ts` (nuevo): `mesocycleWeekNumber()` y
  `resolveExerciseForWeek()` — 11 tests.
- `src/components/ExerciseConfigEditor.tsx`: acordeón "Progresión por semanas".
- `src/components/MesocycleManager.tsx`: conectado `mesoWeeks` en los dos sitios
  que usan el editor.
- `src/components/TrainingScreen.tsx`: al abrir una sesión, resuelve el ejercicio
  para la semana real antes de mostrarlo al atleta.

### Bloque H — Cuadro de mando ✅ Pantalla 1 funcionalmente completa
Todo en `src/utils/planEvents.ts` (nuevo, modelo `PlanEvent` + derivadores) y
`src/components/RoadmapTimeline.tsx` + `src/components/CoachRoadmapView.tsx`:

1. **Tira de adherencia semanal** — `weekAdherence()`, celda coloreada por semana
   encima de los carriles.
2. **Marcadores de subida de volumen** en el carril Entrenamiento —
   `deriveVolumeIncreaseEvents()`, derivados de las reglas del Bloque F (no se
   anotan aparte).
3. **Clic en semana vacía del carril Revisiones → crea una TaskItem real**
   (`onCreateReview`, usa `createTask` existente).
4. **Arrastrar un marcador de Revisiones a otra fecha** — verificado que persiste
   tras recargar (usa `updateTask`).
5. **Avisos de conflicto** — `detectConflicts()`: dos subidas de volumen en
   semanas seguidas, fin de mesociclo sin revisión programada. Las otras 2
   reglas del brief (recorte de kcal + subida de volumen misma semana, revisión
   en semana de descarga) necesitan marcadores de nutrición/descarga que
   **todavía no existen** como `PlanEvent`.
6. **Panel "+ Evento" (Pantalla 2)** — `src/components/roadmap/EventPlannerSheet.tsx`
   (nuevo). Selector de tipo agrupado por carril, fecha, detalle según tipo,
   constructor de condiciones completo. Estado real por tipo:
   - **Revisiones** (check-in/cuestionario/fotos): funcional, crea TaskItem.
   - **Entrenamiento → Subida de volumen**: funcional, escribe una
     `WeeklyProgressionRule` en el `Workout` real vía `updateWorkout` — pero
     **necesita que el atleta tenga un mesociclo activo en la fecha elegida**,
     si no, no hay ejercicio al que enganchar la regla (comportamiento correcto,
     no un bug — así se lo confirmé a Dani).
   - **Entrenamiento** (descarga/cambio de rutina/inicio de mesociclo),
     **Nutrición** (todos), **Revisiones → Mediciones**: marcados
     "próximamente", deshabilitados a propósito — no hay modelo de datos aún.
   - **Condición (opcional)**: constructor completo (métrica/operador/valor,
     encadenable, "si no se cumple") — **se guarda como texto** añadido al
     título del evento, **no se evalúa ni se aplica sola todavía** (eso es el
     Bloque H2.2 del plan, motor de evaluación, no construido).

### Fuera del plan, encontrado y arreglado de paso
- Bug real en `src/ai/doctrina.ts`: faltaban rangos de volumen (MEV/MRV) para
  "Lumbares" y "Rotadores (manguito)" — el test lo detectaba pero tenía el
  conteo desactualizado. Investigado con búsqueda web, añadidos rangos
  conservadores (4-8 y 4-9 series/semana) con la misma nota de "pendiente de
  ajustar" que ya llevaba aductores.
- Quitado el botón duplicado "Análisis semanal IA" y el badge "Consola de
  Entrenador" de `ClientsScreen.tsx` (pedido por Dani).
- "Sincronizado" ahora es condicional (`useIsFetching`/`useIsMutating`) en vez
  de texto fijo — y de paso se corrigió un bug real que yo mismo introduje
  (`||` cortocircuitaba una llamada a hook, rompiendo la pantalla de Clientes).
- Ocultadas las barras de scroll horizontales del timeline (`hide-scrollbar`).

## Verificación

- **614 tests pasan**, `npx tsc --noEmit` limpio, en todo momento durante la sesión.
- Todo verificado en vivo contra un dev server local (`preview_start` con la
  config `en-forma-dev` de `.claude/launch.json`), con sesión de coach ya
  autenticada (persistida en el navegador de la herramienta).

## ⚠️ Importante para la siguiente sesión

**Dani también corre su propio servidor de desarrollo en el puerto 5175 en su
máquina, al mismo tiempo que estas sesiones.** Parar/reiniciar el servidor de
`preview_start`/`preview_stop` desde aquí le rompe su pestaña con errores de
"Failed to fetch dynamically imported module" (módulos de Vite invalidados).
**No pares el servidor entre pruebas** — dejarlo corriendo y solo navegar
dentro de la propia pestaña de la herramienta es seguro.

## Qué falta (por orden del plan)

1. **Pantalla 1 — piezas menores que quedan:**
   - Arrastrar el BORDE de una barra de mesociclo/fase para alargar/acortar
     (con recálculo en vivo de la proyección) — no implementado, es la pieza
     más compleja que queda de toda la Pantalla 1.
   - Las 2 reglas de conflicto que faltan (necesitan eventos de nutrición).
   - Extender el clic-para-programar y el arrastre a los carriles de
     Entrenamiento y Nutrición (hoy solo Revisiones tiene ambos).
2. **Pantallas 3 y 4** (Proponer plan con IA, Plantillas de periodización) —
   diseñadas en superdesign, sin implementar en código todavía.
3. **Pantalla 5** (Esta semana, multi-atleta) y **Pantalla 6** (vista del
   atleta) — diseñadas (superdesign / Claude Design), sin implementar.
4. **Bloque H2.1** — la IA propone el bloque entero periodizado (mesociclo +
   progresión + nutrición + revisiones) como eventos fantasma a aprobar. Toda
   la infraestructura de IA (`src/ai/tools.ts`, `src/ai/doctrina.ts`) ya existe
   y está en producción — "solo" falta la nueva tool + el flujo de aprobación.
5. **Bloque H2.2** — motor de evaluación de condiciones (el constructor de UI
   ya existe en `EventPlannerSheet.tsx`, pero no se evalúa contra los datos
   reales de adherencia/RIR todavía).
6. **Bloques A/B/C1/C2/D** del plan original (densidad del editor, long-press
   vídeo, swipe entre días, separación Info/Programación) — siguen sin
   empezar, son independientes y de bajo riesgo.
7. **Bloque G** — Dani no ha confirmado si quiere la librería de workouts
   reutilizable (punto que más se alinea con cómo usa HubFit hoy).

## Archivos clave de esta sesión

- `src/utils/planEvents.ts` + `.test.ts` — modelo `PlanEvent`, todos los derivadores
- `src/utils/progression.ts` + `.test.ts` — Bloque F
- `src/components/RoadmapTimeline.tsx` — el calendario en sí
- `src/components/CoachRoadmapView.tsx` — contenedor, fetching, handlers de guardado
- `src/components/roadmap/EventPlannerSheet.tsx` — Pantalla 2
- `src/components/ExerciseConfigEditor.tsx` — editor de progresión (Bloque F)
- `.claude/plans/sprightly-hatching-kettle.md` — el plan maestro completo
