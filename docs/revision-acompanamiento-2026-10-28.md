# Revisión del acompañamiento · 28-10-2026

Entrega 1 del encargo «que el cliente sienta cada día que Dani lo supervisa» (KPI: churn < 10 %, `UserProfile.fechaBaja` / `motivoBaja`, `src/types.ts:190-247`). Solo lectura: no se ha tocado código, Firestore ni Vercel. Hecho sobre `origin/main` (`b5a634f5`, PR #26) en el worktree `~/en-forma-acompanamiento`, rama `acompanamiento-retencion` (vacía: solo este informe, el plan y las capturas).

**Cómo se ha medido.** Dos scripts de solo lectura con el SDK de administración (en el borrador de sesión, fuera del repo) sobre `user_profiles`, `onboarding`, `questionnaireResponses`, `questionnaireAssignments`, `checkins`, `bodyweightLogs`, `workoutLogs`, `workoutAssignments`, `dietCompletionLogs`, `menuCompletionLogs`, `stepLogs`, `notifications`, `coachDayNotes`, `coachReports`, `cambiosAtleta`, `coachNotes`, `roadmaps`, `weeklyChallenges`, `athleteStatus`, `mesocycles`, `crmServicios`, `latidos`, `progressPhotos`, `tasks`, `coachClientTasks`, `weeklyMenus`, `aiProposals`. Los atletas aparecen con nombre e inicial. Pantallas: capturas reales de los bancos `/dev/revision`, `/dev/retos` y `/dev/progresion` (en `docs/revision-acompanamiento-capturas/`); Inicio, sala de espera, entreno y menú no tienen banco de pruebas y se describen por el código.

**Lo que NO se ha podido medir:** Sentry (sin DSN en esta sesión), los chats de WhatsApp (la skill `whatsapp-clientes` vive fuera de la app y no deja rastro en Firestore) y el correo de alta (plantilla de Firebase, no hay registro de envío).

---

## 0 · Resumen en diez puntos

1. **La app registra mucho y devuelve casi nada.** En 60 días los atletas han enviado 131 cuestionarios con 276 textos libres, 109 fotos y miles de registros de comida y entreno. Lo que han recibido de Dani dentro de la app: **0 respuestas a cuestionarios, 0 notas del día, 0 reportes**. Las 211 notificaciones que les han llegado son todas de máquina (139 «nuevo reto», 41 academia, 22 «reto conseguido», 9 fase de nutrición).
2. **Matiz justo:** el canal para contestar un cuestionario (`respuestaCoach`, PR #20) tiene **un día** en producción (27-10). No es que Dani no conteste: es que hasta ayer no podía hacerlo en la app, y lo hace por WhatsApp, donde la app no lo ve. La consecuencia es la misma para el atleta: en la app, su revisión cae en un pozo.
3. **El cuestionario es el canal vivo y se le da por «visto» tarde.** 125 de 131 respuestas llevan `reviewedAt`, pero la mediana entre enviar y «visto» es **170 h (7 días)**; solo 9 de 131 (7 %) tuvieron una reacción visible en la app en 96 h, todas por un cambio de plan en `cambiosAtleta`, no por un texto.
4. **Nadie lee los problemas donde el atleta los escribe.** 11 textos de «LESIONES/MOLESTIAS», 14 de feedback de entreno, 12 de dieta en 60 días. La alerta de molestia (`alertasRevision.ts`) avisa al coach, pero la respuesta no vuelve al atleta por ningún sitio de la app.
5. **La primera semana no tiene guion para el cliente.** Espera mediana de 58 h entre terminar el alta y ver su plan (máximo 294 h; Angel 285 h, Ruben 214 h, Pedro 114 h). Lo que ve mientras: «Dani está montando tu plan» con tres tareas (foto, peso, road map). Ninguna promesa de cuándo. Y 6 de 24 cuentas creadas **nunca pasaron de ahí**.
6. **La adherencia se hunde en silencio.** 272 sesiones asignadas en 30 días, 163 completadas (60 %), **65 perdidas (24 %)**, concentradas en 6 atletas (Daniel B. 18, Ander 10 con 0 completadas, Ignacio 10, Alvaro 8, Marco 6, Pedro 5). El latido las marca `perdido`; ningún humano ni ninguna máquina reacciona (auditoría del autopiloto, decisión 38).
7. **La única baja medible siguió el patrón de libro:** Pedro R., alta 07-09, mesociclo acabado el 18-10 sin bloque nuevo, 5 sesiones perdidas en 30 días, último cuestionario el 12-10, 11 días sin actividad, baja el 23-10 con motivo «otro: No contesta». Todas las señales estaban en Firestore; ninguna llegó a la bandeja del día (que mira `lastLoginAt`, no sesiones perdidas ni fin de bloque sin siguiente).
8. **El Road map está vacío y los objetivos viven en otro sitio.** `roadmap.planPhases` tiene fases en 1 de 9 road maps (Ander, 5 a mano sin semanas); los objetivos reales (fase, peso meta, semanas) están en `nutritionPrograms` en 9 atletas y, desde el 28-10, en `semanasDelPlan` (rama `respuesta-notas-atleta`). El Road map tiene que derivarse de ahí (H-28). **Y lo que el atleta tiene de «progreso» no le habla de SU objetivo.** 20 de 24 altas tienen un `goalFreeText` escrito con sus palabras («llegar a los 40 en forma», «estar sin camiseta», «menos dolores y más energía»); ninguna pantalla lo repite. La ficha viva (`athleteStatus`) tiene «esperado» en 6 atletas y el atleta no la ve. Hitos del road map: 16 puestos, **1 logrado, 7 vencidos** sin cerrar. Retos: 141 en 60 días, 22 conseguidos (16 %), 94 fallidos (67 %). Niveles: 18 de 24 en nivel ≤ 1.
9. **La app promete supervisión que no ocurre.** `MiObjetivo.tsx:28`: «Tu coach lo está siguiendo y ajustará si hace falta». El motor detecta el ritmo lento (`verificacionObjetivo.ts`) y propone ajuste (`ajusteDePeriodizacion.ts`) pero «nadie aplica» (auditoría, decisión 40). Es el único texto de la app que habla en nombre de Dani, y es el que menos puede cumplir.
10. **Lo que mejor funciona hoy es el reto semanal y el player** (récords, aviso de reto en la sesión, `ExerciseCloseCard`): son los únicos sitios donde registrar algo produce una respuesta inmediata. El principio 2 (bucle corto) ya existe en el entreno; falta en todo lo demás.

---

## A · Lo que dicen los datos

### A.1 Quién hay (24 perfiles de cliente, 28-10)

| Grupo | n | Quiénes |
|---|---|---|
| En marcha (plan publicado, registran) | 15 | Israel C., Javier M., Javier V., Gonzalo M., Angel, Ruben C., Ignacio S., Rafa, Daniel B., Alvaro B., Marco, Ander, David M. (alta 19-10), Felice (14-10), H. Morales (16-10) |
| Con plan y callados > 7 días | 2 | Marcos V. (34 d, plan hasta 24-02, meso que empieza el 02-11), Cliente D. (cuenta de demo, 56 d) |
| Cuenta creada, plan nunca publicado | 6 | Fernando R. (alta hoy), Roberto C. (26 d, sin onboarding), Alex D. (15 d, sin onboarding ni muro legal), Malena S. (46 d), Jony (28 d), Sandra B. (59 d) |
| Baja | 1 | Pedro R. (23-10, «otro: No contesta») |

Vida mediana de los activos: **53 días**. Es una cohorte de septiembre: 13 de los 15 en marcha entraron entre el 31-08 y el 15-09. No hay historia de bajas con la que calcular churn todavía; la métrica útil hoy es **cuántos de estos 15 llegan a 90 días** (cierre de la primera renovación: planes de 3 meses vencen entre el 19-11 y el 15-12).

Cuentas: `crmServicios` tiene 17 servicios; las 6 cuentas sin plan y la de demo distorsionan todos los contadores de «activos» (bandeja, latido con 18 atletas, propuestas). Ninguna está archivada ni en baja.

### A.2 Actividad por atleta (días con registro por semana, 8 semanas; «registro» = entreno, diario, peso, cuestionario, menú o pasos)

| Atleta | S−7 … S0 (días/sem) | Media 4 sem | Entreno 30 d | Perdidas | Último contacto |
|---|---|---|---|---|---|
| Israel C. | 7 7 7 6 7 7 7 6 | 6,8 | 18/18 | 0 | hoy |
| Javier M. | 6 7 7 6 7 7 6 6 | 6,5 | 15/18 | 2 | hoy |
| Javier V. | 7 6 7 6 7 6 6 6 | 6,3 | 18/19 | 0 | hoy |
| Gonzalo M. | 6 7 7 5 6 6 6 6 | 6,0 | 21/25 | 3 | ayer |
| Angel | 5 6 6 5 6 5 5 6 | 5,5 | 15/18 | 1 | ayer |
| Ruben C. | 6 6 7 5 6 5 5 6 | 5,5 | 16/20 | 1 | ayer |
| Ignacio S. | 6 6 6 5 6 5 6 5 | 5,5 | **7/18** | **10** | hoy |
| Rafa | 5 6 6 5 6 5 5 6 | 5,5 | 16/18 | 0 | hoy |
| Daniel B. | 4 3 4 3 4 3 4 3 | 3,5 | **6/35** | **18** | hoy |
| Alvaro B. | 4 4 4 3 3 3 3 2 | 2,8 | 6/19 | 8 | 6 d |
| Pedro R. (baja) | 5 4 3 3 3 2 1 0 | 2,0 | 6/18 | 5 | 7 d |
| David M. | — — — — — — 2 2 | 1,8 | 6/6 | 0 | hoy |
| Felice | — — — — — 1 2 1 | 1,5 | 5/8 | 0 | ayer |
| H. Morales | — — — — — 1 2 2 | 1,5 | 3/5 | 1 | hoy |
| Marco | 2 2 1 1 2 1 1 1 | 1,3 | 5/13 | 6 | 6 d |
| Ander | 3 2 2 1 1 1 1 0 | 1,3 | **0/14** | **10** | 6 d |

(Las cifras de la tabla salen de `medicion.json` del borrador; la columna de semanas está resumida.)

Lectura: **8 atletas entran casi a diario**, 2 van a medias, y **4 se están apagando** (Alvaro, Marco, Ander y, hasta su baja, Pedro) con la misma curva: el entreno cae primero, el cuestionario aguanta dos semanas más, luego el silencio. Ander lleva 14 sesiones asignadas y 0 hechas en 30 días y sigue «activo» sin ninguna señal en la bandeja (su `lastLoginAt` es de hace 6 días, por debajo del umbral de 7).

### A.3 Latencia del acompañamiento (cuestionarios, 60 días)

| Medida | Valor |
|---|---|
| Respuestas de cuestionario | 131 (15 atletas) · por plantilla: Revisión express 36, DOM's 25, Quincenal 19, Semanal 16, Primera semana 12, Mediciones 10, Semana 3 7, Mes 1 5 |
| Marcadas «vista» (`reviewedAt`) | 125 (95 %) · mediana **170 h** desde el envío · p25 15 h · p75 ~340 h |
| Con `respuestaCoach` (texto/audio/vídeo) | **0** (canal en producción desde el 27-10) |
| Con reacción visible en la app en ≤ 96 h (respuesta, nota del día, reporte o cambio de plan) | **9 (7 %)**, todas por `cambiosAtleta` (Javier V. 3, Ruben 3, Javier M. 1, Gonzalo 1, Rafa 1) |
| Textos libres de más de 25 caracteres | 276 (mediana 2 por cuestionario) · «LESIONES/MOLESTIAS» 11 · feedback entreno 14 · feedback dieta 12 · «¿en qué podría mejorar yo?» varios |
| Notas del atleta en entrenos (`WorkoutLog.note`) | 0 en producción (la función existe) |
| Check-ins de peso (`checkins`) | 11 en total, 2 en 60 días, 11 con `coachFeedback` (textos de 1-2 frases, p. ej. «Excelente bajada esta semana. Mantenemos calorías, ajustamos intensidad en piernas.») |

El «visto» a los 7 días coincide con el ciclo: Dani abre las respuestas cuando prepara la revisión siguiente por WhatsApp. Para el atleta, en la app, la revisión «enviada» pasa a «leída» una semana después y nada más.

### A.4 Lo que el cliente ve de Dani (60 días)

| Canal | Volumen | Voz de Dani |
|---|---|---|
| Notificaciones al atleta | 211: `weekly_challenge_new` 139 · `academy_access_granted` 41 · `weekly_challenge_won` 22 · `nutrition_phase_change` 9 | Ninguna |
| Nota del día (`coachDayNotes`) | 0 | — |
| Reportes (`coachReports`) | 0 (ni borradores) | — |
| Respuesta a cuestionario | 0 | — |
| Cambios de plan (`cambiosAtleta`) | 34 (28 nutrición, 6 entreno), 10 atletas, todos de octubre | Los ve el coach en «Lo que he cambiado»; el atleta solo si coincide con «novedades» de la semana en el player (`novedadesVistas`) y nunca el porqué |
| Nota en una sesión (`WorkoutAssignment.note`) | 0 | — |
| Novedades de la app (`data/novedades.ts`) | 8 fichas, la última del 01-10 | Son de producto, no de Dani |
| Fotos | 109 subidas en 60 d (6 atletas con 5-21) | Comparador solo en el lado del coach (`ComparadorFotos`); el atleta tiene `PhotoCompareCurtain` sin comentario |

### A.5 Objetivos, hitos, retos, niveles

| Medida | Valor |
|---|---|
| Altas con objetivo en sus palabras (`goalFreeText`) | 20 de 24 |
| Perfiles con `targetWeight` | 4 (Angel 70, Cliente D. 74, Marcos V. 74, y un 0 masivo) · `initialWeight` 0 en 21 |
| Fichas vivas con `objetivos`/`esperado` | 6 de 13 (Pedro, Angel, Marco, Javier M., …); 12 `coachClientTasks` abiertas con preguntas del asistente al coach (material, días reales, lesiones) sin cerrar |
| Hitos del road map | 16 puestos (6 atletas), **1 logrado**, 7 con fecha vencida sin estado |
| Fases del plan (`planPhases`) | definidas en 8 atletas |
| Retos (60 d) | 141 · conseguidos 22 (16 %) · fallidos 94 (67 %) · activos 25 · de origen coach 0 |
| Niveles | nivel 0: 6 · nivel 1: 15 · nivel 2: 1 (Daniel B.) · nivel 3: 1 (Marcos V., inactivo) |
| Verificación de objetivo (`MiObjetivo` en Revisión) | calculada por motor para quien tiene `ObjetivoCorporal`; el texto promete seguimiento del coach |

### A.6 Fricciones

| Medida | Valor |
|---|---|
| Espera alta → plan publicado | mediana **58 h**, máx 294 h; 4 casos con plan publicado **antes** de terminar el alta (Gonzalo −45 h, Daniel B. −124 h, Alvaro −136 h, Ander −1.341 h) |
| Sin onboarding terminado | Roberto C., Alex D. |
| Sin muro legal | Alex D. |
| Consentimiento del asistente sin responder | Roberto C., Alex D.; rechazado: Cliente D. |
| Tareas del atleta (`tasks`) pendientes | 22, con «Revisión — bloque #1» vencidas desde el 27-09 y el 01-10 (el atleta las ve en `PendingTasksPanel` como «Se te pasó…») |
| Bloque/plan que termina | Javier V. (01-11, bloque), Daniel B. (plan 19-11) |
| Latido | 18 atletas/día, 0 errores en los últimos 5 días |
| Sentry | no accesible desde esta sesión |

---

## B · El viaje, momento a momento

Para cada momento: qué ve hoy, qué siente, qué hace Dani hoy, qué falta, mejora concreta (con id de hallazgo de la tabla D).

### 1 · Antes de entrar (contratación → alta)

- **Ve:** la llamada de venta (fuera de la app), y un correo de Firebase «Reset your password» en inglés salvo que Dani haya pegado la plantilla de `docs/plantilla-email-alta.md` (no hay forma de comprobarlo desde aquí). La plantilla dice «tu entrenador podrá empezar a montarte el plan»: ninguna fecha, ningún «qué pasa después».
- **Siente:** ilusión de la venta y un primer contacto genérico.
- **Dani:** CRM → «Invitar atleta»; la ficha de implantación (`ClientImplantacionPanel`) le lleva de la A a la F del montaje.
- **Falta:** que la promesa de la venta (qué recibe cada semana, cuándo le escribe Dani) exista en algún sitio que la app pueda cumplir y repetir. Hoy la promesa vive en la cabeza de Dani y en la llamada.
- **Mejora:** H-01 (guion de la primera semana escrito con las palabras de la venta; ver pregunta a Dani).

### 2 · Día 0-2 · el alta y la espera

- **Ve:** el wizard (`AthleteOnboardingWizard`, con hueco `VIDEO_SLOT` para un vídeo de bienvenida de Dani que no existe), el muro legal, y después `PlanEnEsperaScreen`: «Dani está montando tu plan», insignia «EN REVISIÓN DESDE HOY/AYER/N DÍAS», tres tareas (foto inicial, peso, road map), «Ver mi anamnesis». Sin barra de navegación.
- **Siente:** el primer día, bien; el tercero, «¿se ha olvidado?». La insignia cuenta los días en su contra.
- **Dani:** monta el plan en 1-12 días (mediana 58 h) y pulsa «Mostrar el plan». Por WhatsApp probablemente le escribe, pero la app no lo sabe.
- **Falta:** una fecha («lo tendrás el jueves»), un acuse («he leído tu alta: lo del hombro lo tengo en cuenta»), y que las 12 preguntas abiertas que el asistente deja a Dani (`coachClientTasks`: material, días reales, lesiones) se resuelvan antes de publicar en vez de asumirlas.
- **Mejora:** H-02 (fecha comprometida + acuse de lectura del alta en la sala de espera, escritos por Dani desde la ficha de implantación), H-03 (las preguntas abiertas del alta como mini-cuestionario al atleta en la espera: hoy están decididas «todo a través de mí», se respeta; alternativa: plantilla de WhatsApp desde la tarea).

### 3 · Primera semana · implantación

- **Ve:** Inicio con reto de la semana (auto, martes), peso, nutrición de hoy, entreno del día, «Esta semana». El cuestionario «Primera Semana» (8 preguntas, 12 respuestas en 60 d) el viernes. El player con récords desde la segunda sesión.
- **Siente:** el entreno responde (récord, cierre de ejercicio); la comida y el peso no responden a nada; el viernes escribe 8 respuestas largas (Pedro 8 textos, Javier M. 8, Ignacio 6) y no pasa nada visible.
- **Dani:** la checklist de «primeras semanas» (`clientSetup.ts:135-140`: contacto diario semana 1, dudas de dieta, primer check-in, reto) existe pero **ya no se pinta** (`ClientImplantacionPanel.tsx:46-50`). El contacto diario, si ocurre, es por WhatsApp.
- **Falta:** «Dani ha visto tu primera sesión» / «ha leído tu primera semana» en la app, y el primer ajuste visible (cambiar un ejercicio que le costó, bajar una serie) con su porqué. Y la medida: 4 de los 6 atletas con más perdidas entraron en la misma quincena de septiembre.
- **Mejora:** H-04 (guion día 0/1/3/7 con tres acciones de Dani de un minuto cada una, disparadas desde la bandeja: «primera sesión hecha → dile algo», «primera semana contestada → contéstale»), H-05 (checklistInicial del atleta visible y con cierre).

### 4 · El día a día

- **Ve por la mañana:** reto (progreso), peso (tarjeta + hoja de registro), nutrición de hoy (kcal que quedan), entreno de hoy. Nota del coach del día **si existe** (0 en 60 días). Novedades de la app.
- **Ve por la noche:** lo mismo, con el entreno en verde si lo hizo. Nada le dice que lo que ha registrado hoy lo va a mirar alguien.
- **Siente:** la app es útil como cuaderno; «me supervisan» no aparece en ningún píxel salvo el reto.
- **Dani:** abre `HomeCoachScreen` con la bandeja del día (sin publicar, revisiones de **check-in** pendientes, sin entrar ≥ 7 d, sin check-in ≥ 10 d, bloque termina ≤ N d, setup incompleto). La bandeja no sabe de cuestionarios, perdidas, peso sin registrar ni textos libres.
- **Falta:** motivo para entrar cada día que venga de Dani (una línea suya, una reacción a lo de ayer) y que lo registrado se convierta en algo en < 48 h.
- **Mejora:** H-06 (la bandeja lee el cuestionario, las perdidas y los textos; cada señal con un botón de respuesta de una línea que llega al atleta), H-07 (tarjeta «Lo último de Dani» en Inicio, con fecha; si no hay nada en 7 días, la tarjeta no finge: enseña la próxima revisión).

### 5 · La semana

- **Ve:** viernes, notificación «Tu revisión ya está abierta» (latido, `recordatoriosRevision.ts`), recorrido único «Te quedan N pasos» (captura 01), «Caduca el martes 3», lunes víspera «Tu revisión caduca mañana». Envía. Estado «Enviada» → «Leída» a los ~7 días (A.3). Desde el 27-10, si Dani contesta, «Tu coach ha revisado tu semana» arriba de Perfil › Revisión durante 14 días (`RespuestaDelCoach.tsx`), con notificación `questionnaire_submitted` invertida (tipo reutilizado).
- **Siente:** rellena 23 preguntas de «Tu semana» y no sabe para qué. La semana siguiente ve el mismo plan y no sabe si alguien decidió que siguiera igual.
- **Dani:** lee las respuestas cuando prepara la revisión por WhatsApp (`whatsapp-clientes`: apertura + cómo ha ido + 1-2 preguntas de su ficha de la bóveda), y la tarea `revision` del `tasks` se queda pendiente (22 vencidas).
- **Falta:** que la revisión de WhatsApp y la de la app sean **la misma**: lo que Dani escribe en WhatsApp no deja rastro en la app ni se convierte en «qué cambia la semana que viene y por qué». El menú semanal y la progresión programada cambian solos sin que nadie lo cuente (`novedadesVistas`, `avisoDeSesion` en el player sí dicen «esta semana +1 serie», pero no «porque»).
- **Mejora:** H-08 (la respuesta al cuestionario con 3 campos fijos: cómo ha ido · qué cambia esta semana · qué espero ver; en Inicio como tarjeta, no solo en Perfil › Revisión), H-09 (el texto de WhatsApp se redacta desde la app y se copia: una sola escritura, dos canales), H-10 (notificación propia `coach_reply`, no `questionnaire_submitted` reutilizado; `NotificationBell` la lleva a la tarjeta).

### 6 · Cuando algo va mal

- **Ve:** «LESIONES/MOLESTIAS» en el cuestionario (texto libre), «¿Algo que quieras contarme?», nota del entreno (0 usos), check-in de peso con `notes` (muerto). Ningún sitio dice «esto lo va a leer Dani en X horas», ningún acuse, ningún «resuelto».
- **Siente:** escribe «pequeña molestia en la rodilla derecha en la última serie de sentadilla» (26-10) y la siguiente sesión tiene la misma sentadilla.
- **Dani:** notificación `revision_alerta` si la molestia va marcada en el campo estructurado (`alertasDeRespuesta`); el texto libre no dispara nada. Lo resuelve por WhatsApp o cambiando la sesión (6 cambios de entreno en 60 d).
- **Falta:** el canal con tres estados (recibido · en curso · hecho) y que el cambio de sesión que Dani hace salga firmado y explicado al atleta («te he quitado la sentadilla esta semana por la rodilla; prensa en su lugar»). `cambiosAtleta` ya tiene las líneas; falta traducirlas y enseñarlas.
- **Mejora:** H-11 (problemas con estado; `cambiosAtleta` → «Dani ha cambiado…» en la tarjeta de Inicio con un «porqué» opcional que Dani escribe en el editor al guardar), H-12 (rama `respuesta-notas-atleta` del 28-10 terminada: respuesta a notas de entreno con `note_reply`).

### 7 · Cuando algo va bien

- **Ve:** «Récord personal» al cerrar el ejercicio (`ExerciseCloseCard`), «Reto conseguido 🏆» (22 en 60 d), «Nuevo nivel 🏅» (raro: 18 en nivel ≤ 1), «Logros recientes» en Road map (`RecentAchievements`), comparador de fotos sin comentario.
- **Siente:** bien en el entreno. El resto de logros (peso que baja, perímetro, foto) no se celebran ni se enseñan como camino.
- **Dani:** nada en la app; por WhatsApp a veces.
- **Falta:** antes → ahora con sus palabras y una frase de Dani en el momento (récord grande, primer mes, peso objetivo a la vista). Y que los retos dejen de fallar al 67 %: un reto que falla dos de cada tres semanas no celebra, desanima.
- **Mejora:** H-13 (recalibrar el motor de retos: dificultad «suave» por defecto en nivel 0-1 y tras una semana fallida; medir % conseguido), H-14 (hito «primer mes» y «primer récord grande» con texto de Dani desde la bandeja, 1 clic).

### 7b · El Road map: «en qué momento estoy, qué me queda, cuáles son nuestros objetivos»

Encargo de Dani del 28-10 (traspaso de la sesión «App Enforma actualizada»): el Road map es la pantalla con la que el cliente sabe en qué punto está, qué le queda por delante y cuáles son los objetivos a corto y medio plazo; tiene que **salir de los objetivos planteados en la asesoría inicial**, no montarse aparte.

- **Ve hoy (`AthleteRoadmapScreen`):** tarjeta de fase (`PhaseHeroCard`, solo si `roadmap.planPhases` tiene una fase «actual»), reto de la semana, camino de fases (`PhasePathStepper`), escalera de niveles, logros recientes, y «quién eres» (nombre, nivel, meta). **En producción `planPhases` está vacío en 8 de 9 road maps**; solo Ander tiene 5 fases, puestas a mano con el «plan estándar», sin semanas, sin peso objetivo y sin enlace a nutrición (`nutritionPhaseId`). Para los otros 14 atletas en marcha el Road map es: reto + escalera (18 de 24 en nivel ≤ 1) + «Logros recientes» (22 retos). Ni fase, ni «estás aquí», ni siguiente hito.
- **La fuente de verdad ya existe y está en otro sitio:** `nutritionPrograms` tiene fases con `objetivo`, `targetWeight`, `weeks` y pasos en 9 atletas (p. ej. Angel «Fase 1 — Déficit» 10 semanas → 79 kg; Javier V. «Déficit agresivo» 8 s → 86,2 kg + «Déficit normal» 8 s; Marcos V. 5 fases hasta un volumen). Sobre eso, la rama `respuesta-notas-atleta` (28-10, aprobada por Dani, sin commit) añade `utils/seguimientoPlan.ts` (`semanasDelPlan`, `evaluarPlan`: por semana, peso esperado con franja, kcal y pasos pautados y reales, adherencia, estado) y `planDeFase` en `historialObjetivos.ts`, con la pantalla del coach `components/plan/SeguimientoPlanPanel.tsx` y la colección solo-coach `decisionesPlan`.
- **Siente:** «el Road map está vacío» o «no tiene nada que ver con mi dieta». Lo que sí le habla de su objetivo (`MiObjetivo` en Revisión) vive en otra pestaña y solo cubre la fase en curso.
- **Dani:** rellenaría dos veces lo mismo (`PlanPhaseEditor` y el programa de nutrición); no lo hace, y el Road map queda vacío.
- **Falta:** que el Road map se **derive** de `semanasDelPlan`: fases pasadas, actual y siguientes con su objetivo en lenguaje del cliente («bajar a 79 kg antes del 24 de noviembre»), «estás aquí: semana 6 de 10», el próximo hito («salida de déficit en 4 semanas»), lo que se espera de él esta semana (kcal, pasos, cardio, reto) y el bloque de entreno en curso (mesociclo, semana N de M). Sin enseñar lo del coach: `decisionesPlan`, el desvío en rojo, «por qué se desvía», las opciones de alargar/apretar.
- **Mejora:** H-28 (Road map derivado de los objetivos; `roadmap.planPhases` deja de editarse a mano o se genera de las fases del programa; `PhaseHeroCard`/`PhasePathStepper` leen `semanasDelPlan`; hitos y días señalados se mantienen como capa encima). No se toca `SeguimientoPlanPanel` ni `seguimientoPlan.ts`: se leen.

### 8 · El mes · revisión y cierre de bloque

- **Ve:** nada específico. El bloque cambia (nuevo mesociclo) y el player avisa de novedades. Reportes: 0 enviados nunca. Fotos comparadas: solo si él abre la cortina.
- **Siente:** «empieza otro bloque» sin saber qué consiguió en el anterior.
- **Dani:** `MesocycleReviewPanel` con `cierreMesociclo` (volumen hecho vs programado, PRs, peso) solo en su lado; `ReportEditor` con borrador automático que no usa.
- **Falta:** el cierre de bloque para el atleta: tres cifras del motor + dos frases de Dani + el bloque nuevo explicado. Pedro R. se fue **cinco días** después de acabar un bloque sin siguiente.
- **Mejora:** H-15 (cierre de bloque como tarjeta para el atleta, generada del motor y firmada por Dani al publicar el bloque nuevo; bandeja: «bloque terminado sin siguiente» como señal **bloqueado**).

### 9 · La renovación

- **Ve:** nada. `plan_expiring` es una notificación **al coach** (`ClientsScreen.tsx`); el atleta no sabe cuándo termina su plan ni qué viene.
- **Dani:** alerta «Plan a punto de vencer» (≤ 30 d) en Setup, CRM «Renovado» con cobro. Ofrecer renovación anticipada, reseña y referidos son ítems manuales que ya no se pintan.
- **Falta:** los últimos 10 días con «esto hemos conseguido / esto viene», que es lo que decide la renovación, y el motivo de no renovación alimentando el panel (`crmServicios.motivoNoRenovacion` existe, 0 usos).
- **Mejora:** H-16 (tarjeta de recorrido antes → ahora en los 10 últimos días del plan, con el siguiente paso escrito por Dani; CRM registra motivo al no renovar).

### 10 · El silencio

- **Ve:** nada distinto. Si vuelve, el reto fallido y las sesiones en rojo «perdido».
- **Dani:** bandeja «Lleva N días sin abrir la app» a partir de 7 (solo por `lastLoginAt`). Ander (0/14 sesiones) no aparece porque abrió la app hace 6 días. Marcos V. (34 d) sí aparece desde hace semanas sin que cambie nada: la señal no tiene acción ni se cierra.
- **Falta:** la señal correcta (perdidas acumuladas, registros en caída, cuestionario sin contestar) con la acción pegada (plantilla de WhatsApp de la skill, «vuelta sin culpa» en la app) y un cierre («hablado el 28-10»).
- **Mejora:** H-17 (señal «se está apagando»: 3 perdidas en 14 d o media de registros < 2 d/sem tras ≥ 4; botón «Escribirle» con plantilla y marca de contacto), H-18 (al volver tras ≥ 7 d: Inicio sin reproche, reto en suave, mensaje de Dani si lo dejó escrito).

### 11 · La baja y la pausa

- **Ve:** nada: `estadoCrm: 'baja'` no cambia la app del atleta (sigue entrando y viendo su plan hasta que `gestionar-acceso.ts`, aún sin commitear, le quite el acceso). `pausado` tampoco cambia nada (los recordatorios se paran solo con `pausaRevisiones`).
- **Dani:** CRM, motivo obligatorio (6 opciones + detalle). Una baja registrada, motivo «otro».
- **Falta:** despedida con el recorrido (lo mismo que H-16), pausa con fecha de vuelta visible para los dos, y que el motivo se cruce con las señales previas para aprender (A.2).
- **Mejora:** H-19 (pantalla de pausa/baja para el atleta y panel de retención que una motivo + señales previas).

---

## C · Los diez principios (0-5)

| # | Principio | Nota | Pruebas |
|---|---|---|---|
| 1 | Progreso visible hacia SU objetivo | **1** | `goalFreeText` en 20 altas, no se enseña; `targetWeight` en 4; `MiObjetivo` solo para quien tiene `ObjetivoCorporal`; hitos 1/16; fotos sin antes→ahora comentado |
| 2 | Bucle de respuesta corto (< 48 h) | **1** | Entreno sí (récord, cierre); cuestionario «visto» a 170 h, reacción visible 7 %; comida y peso nunca responden |
| 3 | Presencia humana con nombre | **0,5** | 0 notas, 0 reportes, 0 respuestas, 0 notas de sesión en 60 d; notificaciones 100 % de máquina; «Tu coach» sin nombre en `RespuestaDelCoach` y `MiObjetivo` |
| 4 | Ritmo (día, semana, mes) | **3** | Semana: viernes→martes con recordatorios, bien. Día: reto y «Esta semana». Mes: nada para el atleta (cierre solo del coach) |
| 5 | Los problemas se cierran | **0,5** | Canales de entrada sí (texto libre, alerta de molestia); acuse, estado y «hecho» no existen; respuesta a notas en rama sin commit |
| 6 | Personalización que se nota | **2** | El menú usa `gustosDelAtleta` y recetas por atleta, pero no lo dice; el atleta edita preferencias; el plan nunca nombra lo que tuvo en cuenta («como prefieres…») |
| 7 | Expectativas gestionadas | **1** | Road map sin fases en 8 de 9 (H-28); ficha viva con «esperado» en 6 atletas, solo coach; `MiObjetivo` da rango y ritmo (bien) pero promete seguimiento que no ocurre; espera del plan sin fecha |
| 8 | Celebración y sentido | **2,5** | Récords, retos ganados, niveles, «Logros recientes»; pero retos fallidos 67 %, niveles estancados, nada de Dani en el momento |
| 9 | Cero fricción diaria | **4** | Registrar peso/comida/entreno en segundos; revisión con pasos y autoguardado; «Tu semana» con 23 preguntas y 4 cuestionarios el mismo viernes es lo único pesado (Javier V. contestó 4 el 13-09) |
| 10 | Honestidad | **2** | Lo automático no se disfraza (reto «auto», «Plan de nutrición actualizado»); pero `MiObjetivo` habla por el coach sin que el coach actúe, y «Tu coach ha revisado tu semana» aparece aunque la revisión la hiciera el asistente (futuro) |

Media: **1,75 / 5**. Lo que sostiene la nota es el ritmo semanal y la fricción baja; lo que la hunde es que Dani no existe dentro de la app.

---

## D · Tabla de hallazgos

Impacto en retención: A/M/B. Esfuerzo: S (≤ 1 día), M (1-2 días), L (> 2 días). Tanda: la del plan de la entrega 2.

| Id | Momento | Qué pasa hoy | Qué siente | Qué debería pasar | Dónde | Imp. | Esf. | Tanda |
|---|---|---|---|---|---|---|---|---|
| H-00 | Todos | No hay medida de retención: vida, silencios, latencia de respuesta, cuestionarios sin reacción | — (es de Dani) | Panel de retención sobre bandeja + CRM, con las cifras de la sección A recalculadas cada apertura | `bandejaDelDia.ts`, `features/crm`, `HomeCoachScreen.tsx` | A | M | 1 |
| H-08 | 5 Semana | Cuestionario enviado → «visto» a 170 h; 0 respuestas en la app; nada dice qué cambia la semana siguiente | «Escribo y no pasa nada» | Respuesta con 3 campos (cómo ha ido · qué cambia · qué espero ver) visible en Inicio 7 días, con nombre de Dani y fecha | `RespuestaCoachBox.tsx`, `RespuestaDelCoach.tsx`, `HomeScreen.tsx`, `questionnaireResponses.respuestaCoach` | A | M | 2 |
| H-06 | 4 Día a día | La bandeja no ve cuestionarios, perdidas, textos libres ni peso sin registrar | Nadie se entera de lo que le pasa | Bandeja con esas cuatro señales, cada una con acción de 1 clic (contestar, escribir por WhatsApp, cambiar sesión) | `bandejaDelDia.ts:141-157`, `HomeCoachScreen.tsx` | A | M | 2 |
| H-09 | 5 Semana | La revisión por WhatsApp no deja rastro en la app | La app y Dani son dos mundos | Redactar en la app, botón «Copiar para WhatsApp», marca «escrito por WhatsApp el …» como evento visible para el atleta | `RespuestaCoachBox.tsx`, skill `whatsapp-clientes` | A | S | 2 |
| H-10 | 5 Semana | La notificación de respuesta reutiliza `questionnaire_submitted` | Ruido | Tipo propio `coach_reply` con copy de Dani; campana → tarjeta | `types.ts:7-32`, `RespuestaCoachBox.tsx:42-48`, `NotificationBell.tsx` | M | S | 2 |
| H-07 | 4 Día a día | Inicio no tiene nada de Dani (nota del día 0 usos) | «Es un cuaderno» | Tarjeta «Lo último de Dani» (respuesta, cambio explicado, nota) con fecha; si no hay nada, enseña cuándo toca la próxima revisión, sin fingir | `HomeScreen.tsx:360-375`, nuevo `mensajesCoach` (el mismo canal del autopiloto §6) | A | M | 3 |
| H-11 | 6 Algo va mal | Problemas sin acuse, estado ni «hecho»; `cambiosAtleta` invisible para el atleta | «¿Lo ha leído?» | Canal con estados; cada cambio de Dani al plan sale traducido («te he quitado X por Y») con porqué opcional al guardar | `cambiosAtleta.ts`, `db/cambios.ts`, editores de dieta/sesión, `HomeScreen.tsx` | A | L | 3 |
| H-12 | 6 Algo va mal | Respuesta a notas de entreno en rama sin commit (`note_reply`) | — | Terminar y mergear; incluirla en el canal | rama `respuesta-notas-atleta` | M | S | 3 |
| H-02 | 2 Espera | «En revisión desde N días», sin fecha ni acuse | «¿Se ha olvidado?» | Fecha comprometida + «he leído tu alta: …» escritos por Dani desde implantación; insignia cuenta hacia la fecha, no desde el alta | `PlanInPreparationCard.tsx:29-37`, `ClientImplantacionPanel.tsx` | A | S | 4 |
| H-04 | 3 Primera semana | Sin guion; checklist «primeras semanas» ya no se pinta | Soledad en los días 3-7 | Día 0/1/3/7: tres acciones de un minuto para Dani desde la bandeja; «Dani ha visto tu primera sesión» | `clientSetup.ts:135-140`, `bandejaDelDia.ts`, `HomeScreen.tsx` | A | M | 4 |
| H-05 | 3 Primera semana | `checklistInicial` del perfil (primera sesión, cinco ingestas, lección RIR) sin pantalla que lo cierre | — | Lista de la primera semana en Inicio con cierre y una línea de Dani al completarla | `types.ts:checklistInicial`, `HomeScreen.tsx` | M | S | 4 |
| H-03 | 2 Espera | 12 preguntas abiertas del alta (`coachClientTasks`) se asumen en vez de preguntarse | Plan que no encaja (material, días) | Tarea con plantilla de WhatsApp lista; opcional: mini-cuestionario en la espera | `coachClientTasks`, `ClientImplantacionPanel.tsx` | M | S | 4 |
| H-20 | 1-3 | Plan publicado antes de terminar el alta en 4 atletas; 6 cuentas nunca arrancaron; 2 sin onboarding | Arranque a medias | Bandeja: «alta sin terminar N días» con plantilla; limpieza de cuentas en CRM (archivar) | `bandejaDelDia.ts`, CRM | M | S | 4 |
| H-21 | 1 Antes | Correo de alta genérico; sin vídeo de bienvenida (`VIDEO_SLOT`) | Primer contacto frío | Plantilla con nombre de Dani y «qué pasa esta semana»; vídeo si Dani lo graba | `plantilla-email-alta.md`, `AthleteOnboardingWizard.tsx:787` | B | S | 4 |
| H-13 | 7 Algo va bien | Retos fallidos 67 % | Desánimo semanal | Dificultad «suave» en nivel 0-1 y tras fallo; medir % conseguido ≥ 50 % | `challengeOptions.ts`, `motorRetoSemanal.ts` | M | S | 5 |
| H-22 | 7 / 5 | Objetivo con sus palabras no se enseña; `targetWeight` 0 en 20 perfiles; «Tu coach lo está siguiendo» sin seguimiento | No sabe hacia dónde va | Inicio y Revisión con «Lo que viniste a buscar» (goalFreeText) + antes→ahora + lo que falta; el texto de `MiObjetivo` solo cuando haya reacción real (o lo dice el asistente y lo firma Dani) | `MiObjetivo.tsx:28`, `OnboardingData.goalFreeText`, `HomeScreen.tsx`, `CheckInScreen.tsx:325` | A | M | 5 |
| H-23 | 7 Algo va bien | Hitos 1/16, 7 vencidos sin estado; `esperado` de la ficha invisible | El road map miente | Hitos con fecha vencida se cierran (logrado / no / pospuesto) desde la bandeja; «qué esperamos ver» traducido al atleta | `AthleteRoadmapScreen.tsx`, `db/dossier.ts`, `bandejaDelDia.ts` | M | M | 5 |
| H-14 | 7 Algo va bien | Celebraciones solo de máquina | — | Primer mes, primer récord grande, peso objetivo a la vista: señal en bandeja → texto de Dani (1 clic) | `bandejaDelDia.ts`, canal de mensajes | M | S | 5 |
| H-17 | 10 Silencio | Señal solo por `lastLoginAt` ≥ 7 d; Ander 0/14 invisible; señales sin acción ni cierre | Se va sin que nadie lo vea | «Se está apagando» (3 perdidas en 14 d, registros < 2 d/sem tras ≥ 4, cuestionario sin contestar 2 ciclos) + «Escribirle» con plantilla + «hablado el …» | `bandejaDelDia.ts`, skill `whatsapp-clientes`, `latidoDiario.ts` (agregado de perdidas) | A | M | 6 |
| H-18 | 10 Silencio | Al volver: rojo «perdido», reto fallido | Culpa | Vuelta sin reproche: Inicio «qué toca hoy», reto suave, mensaje de Dani si lo dejó | `HomeScreen.tsx`, `motorRetoSemanal.ts` | M | S | 6 |
| H-24 | Todos | Ningún aviso sale de la app | El que no entra no se entera | Push web (VAPID) para 4 tipos: respuesta de Dani, revisión abierta, plan nuevo, cuestionario caduca mañana; máximo 1/día; correo (Resend) como alternativa | `api/`, `NotificationBell.tsx`, service worker | A | L | 7 |
| H-15 | 8 Mes | Cierre de bloque solo del coach; Pedro se fue 5 días después de acabar un bloque sin siguiente | «Empieza otro sin saber qué logré» | Tarjeta de cierre para el atleta (3 cifras del motor + 2 frases de Dani) al publicar el bloque nuevo; bandeja: «bloque terminado sin siguiente» como bloqueado | `cierreMesociclo.ts`, `MesocycleReviewPanel.tsx`, `bandejaDelDia.ts:160-170` | A | M | 8 |
| H-16 | 9 Renovación | El atleta no sabe cuándo termina su plan; `plan_expiring` solo al coach; motivo de no renovación 0 usos | Renovación a ciegas | Últimos 10 días: «esto hemos conseguido / esto viene» + siguiente paso de Dani; CRM pide motivo al no renovar | `clientSetup.ts:372-379`, `HomeScreen.tsx`, `features/crm` | A | M | 8 |
| H-19 | 11 Baja/pausa | Baja y pausa no cambian nada para el atleta | Se va sin despedida | Pantalla de pausa (fecha de vuelta) y de despedida con el recorrido; panel cruza motivo con señales previas | `App.tsx:640`, `gestionar-acceso.ts`, panel H-00 | M | M | 8 |
| H-25 | 6 / 4 | Personalización muda: el menú usa gustos y recetas por atleta sin decirlo | «Es genérico» | «Hecho con…» en menú y recetas (3 cosas que se tuvieron en cuenta), y en el plan «como me dijiste que…» | `MyMenuScreen.tsx`, `gustosDelAtleta.ts`, `menuEngine.ts` | M | S | 9 |
| H-26 | 5 Semana | Hasta 4 cuestionarios el mismo viernes (23 + 8 + 6 + 2 preguntas) | Pesado | Paquete oficial (PR #20) con un solo cuestionario semanal y los demás escalonados; medir tiempo de respuesta | `questionnairePacks`, `pasosDeCuestionario.ts` | M | S | 2 |
| H-28 | 7b Road map | `roadmap.planPhases` vacío en 8 de 9; el único relleno (Ander) va a mano y por libre de las fases del programa de nutrición, que sí tienen objetivo y peso meta en 9 atletas | «No sé en qué punto estoy ni qué viene» | Road map derivado de `semanasDelPlan`: fases con objetivo en su idioma, «estás aquí», próximo hito, lo que se espera esta semana, bloque de entreno; sin lo del coach (`decisionesPlan`, desvío, opciones) | `AthleteRoadmapScreen.tsx`, `roadmap/PhaseHeroCard.tsx`, `PhasePathStepper.tsx`, `utils/seguimientoPlan.ts` (leer), `planNutritionBridge.ts`, `PlanPhaseEditor.tsx` (retirar o generar) | A | M | 5 |
| H-27 | 4 Día a día | 22 tareas vencidas (`tasks` tipo `revision`) visibles al atleta desde el 27-09 | «La app está rota» | Las tareas de revisión caducan solas al cerrar el ciclo; las del coach se cierran desde la bandeja | `PendingTasksPanel.tsx`, `tasks` | B | S | 2 |

---

## E · Lo que no hay que hacer

- **Mensajes automáticos firmados por Dani sin que los vea.** Todo lo que salga con su nombre pasa por su aprobación (decisión del 28-10, rodaje del autopiloto). El canal de mensajes de H-07/H-11 es el mismo `mensajesCoach` del diseño del autopiloto (§6): una pieza, no dos.
- **Reabrir decisiones cerradas:** kcal y gramos, el coach fija el objetivo, recetas fieles, retos sobre el mesociclo, cuestionarios viernes→martes.
- **Rediseños globales.** Cada hallazgo cabe en una PR de 1-2 días sobre componentes que ya existen.

---

## F · Lo que Dani tiene que decidir

Se le pregunta en la sesión al cerrar esta entrega: canal fuera de la app (WhatsApp con plantillas, push web, correo, ninguno); minutos al día que dedica al acompañamiento en la app; quién escribe la revisión de la semana (él, el asistente y él firma, sola en rodaje); cómo se comunica un cambio hecho por la máquina; qué es «silencio» en días y qué hace hoy; motivos de baja que ha visto; hitos con voz/vídeo grabado o solo texto; qué promete en la venta.
