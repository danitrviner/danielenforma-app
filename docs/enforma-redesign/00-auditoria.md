# 00 · Auditoría del estado real de En Forma

> Fase 0 · 22-oct-2026 · solo lectura. **Referencia de código: `origin/main` = `be2fe73`** (incluye PR #5 integración CDG + reparto y PR #6 Índice de Hipertrofia). La carpeta `~/en-forma` está en la rama `reparto-propio` (64d7c0c), 12 commits por detrás de `main`; las rutas citadas existen en `main`.
> Leyenda: **[C]** comprobado en código · **[S]** supuesto/inferencia · **[P]** propuesta (no existe).

## Resumen ejecutivo

1. **La base es sólida y reutilizable.** Hay design system con tokens (`src/index.css`), hoja inferior (`ui/Sheet.tsx`), selector de peso (`ui/WeightWheelPicker.tsx`), motor de menús (`utils/menuEngine.ts`), motor CDG de IEM/IF (`utils/cdg/motor.ts`), planificador de progresión (`PlanificadorProgresion.tsx`) y ~300 tests. **No hay que reconstruir nada; hay que unificar y corregir.**
2. **Nutrición tiene 4 fuentes de objetivo sin sincronizar** (`onboarding.macroGrams`, `Diet.budget`, `nutritionPrograms.phases[].targetKcal`, `athleteDietConfigs.weeklySchedule`). Es el riesgo nº 1 antes de añadir un segundo método (diario tipo MyFitnessPal).
3. **Los alimentos no tienen macros por 100 g ni unidad estructurada**: los gramos se leen del texto con una expresión regular. Las recetas (8.929) traen macros precalculados de un tercero, no sumados desde el catálogo. El «motor de recetas determinista» que se pide **no existe todavía**; existe el escalado por factor y el ajuste por intercambios.
4. **Bug funcional confirmado en técnicas de intensidad**: la técnica es un campo del ejercicio entero; un drop set en 3 series pinta BASE + D1 + D2 (sustituye 2 series) y registra las bajadas como series completas (`components/training/ExerciseCard.tsx:76, :438`). Infla volumen, IEA y «real de la semana».
5. **IEM/IF están en producción** pero solo como panel denso (texto a 11 px, columnas con el nombre completo de la sesión). El catálogo de ejercicios **no tiene** material, unilateral ni goma (equipment vacío en el 100 % del volcado de 633).
6. **Lo visual en modo claro pasa AA de contraste; falla en tamaño y jerarquía**: `text-caption` (11 px) se usa 2.043 veces y es el estilo más común; las preguntas de los cuestionarios son el texto más pequeño de su pantalla. En **oscuro**, la pestaña inactiva da ≈2,4:1 (no pasa AA).

## Estado por área

| Área | Datos reales | A medias | Solo visual / no existe |
|---|---|---|---|
| Inicio | Peso, racha, pendientes [C] | «Tu peso» navega a Perfil › Revisión, no registra [C] | Registro rápido de peso [P] |
| Peso corporal | `bodyweightLogs` [C] | Sin control de duplicados por día (`addDoc` aleatorio, `db/athleteMetrics.ts:80`) [C] | — |
| Navegación | 5 pestañas (Hoy, Rutinas, Training Lab, Nutrición, Perfil) `App.tsx:209` [C] | Cardio solo desde la cabecera [C] | Botón central [P] |
| Cuestionarios | Tipos numeric/scale/choice/text/boolean/metric/media; viernes→martes (`utils/questionnaireSchedule.ts`) [C] | Parciales solo en localStorage; completado = «existe respuesta» [C] | Flujo unificado Check-ins [P] |
| Check-ins legado | Colección `checkins` [C] | Nadie llama a `addWeightCheckIn`: no se pueden crear, pero el contador del coach depende de ellos (`usePendingReviews`) [C] | — |
| Cardio | Sesión en vivo BLE (nativo), manual «Ya lo hice», `cardioSessions` [C] | Sin zonas configuradas se oculta «Ya lo hice» (`CardioScreen.tsx:244`); «Mover a mañana» solo escribe localStorage (`utils/cardioSkipToday.ts`) [C] | Distancia/ritmo; FC en web [C: no existe] |
| Training Lab | Cursos, lecciones, publicar, acceso por atleta, desbloqueos (`AcademyCoachScreen.tsx`, `utils/academyUnlock.ts`) [C] | Ocupa hueco en la barra aunque el atleta no tenga acceso [C] | — |
| Nutrición · intercambios | Banco 311 alimentos, `Diet.budget`, menú semanal, registro del día (`dietCompletionLogs`) [C] | 4 fuentes de objetivo; `isDraft` no se filtra al atleta [S]; refeed no aplica `dietId` [C] | — |
| Nutrición · recetas | 8.929 (8.850 importadas + 79 «Rápidas»), reglas por atleta `athleteRecipeRules` [C] | Macros de terceros, sin cantidades en el índice [C] | Ingredientes vinculados al catálogo, ajuste por ingrediente [P] |
| Nutrición · diario | Buscador del banco + alimentos personales (`CrearAlimentoSheet`) [C] | Cantidad solo en intercambios, no en gramos [C] | Gramos, marcas, código de barras [C: no existe] |
| Dietas coach | Por atleta (`athleteId`), borrador autoguardado [C]; **las dietas de kcal seguirán siendo individuales** | — | Acceso global/grupo/atleta a **recetas** [C: no existe] |
| Volumen | Tabla MV/MEV/MAV/MRV, sugeridor de volumen [C] | — | IEM integrado en la vista de volumen [P] |
| IEM / IF / CDG | Motor CDG v4 replicado, panel «Índices CDG · Base», Seguimiento CDG, carga aguda/crónica (`utils/cdg/seguimiento.ts`) [C en main] | Crónica exige 6 semanas exactas del bloque → con mesos cortos nunca sale [C]; ejercicios sin `cdgNombre` cuentan 0 [C] | — |
| Ejercicios | `muscleGroup` 99 %, secundarios 77 % [C, volcado 18-09] | `equipment` 0 %; Draft «sin material» no filtra nada [C] | Unilateral, goma, guiado [C: no existe] |
| Clasificación | Triage permite cambiar `muscleGroup` global (`ExerciseTriageScreen.tsx:451`) [C] | Secundarios no editables en UI; sin vista previa ni historial [C] | Corrección desde la planificación [P] |
| Técnicas | `WorkoutTechnique` amrap/dropset/myoreps/restpause/fallo por ejercicio [C] | **Bug** drop set (ver arriba) [C] | Técnica por serie [P] |
| Progresiones | «Progresiones en un clic» (RIR semana a semana, subir series, reps, descanso, series de alta intensidad, descarga) y «Planificar progresión» [C] | Aplica a todo el bloque [C] | Objetivo de IEM por ejercicio [P] |
| Modos estático/dinámico | Rama IH: sensibilidad estático/dinámico × velocidad suave 10/medio 20/agresivo 30 % (`utils/cdg/agujetas.ts`) [C en main] | No coincide con el Excel (que tiene 3 niveles: estático/medio/dinámico) [C] | Evaluación semanal integrada en el planificador [P] |
| CRM | Servicios, pagos, cuotas, renovaciones, MRR/LTV (`features/crm/lib/metricas.ts`) [C] | Nombre del servicio en texto libre (`NuevoServicioModal.tsx:134`) [C] | Costes/comisiones → no hay margen [C: no existe] |

## Hallazgos fuera de alcance (anotados, no se tocan)

- `RoadmapTimeline.tsx` (1.384 líneas) no lo importa nadie → código muerto [C].
- `CLAUDE.md` dice puerto 3005; `npm run dev` usa 3000 [C].
- «IEA» significa dos cosas: Índice de Estímulo **Acumulado** (`utils/accumulatedStimulusIndex.ts`, fórmula que **premia el RIR alto**: series × RIR/10) y Índice de Estrés **Articular** en el motor CDG [C]. «IF» también es el Intensity Factor de cardio (`utils/cardioMetrics.ts:86`).
- El atleta puede escribir todo su `nutritionPrograms/{email}` (`firestore.rules`), no solo `lastSeenPhaseId` [C].
- 27 usos de texto por debajo de 11 px, que el propio DS prohíbe (`mesociclo/BarraDeSemanas.tsx`, `roadmap/calendario/NivelSemana.tsx`, `NutritionScreen.tsx`…) [C].
- `Info.plist` `NSCameraUsageDescription` no menciona escanear alimentos [C].

## Lo que NO se pudo verificar

- Pantallas con sesión (Inicio, Nutrición, Perfil completo, Volumen/Ejercicios del coach): sin captura «actual»; las cifras de estilo salen del código. Los bancos `/dev/*` sí se capturaron (ver `mockups/actual/`).
- Datos en vivo de Firestore (cobertura real de `cdgNombre`, nombres de servicios del CRM). Se usaron volcados y código.
- PDF del curso (`~/Downloads/Programación 1/2/3`): no leídos (sin `pdftotext`). Pueden contener reglas de carga aguda/crónica.
