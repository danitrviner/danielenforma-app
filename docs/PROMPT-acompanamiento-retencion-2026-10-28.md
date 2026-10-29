# PROMPT · Revisión de En Forma como servicio acompañado: supervisión percibida y tiempo de vida del cliente

> Para pegar en Claude Code (Opus/Fable, modo plan primero). Escrito el 28-10-2026 sobre el estado real del repo. Hermano del `PROMPT-ia-autonoma-2026-10-28.md`: aquel decide **qué hace la máquina**; este decide **qué siente el cliente**. Los dos tienen que encajar: el autopiloto produce decisiones, y esta revisión decide cómo llegan al atleta para que note que hay alguien detrás.

---

## Quién eres y qué quiero

Eres el responsable de producto y experiencia de **En Forma** (`/Users/dani/en-forma` y worktrees; React 19 + TS + Vite, Firestore con BD con nombre, `api/` en Vercel). Trabajas para Dani, entrenador personal y coach único de la app. Sus clientes entran por la web de Vercel desde el móvil.

**El objetivo de negocio:** alargar el **tiempo de vida medio** de cada cliente dentro de la asesoría (el churn es el KPI real: objetivo < 10 %; `UserProfile.fechaBaja` / `motivoBaja` en `src/types.ts` ~190-247 lo registran). **El medio:** que el cliente sienta, todos los días y en todas las pantallas, que está **supervisado y acompañado por un profesional de verdad** —Dani—: que lo que registra lo mira alguien, que sus problemas se resuelven, que entiende lo que le pasa, que ve que avanza hacia lo que vino a buscar, y que hay un ritmo (día, semana, mes) que lo sostiene.

Quiero de ti dos cosas, en este orden:

1. **Revisión** de la app completa desde ese ángulo, con datos reales de uso (solo lectura), recorriendo el viaje del cliente momento a momento. Informe con hallazgos priorizados por impacto en retención / esfuerzo.
2. **Plan de mejoras** en tandas pequeñas con PR, cada una con su hipótesis («esto hará que X») y su métrica para saber si funcionó.

No programes hasta que Dani apruebe el plan. No inventes nada que la app prometa y no pueda cumplir: una supervisión fingida (mensajes automáticos que parecen de Dani sin que nadie mire) es lo contrario de lo que queremos y se nota en dos semanas.

Reglas de la casa:
- Todo en español. En pantalla nunca «IA»: **«el asistente»**. Lo que ve el cliente va firmado por Dani solo si Dani lo ha visto o lo ha delegado explícitamente (decisión tomada el 28-10 en el diseño del autopiloto: los textos del episodio los firma Dani, en rodaje los revisa antes).
- Datos del atleta: solo lectura con Admin SDK, nunca escrituras en producción sin su OK; nada de `--aplicar`.
- Maquetas fieles al original: captura el componente real en `/dev` y cambia solo lo que propones (memoria «maquetas fieles»).
- Decisiones de producto cerradas que no se reabren: nutrición en kcal y gramos, sin objetivo por comida; el coach fija el objetivo, no los alimentos; recetas fieles + extras exactos; retos sobre el mesociclo; cuestionarios en viernes que caducan el martes; nada de anabolizantes ni preparación de competición.

---

## Lo que ya existe (léelo; no propongas lo que ya hay)

**Viaje del atleta hoy** (componentes en `src/components/`):
- Alta: `OnboardingForm`, `AthleteOnboardingWizard`, muro legal y consentimientos, `WelcomeScreen`, `PlanEnEsperaScreen` / `PlanInPreparationCard` (lo que ve mientras Dani monta el plan), `plantilla-email-alta.md`.
- Inicio: `HomeScreen` + `home/` (`TarjetaNutricionHoy`, `TarjetaPeso`, `RegistrarPesoSheet`, `TarjetaCardio`), racha, nota del coach del día (`coach_day_note`), `NovedadesSheet` (`utils/novedades.ts`), `NotificationBell` (tipos en `src/types.ts:7-32`: check-in, cuestionario, cambio de fase, reto nuevo/ganado, nivel, reporte enviado, nota del día…). **No hay push ni correo**: todo aviso vive dentro de la app y solo llega si el atleta entra.
- Entreno: `WorkoutsScreen`, player con récords y avisos de reto/sesión (`avisoDeSesion`, `avisoDeReto`, `logrosDelEjercicio`), bloque que ve el atleta (PR #26), cardio.
- Nutrición: `NutritionScreen` (Diario en kcal, añadir alimento A+B, escáner), `MyMenuScreen` (menú semanal con extras exactos, intercambiar, favoritos), recetario «Descubrir», tablero de recetas.
- Seguimiento: `CheckInScreen` → `checkin/RevisionDeLaSemana`, `RespuestaDelCoach`, `HistorialDeRevisiones`; cuestionarios (`QuestionnaireWizard`, `AssignedQuestionnairesPanel`, mapa corporal y agujetas); fotos (`PhotosScreen`, `progress/PhotoCompareCurtain`); reportes del coach (`AthleteReportsPanel`, `ReportView`, `reportBuilder`/`reportNarrative`); road map y calendario (`AthleteRoadmapScreen`, `RoadmapTimeline`, `roadmap/*`: escalera de niveles, fases, hitos, reto de la semana, `RecentAchievements`); Plan › Objetivo y notas del atleta con respuesta del coach (rama `respuesta-notas-atleta`, 28-10, sin commit: `decisionesPlan`).
- Perfil: preferencias, modo claro, consentimientos.

**Lado del coach que sostiene el acompañamiento:** `bandejaDelDia.ts` (qué atender hoy), `cambiosAtleta.ts` (historial de lo que Dani cambió), `avisosDelCoach.ts` (tareas con fecha, calculadas al abrir: no hay servidor que las dispare), `recordatoriosRevision.ts`, `CoachNotesPanel`, reportes, `ClientRevisionPanel` y `revision/*`, calendario del coach con notas al día, CRM (`src/features/crm`: estados, pausas, bajas con motivo, renovaciones con cobro), skill externa `whatsapp-clientes` (la revisión semanal y los follows van por WhatsApp, fuera de la app).

**Automatismos:** `api/latido-diario.ts` (sesiones perdidas, fase de dieta, niveles, reto semanal, recordatorios), menú semanal automático (borrador), cuestionarios periódicos. **Asistente del coach** (`src/ai/`) y el diseño del **autopiloto** (`~/en-forma-autopiloto/docs/diseno-ia-autonoma-2026-10-28.md`): episodios por eventos, rodaje con Dani revisando todo, firma «Dani», sin chat del atleta con el asistente.

**Datos ya medidos (28-10, solo lectura) que debes tener presentes:** el check-in de peso está muerto (1 en 60 días); el canal vivo es el cuestionario (131 respuestas en 60 días); el asistente del coach apenas se usa (4 llamadas en 30 días); 18-19 atletas activos; Dani corrige siempre lo mismo en las propuestas. Mide tú el resto (abajo).

---

## Entrega 1 · Revisión

Informe en `docs/revision-acompanamiento-2026-XX-XX.md`. Estructura: (A) lo que dicen los datos, (B) el viaje momento a momento, (C) los diez principios y cómo puntúa la app en cada uno, (D) tabla de hallazgos (id, momento del viaje, qué pasa hoy, qué siente el cliente, qué debería pasar, dónde en el código, impacto en retención A/M/B, esfuerzo S/M/L, tanda).

### A. Datos primero (Admin SDK, solo lectura, scripts en el scratchpad, nunca en el repo)
- **Tiempo de vida y bajas:** por cliente, fecha de alta → `fechaBaja` o hoy; distribución; `motivoBaja`; en qué mes de vida se van; si hubo señales antes (días sin entrar, sesiones perdidas, cuestionarios sin contestar, peso sin registrar).
- **Actividad:** por atleta y semana, días con registro (entreno, diario, peso, cuestionario, menú marcado); cuántos entran a diario, cuántos solo cuando toca cuestionario, cuántos están callados > 7 días hoy.
- **Latencia del acompañamiento:** cuestionario contestado → respuesta/acción visible de Dani (reporte, nota, cambio de plan, respuesta a nota) en cuántas horas; % de cuestionarios sin ninguna reacción visible en la app; notas del atleta sin respuesta.
- **Lo que el cliente ve de Dani:** notificaciones por tipo y por atleta en 60 días; notas del día; reportes enviados; cambios de plan que el atleta pudo ver (y si la app se los contó).
- **Objetivos:** ¿tienen objetivo verificable (`verificacionObjetivo`) y lo están consiguiendo? ¿Hitos del road map cumplidos vs puestos? ¿Retos ganados vs propuestos? ¿Niveles subidos?
- **Fricciones:** errores de Sentry en pantallas del atleta, flujos abandonados (onboarding a medias, consentimiento sin contestar, PlanEnEspera > 48 h).

### B. El viaje, momento a momento
Para cada momento di: qué ve hoy el cliente (captura real de `/dev` o descripción exacta), qué siente, qué hace Dani hoy (en la app o por WhatsApp), qué falta para que se sienta acompañado, y la mejora concreta.
1. **Antes de entrar** (contratación → alta): expectativas, qué se le promete, plantilla de correo.
2. **Día 0-2 · el alta y la espera:** cuánto tarda en ver su plan, qué ve mientras (`PlanEnEsperaScreen`), si sabe qué va a pasar y cuándo.
3. **Primera semana · implantación:** primera sesión, primer registro de comida, primer peso, primer «esto lo ha visto Dani». El día 3 y el día 7 son los que deciden si se queda.
4. **El día a día:** abrir la app por la mañana y por la noche. ¿Hay un motivo para entrar cada día? ¿Lo que registra se convierte en algo visible (una lectura, una frase, un ajuste) en < 24-48 h?
5. **La semana:** viernes cuestionario → martes caduca. ¿Qué pasa entre medias? ¿Recibe una revisión de la semana con nombre y apellidos? ¿Ve qué cambia la semana que viene y por qué? (`RevisionDeLaSemana`, `RespuestaDelCoach`, menú semanal, reto, `propose_week_plan`.)
6. **Cuando algo va mal:** dolor, sesión perdida, semana mala de comida, peso que no baja, viaje, enfermedad, desmotivación, una nota libre pidiendo algo. ¿Dónde lo dice? ¿Quién lo lee? ¿Cuánto tarda en resolverse y cómo se entera de que se resolvió?
7. **Cuando algo va bien:** récord, hito, nivel, reto ganado, foto que cambia, perímetro que baja. ¿Se celebra? ¿Se le enseña el camino recorrido (antes → ahora) y lo que falta?
8. **El mes · revisión y cierre de bloque:** `cierreMesociclo`, reporte, fotos comparadas, «dónde estás vs qué esperábamos», el bloque nuevo explicado.
9. **La renovación:** qué ve los últimos 10 días del plan (`plan_expiring`), si llega con la sensación de haber conseguido algo y con un «siguiente paso» claro; qué hace Dani (CRM renovar con cobro).
10. **El silencio:** atleta que deja de entrar. ¿Alguien se entera (bandeja del día) y qué pasa? ¿Hay vuelta (re-enganche) o solo caída?
11. **La baja y la pausa:** `pausado`, `baja` con motivo. ¿Se despide bien? ¿Se aprende algo?

### C. Los diez principios (puntúa la app 0-5 en cada uno, con pruebas)
1. **Progreso visible hacia SU objetivo**: lo que vino a buscar, medido como él lo entiende, con el antes → ahora siempre a mano.
2. **Bucle de respuesta corto**: todo lo que registra provoca una reacción visible en < 48 h; nunca una pantalla muda.
3. **Presencia humana con nombre**: Dani aparece (texto suyo, voz suya, decisiones firmadas), no «el sistema».
4. **Ritmo**: cadencias claras de día, semana y mes; el cliente sabe qué toca y qué va a recibir.
5. **Los problemas se cierran**: un canal para decirlos, acuse de recibo, cambio visible, «hecho».
6. **Personalización que se nota**: gustos, horarios, material, cambios habituales (`gustosDelAtleta`) reflejados y nombrados («como prefieres bebida de avena…»).
7. **Expectativas gestionadas**: «qué esperamos ver y cuándo» (la ficha viva ya lo tiene para el coach; el cliente no lo ve).
8. **Celebración y sentido**: hitos, niveles, récords, recorrido; sin confeti vacío.
9. **Cero fricción en lo que debe hacer cada día**: registrar en segundos; lo que no aporta, fuera.
10. **Honestidad**: nada automático disfrazado de humano; cuando la máquina hace algo, se dice que el plan «se ajusta con lo que registras» y Dani lo revisa.

### D. Lo que seguro vas a encontrar (compruébalo, no lo des por hecho)
- El check-in semanal está muerto y el cuestionario es el canal real: la «revisión de la semana» debería colgar del cuestionario, con respuesta visible.
- Las notificaciones no salen de la app: sin push ni correo ni WhatsApp integrado, el que no entra no se entera. Evalúa push web/APNs para la web de Vercel, correo (Resend) y, sobre todo, cómo encajar el WhatsApp que Dani ya usa (la skill `whatsapp-clientes`) como canal reconocido en la app (p. ej. «te he escrito por WhatsApp» como evento, o plantillas que la app prepara y Dani manda).
- El cliente no ve la ficha viva («qué esperamos ver»), ni el historial de cambios del coach a su plan traducido a su idioma, ni el porqué de la semana.
- Las decisiones del autopiloto (cuando llegue) necesitan **un sitio donde el atleta las lea** con la voz de Dani: el canal de mensajes del coach del diseño del autopiloto es la misma pieza; no hagas dos.

---

## Entrega 2 · Plan de mejoras

`docs/plan-acompanamiento-2026-XX-XX.md`. Para cada tanda: qué cambia para el cliente, qué cambia para Dani (minutos al día), hipótesis, métrica (de la sección A) y cómo se mide a las 4 semanas; PR de 1-2 días; tests; textos en español con la voz de Dani (lee cómo escribe en `RespuestaDelCoach`, notas, reportes y doctrina). Sugerencia de orden que puedes mejorar:
1. **Medición**: panel de retención para Dani (tiempo de vida, silencios, latencia de respuesta, cuestionarios sin reacción) sobre lo que ya hay en `bandejaDelDia` y el CRM; sin esto no sabremos si lo demás funciona.
2. **Bucle de la semana**: cuestionario → revisión de la semana con respuesta de Dani visible en Inicio (una tarjeta «Dani ha revisado tu semana» con 3 frases, lo que cambia y por qué), recordatorio si el viernes no contesta, caducidad explicada.
3. **Canal de mensajes del coach** en la app (el mismo del autopiloto): notas, respuestas a sus notas, cambios de plan traducidos, acuse de recibo de problemas, estado «en curso / resuelto».
4. **Primera semana**: guion de implantación con lo que pasa cada día (día 0, 1, 3, 7), «Dani ha visto tu primera sesión», primer ajuste visible.
5. **Progreso hacia su objetivo** en Inicio y Revisión del atleta: objetivo con sus palabras, antes → ahora, lo que falta, fotos; `verificacionObjetivo` traducido para él.
6. **Alertas de silencio** y re-enganche: bandeja del coach con «lleva N días sin entrar» + plantilla de WhatsApp; en la app, vuelta amable sin culpa.
7. **Avisos fuera de la app** (push web / correo) para lo que importa: respuesta de Dani, revisión lista, plan nuevo, cuestionario pendiente. Sin spam: máximo diario.
8. **Mes y renovación**: cierre de bloque con recorrido y siguiente paso; últimos 10 días con «esto hemos conseguido / esto viene»; motivo de baja que alimente el panel.
9. **Personalización nombrada**: que el menú, las recetas y el plan digan lo que han tenido en cuenta de él.

---

## Preguntas que debes hacerle a Dani antes de diseñar (AskUserQuestion; no asumas)
Qué canal quiere para avisar fuera de la app (WhatsApp manual con plantillas, push web, correo, ninguno); cuánto tiempo al día está dispuesto a dedicar al acompañamiento en la app (eso fija cuánto puede ser humano y cuánto preparado por el asistente para que él lo apruebe); si la revisión de la semana se escribe él, la prepara el asistente y él la firma, o sale sola en rodaje; cómo quiere que se comunique un cambio hecho por la máquina; qué considera «silencio» (días) y qué hace hoy cuando pasa; qué motivos de baja ha visto más; si quiere celebrar hitos con mensajes suyos grabados (voz/vídeo) o solo texto; qué promete en la venta (para que la app cumpla exactamente eso).

## Cómo trabajar
Modo plan; datos antes que opiniones; cita rutas y líneas; captura las pantallas reales; cada hallazgo con su momento del viaje y su principio; nada de rediseños globales: mejoras acotadas y medibles, en el orden en que más alargan la vida del cliente por euro de esfuerzo. Al cerrar cada entrega: informe en `docs/`, memoria actualizada y un resumen de dos párrafos para Dani con las decisiones que necesita de él.
