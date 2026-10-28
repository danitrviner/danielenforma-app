# Auditoría de la inteligencia actual frente al autopiloto · 28-10-2026

Entrega 1 del encargo «coach automático con Dani de supervisor». Solo lectura: no se ha tocado código de la app, ni Firestore, ni Vercel. Hecho sobre `origin/main` (`3799d554`, PR #25) en el worktree `~/en-forma-autopiloto`, rama `ia-autonoma` (vacía: solo este informe).

**Línea base:** `npx tsc --noEmit` 0 errores · `npx vitest run` 286 archivos, **3.267 tests en verde** (4 saltados), 9,8 s.

**Cómo se ha medido.** Lectura del código con rutas y líneas; dos scripts de solo lectura con el SDK de administración (en el borrador de sesión, fuera del repo) sobre `aiAuditLog`, `aiUsage`, `aiProposals`, `aiChats`, `athleteStatus`, `latidos`, `cambiosAtleta`, `notifications`, `checkins`, `questionnaireResponses`, `bodyweightLogs`, `weeklyMenus` y el consentimiento de IA de cada atleta. Los datos de atletas se han usado solo de los 17 con consentimiento aceptado y aquí aparecen con alias.

**Lo que NO se ha hecho:** lanzar las tres tareas en vivo contra atletas reales. El asistente solo corre con la sesión de coach de Dani abierta (tools en el navegador, ver B.2), y sin esa sesión no hay forma de ejecutarlo; además cada tarea crea propuestas en producción y cuesta 0,7-2,3 $. En su lugar la sección C audita las **78 propuestas reales** ya creadas, los **22 chats** guardados (4 de ellos con «TAREA:») y lo que Dani corrigió en cada una, que es evidencia más fiel de la calidad que tres ejecuciones nuevas. Si Dani quiere la ejecución en seco, es media hora con su sesión abierta y queda registrada por `chatId`.

---

## 1 · Resumen en diez puntos

1. **La app ya decide casi todo; lo que no tiene es iniciativa ni continuidad.** De las 47 decisiones de una asesoría (sección A), 10 las toma un motor solo, 24 las puede proponer el asistente si Dani se lo pide, 9 son de Dani a mano y **4 no las toma nadie** (peso que deja de registrarse, nota libre fuera de calendario, viaje/enfermedad no declarados, racha de sesiones perdidas como decisión).
2. **El asistente casi no se usa.** 254 llamadas desde el 13-08, 74 propuestas en septiembre y 4 en octubre; en los últimos 30 días, 4 llamadas y 0,57 $. Dani ha vuelto a programar a mano (34 cambios manuales en `cambiosAtleta`, todos de octubre). La autonomía no va a nacer de «usarlo más»: tiene que arrancar sola.
3. **El canal de revisión real es el cuestionario, no el check-in.** 131 respuestas de cuestionario en 60 días frente a **1** check-in de peso. El único feedback que redacta el asistente (`draft_checkin_feedback`) es para `WeightCheckIn`, el canal muerto; para `questionnaireResponses.respuestaCoach`, el vivo, no hay herramienta. `get_revision_engine`, `get_nutrition_analysis` y `get_progress_metrics` no aparecen entre las 30 tools más usadas (≤ 2 usos cada una).
4. **Dani corrige siempre lo mismo y el asistente no aprende.** En 9 de 12 mesociclos aprobados editó o cambió después: alarga el bloque (6→12, 8→12, 4→9, 6→9, 8→10, 12→15: la doctrina dice 12 por defecto y el asistente propone 4-8), quita series de deltoide anterior/posterior, glúteo, gemelo y core, y baja kcal (3.700→2.500, 2.900→2.600). `get_coach_adjustments`, la tool que le enseña eso, se llamó **3 veces** en 254.
5. **Las propuestas no respetan la doctrina de nutrición ni el motor la vigila.** Proteína propuesta 1,1-2,9 g/kg (doctrina §7: 0,8-1 en volumen, 1-1,4 en déficit, y CR1 descartado); un caso con grasa a 0,4 g/kg y 13 % de las kcal (doctrina §7: ≥ 0,6 g/kg y 15-20 %); déficits de −832 y −999 kcal frente al alta (doctrina §6: techo 700). `validators.ts` solo acota 600-7.000 kcal.
6. **El guion «mes nuevo» no puede terminar en un turno:** `propose_workout_days` exige que el mesociclo exista de verdad, así que el asistente se para en «no puedo mandar las sesiones hasta que apruebes el mesociclo» (chat `aichat_1789457688786`). Para un autopiloto eso es una cadena de dependencias entre propuestas que hoy solo resuelve Dani pulsando en orden.
7. **Nada de lo que se aplica tiene «antes» guardado.** `AiProposal` lleva `cambios` (frases) pero 0 de 78 llevan snapshot; `useProposalActions.ts` escribe en el cliente, sin transacción, sin política ni deshacer; el latido escribe con Admin SDK y deja solo recuentos (`latidos/{fecha}`), sin pantalla de «qué hizo la máquina hoy».
8. **Las tools viven en el navegador y dependen de `dbService` (39 funciones del SDK de cliente con espejo en localStorage):** nada de React, pero sí de la sesión de Dani. Los motores son puros y portables tal cual; el trabajo de portar son los lectores/escritores (`api/_lib/db-admin.ts` ya tiene 24 lectores y 8 escritores) y un bucle de agente en servidor troceado por llamadas (la función muere a los 300 s y un mes nuevo son 13 llamadas de mediana).
9. **La puerta del consentimiento tiene un agujero:** `TOOLS_CON_DATOS_DE_ATLETA` (`src/ai/tools.ts:2884`) cubre 10 de las 43 tools; `get_client_brief`, `get_athlete_dossier`, `get_revision_engine`, `get_nutrition_analysis`, `get_progress_metrics`, `propose_workout_days`, `propose_nutrition_program`, `propose_setup_config`… pasan sin comprobar. Para el autopiloto la comprobación tiene que estar en la entrada del episodio, una vez, no por tool. (No se toca `consentimientoIA.ts`: la corrección es en `tools.ts`.)
10. **Coste:** con lo medido (0,06 $ la llamada mediana, 0,68 $ un mes nuevo, 0,11 $ una consulta) un autopiloto completo con Sonnet sale a **~2,5 $/atleta/mes** (20 atletas ≈ 50 $, 50 atletas ≈ 125 $); con Haiku 5.5 en las piezas de redacción y Sonnet solo en alta, revisión y emergentes, **~1,4 $/atleta/mes**. Todo lo que es número (kcal, series, ritmo, adherencia, menú) ya lo calculan motores a coste cero.

---

## A · Cobertura de decisiones

Quién toma hoy cada decisión: **(a)** motor determinista solo · **(b)** el asistente, a petición de Dani y con su aprobación · **(c)** Dani a mano · **(d)** nadie. Las fuentes: `utils/recorridoDelPlan.ts:97-300` (19 pasos), `ai/tareas.ts:60-111`, `api/latido-diario.ts`, `utils/bandejaDelDia.ts`, `utils/clientSetup.ts:111-146`.

### A.1 Alta y plan inicial

| # | Decisión | Hoy | Dónde |
|---|---|---|---|
| 1 | Invitar y crear la cuenta | c | `api/create-athlete.ts` |
| 2 | Repasar el alta, detectar huecos y contradicciones | b (paso 0) / c | `recorridoDelPlan.ts:98-108`, `add_coach_task` `tools.ts:3290` |
| 3 | Fecha de inicio, duración del plan, peso objetivo | b / c | `propose_setup_config` `tools.ts:2972`; aprobación `useProposalActions.ts:370-384` |
| 4 | Consentimiento al tratamiento con IA | el atleta; sin él **nada** | `consentimientoIA.ts:56-58`, `SolicitudConsentimientoIA.tsx` |
| 5 | Reparto propio + plantillas de Dani **o** CDG/IEM | c | `MesocycleManager.tsx`; el asistente solo conoce el reparto (`calcular_reparto`, `list_mis_repartos` `tools.ts:388-409`), **no el CDG** |
| 6 | Series semanales por grupo | a sugiere (`volumeSuggestion.ts:suggestVolume`, `get_volume_suggestion` `tools.ts:3594`) → b propone → c edita (9 de 12 veces) | `propose_mesocycle` `tools.ts:2595` |
| 7 | Ejercicios, series, reps, RIR de cada sesión | b / c | `propose_workout_days` `tools.ts:2688`; exige mesociclo real (`useProposalActions.ts:304-363`) |
| 8 | Publicar el bloque en el calendario | b / c | `propose_publish_block` `tools.ts:3092`; `useProposalActions.ts:462-500` |
| 9 | kcal objetivo, fases y ritmo | b (Mifflin en el alta `energyCalc.ts`) / c | `propose_nutrition_program` `tools.ts:1870`; motor `nutritionPeriodization.ts:78 suggestPhaseTargetKcal` |
| 10 | Dietas activas y calendario semanal | b / c | `propose_setup_config`; `useProposalActions.ts:389-412` |
| 11 | Menú de la primera semana | **c** (generador determinista `menuEngine.ts:generateWeek`, lo lanza Dani en `WeeklyMenuEditor`) | sin tool del asistente, sin automatismo |
| 12 | Objetivo de pasos | b / c | `propose_setup_config` |
| 13 | Cuestionario periódico y fotos | b / c (paquete oficial 27-10) | `propose_setup_config` → `assignQuestionnaire` `useProposalActions.ts:413-432` |
| 14 | Cardio (Zona 2 / VO₂máx) | b / c | `useProposalActions.ts:442-460`, `cardioProgression.ts` |
| 15 | Escalera, fases del plan, hitos, días señalados | b / c | `propose_level_ladder`, `propose_roadmap_items`, `propose_special_day` |
| 16 | Reto de la semana 1 | a (martes, `motorRetoSemanal.ts:137-162`) o c el lunes (`isCoachGraceDay`) | `latido-diario.ts:208-240` |
| 17 | Ficha viva inicial (objetivos, esperado, foco) | b / c | `propose_dossier_update` `tools.ts:2218`; `db/dossier.ts` |

### A.2 Semana a semana

| # | Decisión | Hoy | Dónde |
|---|---|---|---|
| 18 | Dar por perdida una sesión (7 días) | **a** | `latidoDiario.ts:84-103` |
| 19 | Activar la dieta de la fase que toca | **a** | `latidoDiario.ts:105-140` |
| 20 | Peldaños y niveles | **a** | `latidoDiario.ts:142-184` |
| 21 | Crear el reto, evaluarlo y cerrar el anterior | **a** | `motorRetoSemanal.ts:107-188` |
| 22 | Progresión de la semana (RIR, +series, descarga, test) | a **aplica** lo que esté programado (`progression.ts:190-253`, `semanasDelBloque.ts`); **decidirlo** es b (`propose_week_plan` `tools.ts:1974`) o c. En CDG, el motor **propone** (`cdg/progresionIem.ts:155 proponerProgresionIem`, `borradorIem.ts:39`) y Dani aplica a mano | — |
| 23 | Agujetas/bienestar → frenar o acelerar una zona | a propone (`cdg/agujetas.ts:177 propuestaZona`, `contextoDeLaSemana` :146), **c aplica** | `SeguimientoCdg.tsx` |
| 24 | Menú de la semana siguiente | borrador automático solo si cambia la dieta de la semana y solo cuando Dani abre Inicio (`services/menuSemanalAutomatico.ts:29-125`, marca en localStorage); publica c. **0 menús «generado solo» en producción** | `HomeCoachScreen.tsx:85-90` |
| 25 | Ajustes de nutrición por semana (−25 g HC, mantenimiento) | a aplica lo programado (`semanasNutricion.ts:132 aplicarAjustes`); decidirlo b / c | — |
| 26 | Recordar la revisión al atleta | **a** | `recordatoriosRevision.ts:20-52` |
| 27 | Avisar de check-in tardío, plan por vencer | a (cliente del coach, `clientSetup.ts:367-394`) | `notifications` tipo `checkin_late` (18 docs) |

### A.3 Revisión

| # | Decisión | Hoy | Dónde |
|---|---|---|---|
| 28 | Leer el cuestionario y **contestarle** (texto/audio/vídeo) | **c** · b solo redacta feedback de `WeightCheckIn` (`draft_checkin_feedback` `tools.ts:2245`), canal con 1 uso en 60 días | `RespuestaCoachBox.tsx`, `db/questionnaires.ts:446-456`; `BloqueCierre.tsx:80-90` precarga el chat con los titulares |
| 29 | Veredicto: ¿pasa lo que esperábamos? | a calcula (`revisionCoach.ts:347 buildRevisionCoach`, `titularesRevision.ts`, `verificacionObjetivo.ts:298`) → c lee; b si se le pide (tarea `revision`), pero `get_revision_engine` ≤ 2 usos | `ClientRevisionPanel.tsx:279-456` |
| 30 | Ajustar kcal porque el peso no va al ritmo | a **propone y nunca aplica** (`ajusteDePeriodizacion.ts:49 proponerAjuste`, `semanasNutricion.ts:369 evaluarReglasDePeso`, `gastoReal.ts:182 kcalParaObjetivo`) → c | — |
| 31 | Pasar de fórmula a gasto real medido | a calcula (`gastoReal.ts:88`, ventana 4 sem, ≥ 5 días/sem) → c decide | `revision/GastoReal.tsx` |
| 32 | Diet break / cambio de fase | b / c | `objetivoDeFase.ts cambiarObjetivo`, `semanasMantenimiento` |
| 33 | Retocar sesiones o reparto a mitad de bloque | b / c | `propose_workout_days`, `propose_mesocycle` |
| 34 | ¿Toca cambiar de bloque? | a indica (`cdg/lecturaBloque.ts:75 indicadoresCambioDeBloque`) → c | — |

### A.4 Información emergente (fuera de calendario)

| # | Situación | Hoy | Dónde |
|---|---|---|---|
| 35 | Marca «molestia» o agujetas 5 en el cuestionario | a detecta en el **cliente del atleta** y avisa al coach (`alertasRevision.ts:18-40` → `revision_alerta`, `CheckInScreen.tsx:282-295`); la respuesta (sustituir el gesto, §18) es **c** | — |
| 36 | Nota libre («me voy de viaje», «he estado enfermo») | **d**: nadie lee `WeightCheckIn.notes` ni los textos libres del cuestionario salvo Dani; `get_checkins` los enseña al asistente solo si se le pide | — |
| 37 | Deja de registrar peso dos semanas | **d**: la bandeja mira último login y último check-in (`bandejaDelDia.ts:141-157`), no pesajes; `verificarObjetivo` devuelve `sin-datos` sin avisar a nadie | — |
| 38 | Racha de sesiones perdidas | a marca (`latidoDiario.ts:95`), **d** decide: no hay señal «3 perdidas en 14 días» ni en bandeja ni en latido | — |
| 39 | Pide cambiar un ejercicio | c (editor) / b (`propose_week_plan.cambios`, `propose_workout_days`) | — |
| 40 | Fase de déficit que no mueve el peso | a detecta (`clasificarRitmo` `verificacionObjetivo.ts:222`, `reglasPeso`) y propone → **nadie aplica** | — |
| 41 | El reto le queda grande o pequeño | a gradúa por nivel y rendimiento (`challengeOptions.ts`, PR #24); c los lunes | — |
| 42 | Vacaciones, viaje, competición | **c** lo anota (`Mesocycle.eventosSemana` `types.ts:2329`, `UserProfile.pausaRevisiones` `:156`); **d** lo detecta | — |
| 43 | Enfermedad, menstruación | **d**: no hay campo ni señal | — |
| 44 | Estrés, sueño, motivación bajos | a los lee (`cdg/agujetas.ts:146 contextoDeLaSemana`, `readinessIndex.ts`) y **modula una propuesta manual**; nadie actúa solo | — |

### A.5 Renovación y baja

| # | Decisión | Hoy | Dónde |
|---|---|---|---|
| 45 | Cierre del bloque (volumen hecho vs programado, PRs, peso) | a informa (`cierreMesociclo.ts:88`), b si se le pide (`renovar_mes`) | `MesocycleReviewPanel.tsx` |
| 46 | Bloque nuevo partiendo del anterior | b (`renovar_mes`) / c | `tareas.ts:98-110` |
| 47 | Renovación comercial, reseña, referidos, baja, quitar acceso | **c** (CRM, checklist manual `clientSetup.ts:143-146`) | — |

**Recuento:** a = 10 · b = 24 · c = 9 · d = 4. Lo que falta no es inteligencia: en 30 de las 47 filas el número ya lo da un motor o lo sabe proponer el asistente. Falta quién lo dispare, quién lo aplique y quién lo cuente.

---

## B · Qué falta para que el asistente actúe sin Dani

### B.1 Disparadores

Hoy el único reloj es el cron de Vercel a las 02:00 UTC (`vercel.json:3`) que llama a `api/latido-diario.ts`, y el único «botón» es el panel del asistente en la app del coach. Lo que hay y lo que falta por evento:

| Evento | Dónde está hoy | Qué le falta |
|---|---|---|
| Alta completada (onboarding + consentimiento) | `onboarding/{email}.completedAt`; `clientSetup.ts` lo lee en pantalla | Nadie lo observa en servidor. Basta con que el latido compare `completedAt` con una marca `episodios/alta_{email}` |
| Check-in / cuestionario recibido | `questionnaireResponses.submittedAt`; alerta en cliente `CheckInScreen.tsx:282-295` | La detección de molestia corre en el **móvil del atleta**; si lo cierra, no hay aviso. Debe repetirse en servidor con `alertasDeRespuesta` (es pura) |
| Semana nueva del bloque | `progression.ts:119 mesocycleWeekNumber`; el atleta ve «novedades» al abrir | Sin evento. El latido sabe la fecha y los mesociclos (`leerMesociclos`): es una comparación |
| Fin de mesociclo | `bandejaDelDia.ts:160-170` avisa «termina en N días» **en pantalla** | Sin acción en servidor |
| Desvío de peso o adherencia | `verificacionObjetivo.ts`, `adherenciaPorKcal` (`diaDeDieta.ts`), `evaluarReglasDePeso` | Motores puros, ninguno llamado desde el latido |
| N sesiones perdidas | `latidoDiario.ts:95` las marca una a una | Falta el agregado («3 en 14 días») y una acción |
| Dolor marcado | `alertasRevision.ts` (cliente) | Idem fila 2; y la respuesta (sustituir gesto) no existe como motor |
| Nota libre con palabras clave | nada | Es la única pieza que necesita modelo: clasificar la nota (viaje, enfermedad, dolor, cambio de disponibilidad, pregunta) |
| Día señalado que llega | `roadmaps.items.targetDate`, `tasks.dueDate` | El latido no los mira; el atleta ve la nota en su día |
| Peso sin registrar N días | `leerPesajes` ya está en el latido (`latido-diario.ts:149`) | Una regla de 5 líneas |

El latido ya lee por atleta asignaciones, logs, pesajes, pasos, programa, dietas, registros de comida, roadmap y cardio (`latido-diario.ts:142-157`) con 120 días de historial (`:51`), en 8-12 s para 18 atletas (medido en `latidos/2026-10-19…28`, 0 errores). Le faltan cuestionarios/respuestas (solo las lee para recordatorios, `:250-252`), mesociclos (solo para el reto) y onboarding. **Recomendación confirmada:** el latido detecta y encola (`episodios/{id}` con `estado: 'pendiente'`), y un `api/autopiloto.ts` consume la cola en invocaciones cortas.

### B.2 Ejecución en servidor

- **Dónde corren las tools.** `aiClient.ts:520-529`: el bucle ejecuta `executeTool` en el navegador, bajo la sesión del coach; `api/ai-chat.ts` solo reenvía a Anthropic (`:230-241`), con `maxDuration: 300` (`:25`), guarda de 295 s (`:29`) y whitelist `claude-sonnet-5` / `claude-haiku-4-5` (`:31`).
- **Qué dependen de la UI.** Nada de React en `tools.ts`: sus 100 primeras líneas importan `auth` de `../firebase` y **39 funciones de `dbService`** (`tools.ts:23-70`), que es el SDK de cliente con espejo en localStorage y modo `forceLocalOnly` (`db/core.ts:158`). Los motores (`revisionCoach`, `volumeSuggestion`, `nutritionAnalysis`, `buildTrainingReport`, `generateChallengeOptions`, `computeSetupChecklist`, `calcularDerivas`…) son puros y se importan igual en Node (`api/latido-diario.ts:39-43` ya lo hace con `.js`).
- **Portabilidad por tool (43):**
  - *Lectura pura sobre Firestore, portables cambiando el lector:* `get_client_brief`, `list_clients`, `get_client_overview`, `get_onboarding`, `get_training_history`, `get_revision_engine`, `get_volume_suggestion`, `get_diet`, `get_checkins`, `get_questionnaire_trends`, `get_food_library` (sin red), `search_knowledge`, `get_exercise_library`, `get_exercise_usage`, `get_coach_adjustments`, `calcular_reparto`, `list_mis_repartos`, `get_athlete_dossier`, `get_setup_status`, `get_plan_context`, `get_challenge_options`, `get_proposal_feedback`, `get_progress_metrics`, `get_nutrition_analysis` — **24**.
  - *Escritura de propuesta (crean `aiProposals` + hecho en la ficha):* las 16 `propose_*` y `draft_checkin_feedback`, `generate_report_draft`, `log_dossier_fact`, `add_coach_task` — **20**. Portables igual; lo que no existe en servidor es **aplicarlas** (ver B.4).
  - *Dependen del estado del cliente:* ninguna de verdad. `proposeWorkoutTemplate`/`createWorkoutStrict` usan `auth.currentUser.uid` como `ownerId` (`useProposalActions.ts:345,523`); en servidor hay que fijar el UID del coach.
- **Lo que ya hay en servidor:** `api/_lib/db-admin.ts` con 24 lectores y 8 escritores (`:50-237`), `api/_lib/auth.ts` (`getAdminDb` `:112`, `COACH_EMAIL` `:9`), patrón de secreto de cron (`latido-diario.ts:80-94`), modo `?seco=1` (`:108`) y resumen sin correos (`:286-300`).
- **Tiempo y tamaño de un episodio, medido en `aiAuditLog` (254 llamadas, todas Sonnet 5):**

| Tipo de chat | n | Llamadas (mediana) | Tokens de salida (mediana) | $ mediana | $ p90 |
|---|---|---|---|---|---|
| Mes nuevo / renovar (propone mesociclo + sesiones) | 8 | 13 | 18.400 | 0,68 | 2,28 |
| Propuesta suelta (dieta, periodización…) | 8 | 14 | 26.500 | 0,99 | 3,79 |
| Consulta de lectura | 10 | 3 | 5.200 | 0,11 | 0,51 |
| Todas | 28 | 7 | — | 0,49 | 1,71 |

  Por llamada: mediana 0,06 $, p90 0,17 $, máximo 0,42 $; `stop_reason` `max_tokens` en 7 de 254 (2,8 %), todos antes de subir el tope a 16.000. Caché: 9,56 M tokens leídos de caché frente a 4,28 M de entrada normal y 1,73 M de escritura (la caché de 1 h funciona). A ~85 tokens/s medidos, una ronda de 2.000 tokens de salida son 25 s: **13 rondas no caben en una invocación de 300 s**. El bucle en servidor tiene que guardar el estado del episodio en Firestore y continuar en la siguiente invocación (o una invocación por ronda encadenada con `fetch` a sí misma).

### B.3 Memoria y continuidad

- **Ficha viva** (`athleteStatus/{email}`, `db/dossier.ts:27`): juicios (objetivos, evaluación, esperado, foco, preguntas) + `hechos` append-only con tope **60** (`:31`). En producción: 13 fichas, mediana 7 hechos, máximo 29; **6 con juicios** rellenados. Hechos por tipo: propuesta 61, aprobación 63, observación 27, cambio 5. Cada episodio semanal añade 3-6 hechos: con 60 de tope, la semana 6 **ya no ve la semana 1** de un atleta activo. Hace falta compactar por episodio (un resumen por episodio, no un hecho por propuesta) o subir el tope por tipo.
- **Ajustes de Dani** (`get_coach_adjustments` → `derivaPropuestas.ts:81 calcularDerivas`): compara propuesta aprobada con la entidad viva. Funciona (ha detectado las derivas de A.1) pero el asistente lo llamó 3 veces en 254 llamadas; el brief lo trae solo en `mes_nuevo` y `renovar_mes` (`tareas.ts:66,103`), no en `revision`.
- **Historial de cambios del coach** (`cambiosAtleta`, `db/cambios.ts:39-77`): 34 entradas, nutrición 28 / entreno 6, solo desde octubre. Lo escribe únicamente el coach desde el cliente (`:45`); el latido y una futura escritura automática **no dejan rastro ahí**. Debe ser el mismo registro para humano y máquina, con `autor`.
- **Lo que se pierde entre episodios:** el `expediente` queda en la propuesta (39 de 78 lo llevan; 27 con preguntas, 38 con «esperado»), pero nadie **comprueba** después si lo esperado pasó: no hay campo «resultado» ni episodio que lo cierre. Las preguntas del expediente no llegan al atleta (ver D). Y el chat (`aiChats`) no se relee nunca: cada tarea arranca de cero con el brief.

### B.4 Aplicar sin aprobar

- `useProposalActions.ts:129-634` materializa en el cliente: `createDiet`/`updateDiet` (`:140-151`), `createMesocycle` + `distribucionDeMeso` (`:152-159`), sesiones día a día sin transacción (`:314-363`, con recuento de lo guardado si falla), publicación idempotente por `workoutId_date` (`:482-487`), `saveNutritionProgram` conservando `cambiosSemana` etc. (`:198-213`), `weekPlan` sobre `weeklyProgression` (`:215-269`). Todo es lógica de «qué escribir» entrelazada con React (`useQueryClient`, `setError`). Para el servidor hay que **extraer cada rama a una función pura `aplicarPropuesta(kind, payload, lector) → escrituras[]`** y que el hook y el servidor la compartan, como ya hacen `latidoDiario.ts` y `motorRetoSemanal.ts`.
- **Validadores** (`ai/validators.ts`): dieta (600-7.000 kcal `:62-63`, comidas ±10 % `:68`), mesociclo (`:220`), fases (`:286`), sesiones (`:360`, ejercicios por nombre contra el catálogo), escalera (`:458`). Corren **antes de crear la propuesta**, en el cliente; en servidor valen igual (puros). Lo que **no** validan: proteína y grasa por kg (CR1 descartado por Dani, pero el suelo de grasa y el techo de déficit de la **propia doctrina** tampoco), material del atleta, lesiones contra ejercicios, kcal frente a Mifflin o gasto real.
- **`acotarExtrasDeComida`** (`updateWeeklyMenu`, tope 400 kcal/día) y el tope por comida son invariantes **de cliente** (auditoría de septiembre, §Fase 2): el servidor tiene que llamarlos al publicar un menú.
- **Reglas de Firestore:** `diets`, `mesocycles`, `workouts`, `workoutAssignments`, `nutritionPrograms`, `roadmaps`, `weeklyChallenges`, `tasks`, `athleteDietConfigs` solo admiten escritura de `isCoach()` (`firestore.rules:259-729`). El Admin SDK **se las salta**, así que no hay que abrir nada; lo que hace falta es lo contrario: un campo `autor: 'asistente'` + `episodioId` en lo que escriba la máquina, y que `aiProposals` admita `status: 'aplicada'` con `politica`.
- **Deshacer:** hoy no existe. `cambios` son frases (`cambiosPropuesta.ts`), no datos; `baseEntityId`/`resultEntityId` dicen qué documento, no cómo estaba. Hace falta `snapshotAntes: { coleccion, id, datos }[]` escrito **en la misma propuesta** antes de aplicar, y `deshacer()` = volver a escribir esos documentos (para asignaciones creadas, borrarlas por id). Las entidades compuestas (bloque + sesiones + asignaciones) necesitan el snapshot de las tres.

### B.5 Seguridad clínica

- **Barreras hoy:** doctrina §18 (`ai/doctrina.ts:226-233`: lesión activa → nunca el gesto; dolor articular persistente, embarazo, patología, medicación → «márcalo para revisión mía») y §19 (`:235-246`); condiciones de salud del alta con código de recetario (`dietaryRestrictions.ts:80 HEALTH_CONDITIONS`: celiaquía 66, lactosa 87/113, fructosa 86/114, histamina 89, hipercolesterolemia 92, **embarazo 109, lactancia 110**) que filtran duro en el generador de menús (`menuEngine.ts filtroDuro`); alergias en texto libre; `alertasRevision.ts` (molestia, agujetas 5, retención ≤ umbral). **Nada de esto es un validador**: la doctrina es texto que el modelo puede ignorar, y `validators.ts` no cruza lesiones con ejercicios ni condiciones con kcal.
- **Lo que NUNCA debe decidir la máquina sola** (propuesta para la política):
  1. Cualquier cambio de entrenamiento o dieta en un atleta con lesión activa declarada, dolor marcado en el último cuestionario, embarazo/lactancia (109/110), patología o medicación relevante en el alta, o trastorno alimentario sospechado (texto libre).
  2. Déficit por encima del techo de la doctrina (700 kcal) o por debajo del suelo de 1.400 kcal (`ajusteDePeriodizacion.ts:41`); grasa por debajo de 0,6 g/kg; proteína fuera del rango de la doctrina vigente.
  3. Sustituir un ejercicio por dolor **sin** patrón equivalente disponible; añadir ejercicios que el atleta no puede hacer con su material (hoy `equipment` está vacío en el alta de los atletas de la muestra).
  4. Mesociclo nuevo o cambio de reparto; publicar un bloque.
  5. Pausar, dar de baja, renovar, o hablar de dinero.
  6. Cualquier texto al atleta que diagnostique, recomiende ver a un médico o hable de medicación.
  7. Actuar sobre un atleta sin consentimiento aceptado (hoy 2 de 19 sin responder).
- **El agujero del consentimiento:** `TOOLS_CON_DATOS_DE_ATLETA` (`tools.ts:2884-2888`) lista 10 tools. `get_client_brief` (`:1481`) llama a los lectores internos sin pasar por `comprobarConsentimiento` (`:2890`), igual que `get_athlete_dossier`, `get_revision_engine`, `get_nutrition_analysis`, `get_progress_metrics`, `get_setup_status`, `get_plan_context`, `propose_workout_days`, `propose_nutrition_program`, `propose_setup_config`, `propose_week_plan`… Es un hallazgo de hoy, no solo del autopiloto. La corrección va en `tools.ts` (comprobar una vez en `executeTool` para cualquier tool con `athlete_email`), no en `consentimientoIA.ts`.

### B.6 Coste

Precios vigentes (Messages API): Sonnet 5 y Sonnet 5.5 2 $/M entrada · 10 $/M salida · caché 0,20 $/M; Haiku 4.5 1 $/5 $; **Haiku 5.5 0,10 $/0,50 $** (diez veces menos que Haiku 4.5); Opus 5.5 4 $/20 $. La whitelist de `api/ai-chat.ts:31` y la tabla de precios `:160-163` no conocen Sonnet 5.5 ni Haiku 5.5.

Estimación por episodio con el brief en caché (≈ 50 k tokens de sistema cacheados + 20-40 k de brief):

| Episodio | Sonnet (medido o derivado) | Haiku 5.5 | Partes deterministas (0 $) |
|---|---|---|---|
| Cuestionario recibido → feedback + decidir si hay desvío | 0,08-0,15 $ (1-2 llamadas) | 0,005-0,01 $ | titulares, adherencia, ritmo de peso, alertas |
| Semana nueva | 0,03-0,05 $ (1 llamada de redacción) | 0,003 $ | progresión, descarga, menú, reto, ajustes de nutrición |
| Revisión (mitad/fin de bloque) | 0,5-1 $ (5-10 llamadas, medido «consulta/propuesta») | 0,05 $ | revisión del coach, verificación, gasto real, cierre |
| Alta / renovación (plan entero) | 0,68 $ mediana, 2,28 $ p90 (medido) | 0,05-0,15 $ (calidad por comprobar) | reparto, volumen, Mifflin, menú, escalera |
| Información emergente | 0,1-0,3 $ | 0,01 $ | detección (palabras clave, umbrales) |

Por atleta y mes (4 cuestionarios, 4 semanas, 1 revisión, ⅓ de alta/renovación, 2 emergentes): **Sonnet ≈ 2,5 $ · mixto (Haiku redacta, Sonnet decide en alta/revisión/emergente) ≈ 1,4 $ · todo Haiku 5.5 ≈ 0,15 $.** Con 20 atletas: 50 / 28 / 3 $ al mes; con 50 atletas: 125 / 70 / 8 $. El gasto real de Dani en toda la vida del asistente han sido 19,38 $. Los topes de `ai-chat.ts` (400 llamadas/día `:40`, `AI_DAILY_USD_LIMIT` `:51`) sirven tal cual para el autopiloto si comparten el documento `aiUsage/daily_*`.

---

## C · Calidad de lo que ya propone

Base: 78 propuestas (septiembre 74, octubre 4), 14 atletas, **60 aprobadas y 18 rechazadas (76,9 %)**, 0 pendientes, **0 comentarios** (nadie ha usado «Rehacer con mis comentarios»), 39 con expediente, 0 con snapshot. 22 chats guardados, 4 con `TAREA:`.

### C.1 ¿Respeta la doctrina?

- **Duración del bloque.** Doctrina §11: 12 semanas por defecto. Propuesto: 4, 4, 6, 6, 6, 6, 6, 8, 8, 8, 12, 12. Dani alargó 6 de ellos al aprobar o después (`athleteStatus.hechos` «Dani editó la propuesta antes de aprobarla: semanas 6 → 9», «8 → 10», «4 → 9»; derivas 6→12, 8→12, 12→15). Fallo reproducible: el prompt de sistema dice «mesociclo de 12 semanas» pero `propose_mesocycle` no tiene valor por defecto ni el validador avisa por debajo de 8.
- **Grupos que Dani no programa.** En 4 de 12 mesociclos Dani puso a **cero** deltoide anterior, deltoide posterior, glúteo, gemelo o core que el asistente había puesto a 4-6 series (Angel, Marco, Javier V., Pedro R.). El asistente reparte series a los 14-15 grupos; Dani trabaja 9-10. `get_coach_adjustments` lo habría dicho: se llamó 3 veces.
- **Proteína.** Doctrina §7: 0,8-1 g/kg (volumen), 1-1,4 (déficit), «no me lo discutas». Propuesto: 1,1 · 1,3 · 1,4 · 1,5 · 1,6 · 1,7 · 1,8 · 2,1 · 2,4 · **2,9** g/kg. Solo 2 de 29 dietas están dentro del rango de la doctrina. El modelo sigue la convención genérica (y `energyCalc.ts` del alta pone 2 g/kg: la app se contradice, CR1 ya lo dijo y Dani lo descartó: entonces la doctrina manda y el validador debería avisar).
- **Grasa y déficit.** Angel: G 33 g = 0,4 g/kg y 13,5 % de las kcal (doctrina: ≥ 0,6 g/kg, 15-20 %). Javier M.: −832 kcal frente al alta; Marco: −999 (doctrina §6: techo 700 salvo «mucha grasa», que no se justifica en el expediente). Gonzalo M.: 3.700 kcal de superávit (+292 sobre el alta) que Dani bajó a 2.500 al aprobar.
- **Sesiones.** 13-22 series por día, RIR 0-2, 4-5 días: coherente con §3-§4. Ejercicios: 0-4 de cada 20-26 son ejercicios que el coach no usa en ninguna otra rutina (los repetidos: «Press de hombros con mancuernas sentado (caja torácica amplia)» y «Prensa pendular pies abajo (menor dorsiflexión)»); el bloque «CÓMO PROGRAMA DANI» funciona, pero `get_exercise_library` (41) y `get_exercise_usage` (25) siguen siendo las tools más llamadas.

### C.2 ¿Usa los números del motor o inventa?

- Los mesociclos pasan por `get_volume_suggestion` cuando el guion lo exige; las kcal salen del alta (Mifflin) o del «overview». No he visto cifras inventadas en los expedientes revisados; sí **asunciones** explícitas: «asumido 4 días × 60 min», «asumido gym completo» (equipment vacío en todos los onboarding de la muestra).
- `get_revision_engine`, `get_nutrition_analysis`, `get_progress_metrics`: ≤ 2 usos. Las revisiones que ha hecho el asistente se apoyaron en `get_training_history` (16) y `get_checkins` (9), los datos crudos, exactamente lo que `tareas.ts:78-82` quería evitar.

### C.3 ¿Propone por proponer?

Sí en roadmap y días señalados: hitos, AMRAP y retos «Registra tus pasos 3 días» aparecen en todos los montajes y 5 de 18 rechazos son de ese tipo. Y la tarea `renovar_mes` de Gonzalo (`aichat_1789222204049`) se quedó en 4 mensajes sin cierre: leyó el brief y no propuso nada.

### C.4 ¿Rellena el expediente?

39 de 78. Lo rellenan mesociclo (11/12), sesiones (6/6), dieta (14/18), bloque (4/4), setup (3/4); **no** lo rellenan `nutritionProgram` (0/7), roadmap (0/6), specialDay (0/5), reto (0/4), plantillas (0/4). Dossier: 1/8. El `esperado` que escriben es bueno («700-900 g/semana las primeras 2-3 semanas»); nadie lo comprueba después.

### C.5 Fallos reproducibles con `chatId`

| chatId | Qué | Dónde está la causa |
|---|---|---|
| `aichat_1789457688786` (Angel, mes nuevo, 24 msgs) | Cierra con «Sesiones + publicación: pendientes, no puedo mandarlas hasta que apruebes el mesociclo» | `proposeWorkoutDays` exige `mesocycle_id` real (`tools.ts:2688`); el guion promete «todo en un turno» (`tareas.ts:121`) |
| `aichat_1789479858168` (Marco, mes nuevo) | Mesociclo de 4 semanas con 14 grupos, 2.900 kcal; Dani: 9 semanas, 3 días, 6 grupos a cero, 2.600 kcal | Sin lectura de `get_coach_adjustments`; sin default de 12 semanas; sin aviso de déficit −999 |
| `aichat_1789638641379` (Ander, paso 4 solo) | Periodización rechazada: fase de «iniciación» sin dieta, volumen con «HC 12 / PROT 8 / GRASA 7» intercambios y P 2,4 g/kg | Chat con prompt anterior al paso a kcal (26-10); doctrina §7 ignorada |
| `aichat_1789222204049` (Gonzalo, renovar) | Brief leído, 0 propuestas, sin cierre | Turno abortado o cortado; no hay reanudación automática (`aiClient.ts:505-512` deja el historial listo pero nadie lo retoma) |
| `aichat_1788516955587` (Daniel B., dietas) | 3 versiones rechazadas de la misma dieta de descanso antes de aprobar la v3; cambio apuntado «el onboarding marca vegano pero no lo es» | El alta era falsa y el asistente lo descubrió a la tercera; sin expediente de huecos al inicio |

---

## D · Pantallas de supervisión que existen

| Pantalla | Qué muestra | Qué permite deshacer | Qué NO ve |
|---|---|---|---|
| **Propuestas** (`CoachProposalsScreen.tsx:26-153`) | Solo `status: 'proposed'` agrupadas por atleta, en orden de aprobación; tarjeta con antes→después, expediente, editor, comentarios; «Aprobar todo en orden», «Rehacer con mis comentarios» | Nada: una vez aprobada desaparece (no hay historial ni filtro de aprobadas/rechazadas) | Lo aplicado, lo rechazado, lo que hizo el latido, el coste |
| **Tarjetas del Hub** (`ClientHub.tsx`, pestaña `revision`; `ClientAlertsBar.tsx`) | Propuestas pendientes del atleta y acceso al panel | — | — |
| **Bandeja del día** (`HomeCoachScreen.tsx:135`, `bandejaDelDia.ts:92-218`) | 7 categorías: plan sin publicar, revisiones pendientes, propuestas sin revisar, sin entrar 7 días, sin check-in 10 días, bloque termina, montaje < 80 %; pagos vencidos | — | Pesajes, sesiones perdidas, alertas de cuestionario, **nada de lo que hizo el latido** |
| **Historial de cambios** (`ClientRevisionPanel.tsx:436` «Lo que he cambiado» → `BloqueCambios`, `cambiosAtleta`) | Frases antes→después de lo que guardó el coach (dieta, programa, calendario, meso, recetas) | No deshace; solo lee | Cambios del latido o de una aprobación de propuesta (la aprobación escribe por `dbService` como coach, así que **sí** entra, pero sin marcar que vino de una propuesta) |
| **Revisión del cliente** (`ClientRevisionPanel.tsx:279-456`) | Patrones, mejores/peores, series por grupo, cardio, bienestar, qué ha comido, adherencia, cuerpo, lo recibido, retos, cambios, **cierre** (titulares `paraCliente`, copiar, «Que lo redacte el asistente», nota a la ficha) | — | No hay botón «aplicar lo que propone el motor» (ajuste de kcal, cambio de bloque): se lee y se va a otra pestaña |
| **Setup / checklist** (`clientSetup.ts:111-146`, pestaña `setup`) | 31 ítems en 4 fases, con alertas (`:367-394`) | — | Quién completó cada ítem (Dani o el asistente) |
| **Calendario / roadmap** (`roadmapCalendar.ts`, `AthleteRoadmapScreen`) | Bloques, fases, hitos, revisiones, eventos de semana | — | Decisiones del asistente por semana |
| **Latido** (`latidos/{fecha}`) | Solo recuentos por acción, **sin pantalla** | — | Todo: qué atleta, qué sesión, qué dieta activó |
| **Ficha viva** (`DossierPanel.tsx`) | Juicios + 60 hechos | — | Línea de tiempo por episodio |
| **Panel del asistente** (`AiChatPanel.tsx`) | Chats, coste por llamada y del día (`onCost`, `onGastoDelDia`) | — | Coste por atleta o por episodio |

Lo que el **atleta** ve hoy de la máquina: notificaciones (403 en total: reto nuevo 143, reto conseguido 46, cambio de fase 22, recordatorios), «novedades» de la semana en su entreno, la nota del coach en un día, los reportes enviados, la respuesta del coach a su revisión (`RespuestaDelCoach.tsx`), el feedback del check-in. **No hay un canal de mensajes** del coach; lo más parecido es `respuestaCoach` por cuestionario + notificaciones deterministas. Las `preguntas` del expediente nunca le llegan.

---

## E · Deuda que bloquea

| # | Qué | Dónde | Por qué bloquea |
|---|---|---|---|
| E1 | Consentimiento comprobado solo en 10 de 43 tools | `tools.ts:2884-2888` | Un episodio en servidor leería datos de atletas sin decisión registrada |
| E2 | `tools.ts` de 3.977 líneas: definiciones, lectores, propuestas y despachador juntos; las propuestas crean `aiProposals` **y** escriben hechos en la ficha dentro de la misma función | `tools.ts` | No se puede importar «solo lectura» en servidor sin arrastrar todo; el despachador `executeTool` (`:3676`) es un `switch` de 300 líneas |
| E3 | Aplicación de propuestas acoplada a React | `useProposalActions.ts:129-634` | Nada de eso se puede ejecutar en servidor |
| E4 | `dbService` como única capa de datos de las tools (39 funciones) | `tools.ts:23-70` | Hay que duplicar cada lectura en `db-admin.ts` o abstraer un `Lector` común |
| E5 | Sin snapshot «antes» ni `politica`/`autor` en `AiProposal` | `types.ts:3007-3028` | Sin deshacer, sin saber si lo aplicó Dani o la máquina |
| E6 | Ficha viva: 60 hechos de tope, un hecho por propuesta y otro por aprobación | `db/dossier.ts:31`, `tools.ts:2152`, `useProposalActions.ts:603-620` | La memoria se llena en 6 semanas de autopiloto |
| E7 | `cambiosAtleta` solo acepta al coach como autor | `db/cambios.ts:45` | El historial que ve Dani no contaría lo automático |
| E8 | Detección de molestia/agujetas 5 en el cliente del atleta | `CheckInScreen.tsx:282-295` | Si el móvil cierra antes, no hay alerta; debe duplicarse en servidor |
| E9 | `draft_checkin_feedback` apunta a `WeightCheckIn`; no hay tool para `respuestaCoach` del cuestionario | `tools.ts:2245`, `db/questionnaires.ts:446` | El episodio «check-in recibido» no tiene salida hacia el canal real |
| E10 | El asistente no conoce el CDG: ni `proponerProgresionIem`, ni `propuestaZona`, ni `cdgObjetivosIem`, ni elegir CDG frente a reparto | `tools.ts` (sin tool), `cdg/*` | El punto 6 del diseño no tiene base |
| E11 | Menú automático: solo borrador, solo si cambia la dieta, solo al abrir Inicio, marca en localStorage; 0 generados hasta hoy | `menuSemanalAutomatico.ts:26,91,114-125` | Hay que llevarlo al servidor y decidir publicación |
| E12 | Doctrina §7 (0,8-1 g/kg) contradice `energyCalc.ts` (2 g/kg) y lo que propone el asistente (1,1-2,9); §6 suelo de grasa 0,8 g/kg frente a §7 0,6 g/kg | `doctrina.ts:309-336`, `energyCalc.ts` | Un validador de doctrina necesita un solo número; Dani descartó CR1, así que hay que fijar cuál manda |
| E13 | Validadores sin reglas de doctrina ni clínicas (g/kg, techo de déficit, lesión↔ejercicio, material) | `validators.ts` | Aplicar sin aprobar exige que estén en código |
| E14 | Whitelist y precios sin Sonnet 5.5 / Haiku 5.5 | `ai-chat.ts:31,160-163` | El coste mixto de B.6 no es posible |
| E15 | Un turno cortado no se reanuda solo (`max_tokens`, 300 s) | `aiClient.ts:505-512`, `ai-chat.ts:285-290` | En servidor el episodio tiene que ser reanudable por diseño |
| E16 | Función de 300 s y una invocación por turno | `ai-chat.ts:25` | Episodios largos no caben: hace falta estado del episodio en Firestore |
| E17 | «IA» en pantalla: no queda ninguno visible (solo comentarios de código y nombres de fichero `SolicitudConsentimientoIA.tsx`); el icono `smart_toy` aparece en 11 sitios | — | No bloquea; se respeta ya |
| E18 | Tests: 3.267 en verde; `useProposalActions` sin test; `reportBuilder` sin test; el latido tiene tests de puerta y de integración | — | La extracción de E3 debe nacer con tests |

---

## F · Tabla final de hallazgos

| Id | Qué | Dónde | Por qué importa para la autonomía | Esfuerzo | Tanda |
|---|---|---|---|---|---|
| H1 | Consentimiento comprobado solo en 10 de 43 tools | `tools.ts:2884` | Sin puerta única, el episodio puede leer sin consentimiento | S | 1 |
| H2 | Separar `tools.ts` en definiciones / lectores / propuestas / despachador | `tools.ts` | Importar lectores en servidor sin arrastrar el resto | M | 1 |
| H3 | Extraer `aplicarPropuesta()` pura de `useProposalActions` con tests | `useProposalActions.ts:129-634` | Aplicar en servidor con las mismas garantías | M | 2 |
| H4 | `AiProposal` con `snapshotAntes`, `politica`, `autor`, `episodioId`, `status: 'aplicada'`, `resultado` | `types.ts:3007` | Deshacer y auditar | S | 2 |
| H5 | Bandeja «hoy»: lo aplicado, lo propuesto, lo escalado; fila del latido por atleta | `HomeCoachScreen.tsx`, `bandejaDelDia.ts` | Dani no ve lo que hizo la máquina | M | 2 |
| H6 | Capa de lectura compartida cliente/servidor (`Lector`) o completar `db-admin.ts` para el brief | `db-admin.ts`, `tools.ts:23-70` | Brief en servidor | M | 3 |
| H7 | Bucle de agente en servidor, reanudable, estado en `episodios/{id}`, una ronda por invocación | nuevo `api/autopiloto.ts` | Episodios largos sin la app abierta | L | 3 |
| H8 | Latido detecta y encola: cuestionario recibido, semana nueva, fin de bloque, peso sin registrar, racha de perdidas, desvío de peso/adherencia, alta completada | `latido-diario.ts`, `latidoDiario.ts` | Son los disparadores; casi todo es comparar fechas | M | 3 |
| H9 | Tool y episodio para `respuestaCoach` del cuestionario (el canal vivo) + `alertasDeRespuesta` en servidor | `tools.ts:2245`, `alertasRevision.ts` | Sin esto el episodio «check-in» no habla con el atleta | M | 3 |
| H10 | Validadores de doctrina y clínica en código: g/kg (con la cifra que fije Dani), suelo de grasa, techo de déficit, lesión↔ejercicio, material | `validators.ts`, `doctrina.ts` | Aplicar sin aprobar exige reglas duras | M | 4 |
| H11 | Política de autonomía por tipo y por atleta + modo rodaje medido con derivas | nuevo `utils/politicaAutonomia.ts`, `coachSettings` | El corazón del punto 3 | M | 4 |
| H12 | Episodio «semana nueva»: aplicar progresión programada, generar y (según política) publicar menú, reto, texto al atleta | `semanasDelBloque.ts`, `menuSemanalAutomatico.ts` → servidor | Primer episodio automático de verdad | L | 4 |
| H13 | Episodio «alta» en servidor con cadena de dependencias resuelta internamente (mesociclo → sesiones → publicar) | guion de `tareas.ts` | Hoy se para en el paso 2 | L | 5 |
| H14 | Episodio «revisión» con `get_revision_engine` obligatorio y comprobación del `esperado` anterior | `tareas.ts:84-96` | Veredicto con los números del motor | L | 5 |
| H15 | Default 12 semanas, grupos de Dani y `get_coach_adjustments` en el brief de las tres tareas | `tareas.ts`, `tools.ts:2595` | Las correcciones repetidas de C.1 | S | 1 |
| H16 | Episodios emergentes: dolor (sustitución por patrón), perdidas, peso sin registrar, nota libre clasificada, viaje | nuevo | Las 4 decisiones que hoy no toma nadie | L | 6 |
| H17 | Cierre de bloque y renovación: `cierreMesociclo` + `renovar_mes` en servidor; lo comercial a Dani | `cierreMesociclo.ts`, `tareas.ts:98` | Continuidad entre bloques | L | 7 |
| H18 | Centro de supervisión: línea de tiempo por atleta, política editable, auditoría de 5 minutos, coste | `CoachProposalsScreen`, `ClientRevisionPanel` | Supervisar sin leer chats | L | 8 |
| H19 | Canal del atleta: mensajes del episodio, preguntas del expediente como cuestionario corto, firma | `CheckInScreen`, `notifications` | Lo que el atleta ve | L | 8 |
| H20 | Asistente con CDG: tools `get_iem_programado`, `proponer_progresion_iem`, `freno_acelerador`; criterio para elegir CDG vs reparto | `cdg/*`, `tools.ts` | Punto 6 del diseño | L | 5 |
| H21 | Memoria: resumen por episodio en la ficha, tope por tipo, `cambiosAtleta` con autor máquina | `db/dossier.ts:31`, `db/cambios.ts:45` | Que la semana 6 sepa qué pasó en la 2 | S | 2 |
| H22 | Whitelist y precios con Sonnet 5.5 y Haiku 5.5; modelo por tipo de episodio | `ai-chat.ts:31,160` | Coste mixto | S | 3 |
| H23 | Modo sombra: el episodio decide y compara con lo que hizo Dani, sin escribir | nuevo | Primeras semanas | M | 3 |
| H24 | Unificar doctrina §6/§7 y `energyCalc` en una cifra de proteína y grasa | `doctrina.ts`, `energyCalc.ts` | Decisión de Dani; prerrequisito de H10 | S (decisión) | 1 |
| H25 | QA con 3 atletas reales en sombra y paso a automático por tipos | — | Cierre | M | 9 |

---

## G · Lo que no he podido comprobar

- **El asistente en ejecución** (ver cabecera). Las conclusiones de C salen de propuestas y chats guardados, no de ejecuciones nuevas.
- **El latido en Vercel** más allá de sus registros en `latidos/*` (0 errores, 8-12 s); no lo he lanzado en seco.
- **Pantallas**: todo lo de D es por lectura de código; no he abierto la app (sin sesión de coach).
- **Plan de Vercel**: si el cron puede pasar de diario a horario y si las invocaciones encadenadas caben en el plan actual (`maxDuration: 300` ya está en uso).
- **`search_knowledge` y la bóveda**: fuera de alcance.

---

## H · Lo que Dani tiene que decidir antes del diseño

Se le pregunta en la sesión (AskUserQuestion) al cerrar esta entrega: niveles iniciales de la tabla de autonomía; quién firma los mensajes al atleta; umbrales de desvío que considera «tocar»; qué decisiones se queda siempre él; presupuesto mensual; si el menú automático puede publicarse solo; si el atleta puede pedir cambios al asistente directamente; qué pasa con los atletas sin consentimiento. Y una más que ha salido de la auditoría: **qué cifra de proteína y grasa manda** (doctrina 0,8-1 / energyCalc 2 g/kg), porque sin eso no hay validador posible.
