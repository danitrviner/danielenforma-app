/* Las tres tareas del asistente.
 *
 * Dani hace tres cosas con la IA, y siempre las mismas: montar el mes de un
 * cliente nuevo, revisarlo a mitad de mes y montarle el mes siguiente. Antes
 * eso vivía en la cabeza de cada uno: él escribía «monta el plan de X» y el
 * modelo decidía qué leer, en cuántas rondas y hasta dónde llegar. El
 * resultado dependía del día — a veces salía el mesociclo solo, a veces
 * medio plan, y casi siempre tras diez llamadas de lectura.
 *
 * Aquí cada tarea es un guion CERRADO y de la A a la Z: la lista literal de
 * todo lo que un cliente necesita tener puesto en la app, plano por plano, en
 * el orden en el que se aprueba. El orden no es estético — cada paso necesita
 * que exista el anterior (las sesiones necesitan el mesociclo, publicar
 * necesita las sesiones, el calendario de dietas necesita las dietas).
 *
 * La lista es la MISMA que la checklist de Setup del cliente
 * (`utils/clientSetup.ts`). Si allí se añade un item, aquí hay que añadir el
 * paso: un plan que la checklist da por incompleto es un plan incompleto,
 * aunque el chat haya dicho que había terminado.
 */

export type TareaId = 'mes_nuevo' | 'revision' | 'renovar_mes';

export interface Tarea {
  id: TareaId;
  /** Lo que ve Dani en el botón. */
  label: string;
  icon: string;
  /** Una línea debajo del botón. */
  descripcion: string;
  /** Qué secciones trae el brief para esta tarea. */
  brief: BriefSeccion[];
  /** El mensaje que se manda al asistente al pulsar el botón. */
  prompt: (nombre: string, email: string) => string;
}

export type BriefSeccion =
  | 'estado' | 'ficha' | 'resumen' | 'alta' | 'plan' | 'dieta'
  | 'entrenos' | 'revisiones' | 'cuestionarios' | 'ajustes'
  | 'cuerpo' | 'nutricion';

/* ── El plan completo, plano por plano ──────────────────────────────────────
   Esto es lo que significa «montar el mes». Numerado porque se aprueba en
   este orden, y cada línea dice con qué tool se hace. */
const PLAN_COMPLETO = `### El plan entero, en este orden (no pares a la mitad ni preguntes «¿sigo?»)

**A. Antes de proponer nada — el alta**
0. Repasa el ALTA del brief entera. Todo lo que esté sin contestar, a medias o se contradiga con lo que ves en sus datos, déjalo como nota con add_coach_task (una nota por cosa, con el dato dentro: "En el alta puso 5 días pero solo registra 3 entrenos: confirmar días reales"). Bloquean de verdad: días que va a entrenar, minutos por sesión, material, lesiones activas. Lo que bloquea se pregunta; lo que no, se asume y se dice qué has asumido.
0b. Si le falta la fecha de inicio, la duración del plan o el peso objetivo, van en el paso 8 (propose_setup_config), no en una nota.

**B. Entrenamiento**
1. **Mesociclo** (propose_mesocycle): semanas, días por ciclo, objetivo y reparto de series por grupo. Sale del criterio de volumen de tu doctrina y de lo que el atleta puede de verdad.
2. **Sesiones** (propose_workout_days): cada día con sus ejercicios, series, reps, RIR y descansos. Elige del bloque «CÓMO PROGRAMA DANI» del contexto — no pidas get_exercise_usage ni recorras el catálogo grupo a grupo; get_exercise_library solo si un grupo no tiene nada usable ahí o el material lo descarta.
3. **Publicar el bloque** (propose_publish_block): vuelca las sesiones al calendario del atleta. Sin este paso tiene un plan que no ve. Va siempre después del 2.

**C. Nutrición**
4. **Periodización nutricional** (propose_nutrition_program): las fases encadenadas con sus semanas, kcal y recargas, y dentro de cada fase su dieta. Manda solo el PRESUPUESTO de intercambios de cada dieta (HC / PROT / GRASA): los alimentos los coloca Dani en el editor de dietas. NO rellenes comidas salvo que te lo pida.
5. **Ajuste de dieta suelto** (propose_diet_update) solo si hace falta una dieta fuera de la periodización (día de descanso, día libre). Mismo criterio: presupuesto sí, comidas no.

**D. Configuración del plan** (todo esto va en UNA propose_setup_config)
6. Fecha de inicio, duración del plan y peso objetivo, si faltan.
7. Objetivo diario de PASOS.
8. Qué dietas quedan activas y el CALENDARIO semanal de dietas (qué come cada día de la semana). Ojo: se resuelven por nombre, así que esta propuesta se aprueba DESPUÉS de la periodización.
9. CUESTIONARIO periódico con su cadencia, y FOTOS de seguimiento con sus vistas y cadencia.
10. Ejercicios elegibles para RETOS de carga (sus básicos reales).
11. CARDIO: programa de Zona 2 o de VO₂máx, si le toca.

**E. Road map — lo que el atleta ve venir**
12. **Escalera de niveles** (propose_level_ladder), solo si la de por defecto no le sirve. Si le sirve, dilo y no propongas por proponer.
13. **Fases del plan e hitos** (propose_roadmap_items): las fases macro y los hitos con fecha.
14. **Días señalados** (propose_special_day): toma de marcas, AMRAP, recarga. Uno o dos en el mes, no diez.
15. **Reto de la semana** (get_challenge_options y luego propose_weekly_challenge): mira antes las opciones que calcula el motor con SUS datos.

**F. Cierre**
16. **Ficha viva** (propose_dossier_update): objetivos con sus palabras, dónde está hoy, qué esperamos ver en estas semanas, el foco de la próxima revisión y las preguntas abiertas.
17. Termina con «El mes de un vistazo»: una línea por pieza, en el orden en que Dani debe aprobarlas, y las notas que le has dejado. Nada después de eso.

Si te falta un dato que cambia una decisión, agrupa las preguntas (máximo 5, de más a menos bloqueante) y propón igualmente el 80% que sí puedes, diciendo qué has asumido y qué cambiaría si la respuesta fuese otra.`;

export const TAREAS: Tarea[] = [
  {
    id: 'mes_nuevo',
    label: 'Montar el primer mes',
    icon: 'rocket_launch',
    descripcion: 'Cliente nuevo: plan completo desde cero.',
    brief: ['estado', 'ficha', 'resumen', 'alta', 'plan', 'ajustes'],
    prompt: (nombre, email) =>
      `TAREA: montar el primer mes de ${nombre} (${email}) desde cero.\n` +
      `Empieza por get_client_brief con tarea "mes_nuevo" — trae el alta entera, la ficha y el estado del montaje en una sola llamada. No pidas nada más de lectura salvo que el brief lo diga.\n\n` +
      PLAN_COMPLETO +
      `\n\nEs su primer mes: no hay historial que comparar, así que las decisiones salen del alta y de tu criterio. Di en qué te has basado en cada bloque.`,
  },
  {
    id: 'revision',
    label: 'Preparar la revisión',
    icon: 'fact_check',
    descripcion: 'A mitad de mes: qué va bien, qué tocar.',
    brief: ['estado', 'ficha', 'resumen', 'plan', 'dieta', 'nutricion', 'entrenos', 'cuerpo', 'revisiones', 'cuestionarios'],
    prompt: (nombre, email) =>
      `TAREA: preparar la revisión de ${nombre} (${email}).\n` +
      `Empieza por get_client_brief con tarea "revision" — trae la ficha, el plan en marcha, los entrenos de las últimas 4 semanas, los check-ins y los cuestionarios en una sola llamada. El brief ya trae el análisis de nutrición (adherencia, pasos, macros) y el del cuerpo (perímetros, % de grasa estimado, readiness): mira los dos antes de tocar la dieta. Ajustar kcal sin mirar la adherencia es cambiar un plan que quizá no se está siguiendo, y el peso solo no distingue perder grasa de perder músculo.\n\n` +
      `Entrega, en este orden:\n` +
      `1. **Veredicto** en tres frases: ¿está pasando lo que la ficha decía que esperábamos? Cita el dato (peso, adherencia, un PR, lo que dijo en el check-in).\n` +
      `2. **Repaso plano por plano**, una línea cada uno, diciendo si se toca o no y por qué: entrenamiento (¿progresa, se estanca, se salta sesiones?), nutrición (¿adherencia, peso, macros?), pasos y cardio, road map e hitos (¿llega a lo que le pusimos?), retos (¿los está consiguiendo o el listón está mal?), cuestionarios y fotos (¿los está contestando?). Lo que va bien se dice en cuatro palabras y se sigue.\n` +
      `3. **Los cambios**, solo los que cambien algo: ajuste de dieta (propose_diet_update sobre la dieta activa — presupuesto de intercambios, no comidas), retoque de sesiones (propose_workout_days), reparto de series (propose_mesocycle solo si está mal, no por retocar), pasos/cardio/calendario (propose_setup_config), hitos o días señalados, y el reto de la semana (get_challenge_options → propose_weekly_challenge). Si no hay que tocar nada, dilo en una frase y no propongas por proponer.\n` +
      `4. **Feedback del check-in** (draft_checkin_feedback) si hay alguno sin contestar.\n` +
      `5. **Lo que falta y no puedes arreglar tú**: nota con add_coach_task (cuestionario sin contestar, fotos que no sube, peso que no registra, algo del alta que sigue en blanco).\n` +
      `6. **Ficha viva** (propose_dossier_update): actualiza «dónde está», «qué esperamos» y el foco de la siguiente revisión.\n\n` +
      `Para cada cambio, di qué había antes y qué propones ahora.`,
  },
  {
    id: 'renovar_mes',
    label: 'Montar el mes siguiente',
    icon: 'autorenew',
    descripcion: 'Cliente que sigue: nuevo bloque sobre lo aprendido.',
    brief: ['estado', 'ficha', 'resumen', 'alta', 'plan', 'dieta', 'nutricion', 'entrenos', 'cuerpo', 'revisiones', 'cuestionarios', 'ajustes'],
    prompt: (nombre, email) =>
      `TAREA: montar el mes siguiente de ${nombre} (${email}), que ya lleva al menos un bloque con nosotros.\n` +
      `Empieza por get_client_brief con tarea "renovar_mes" — trae todo lo del mes anterior en una sola llamada. Lee la ficha viva y los ajustes que Dani hizo a mano: lo que corrigió la vez pasada tiene que venir ya puesto en esta propuesta. El brief ya trae el análisis de nutrición y el del cuerpo.\n\n` +
      `Antes de proponer, resume en cuatro frases qué ha pasado en el bloque anterior: qué progresó, qué se estancó, adherencia, peso. Y di qué cambia por eso en el bloque nuevo.\n\n` +
      PLAN_COMPLETO +
      `\n\nAl renovar, además: lo que ya esté bien configurado y no cambie NO se vuelve a proponer (no dupliques cuestionario, fotos ni escalera si ya los tiene) — dilo en una línea y sigue. En cada propuesta di explícitamente qué cambia respecto al bloque anterior: series por grupo, ejercicios que entran y salen, kcal por fase.`,
  },
];

export function tareaPorId(id: string): Tarea | undefined {
  return TAREAS.find(t => t.id === id);
}

/** El bloque del prompt de sistema que describe las tres tareas. Es texto
 *  estable (se cachea con el resto del prompt), así que nada volátil aquí. */
export const TAREAS_PROMPT = `## Las tres tareas de Dani
Casi todo lo que te pide cabe en una de estas tres. Cuando el mensaje empiece por «TAREA:», sigue su guion tal cual; cuando no, reconoce cuál es y aplícalo igual.
- **Montar el primer mes** (cliente nuevo): el plan ENTERO, plano por plano — mesociclo, sesiones, publicarlas en su calendario, periodización nutricional con sus dietas, pasos, calendario de comidas, cuestionario, fotos, cardio, escalera, hitos, días señalados, reto de la semana y ficha viva. Todo, en ese orden, en un solo turno.
- **Preparar la revisión** (a mitad de mes): veredicto con datos, repaso plano por plano, solo los cambios que cambien algo, feedback del check-in si lo hay, ficha viva al día.
- **Montar el mes siguiente** (cliente que renueva): igual que el primer mes, pero partiendo de lo que pasó y de lo que Dani corrigió a mano, sin volver a proponer lo que ya está bien puesto, y diciendo qué cambia respecto al bloque anterior.

Un plan NO está montado hasta que la checklist de Setup del cliente está en verde. Si al terminar sigue habiendo pendientes que tú podías haber propuesto, no has acabado. Lo que no puedes arreglar tú (algo del alta sin contestar, una foto que no sube) se deja como nota a Dani con add_coach_task, no se ignora.

Para las tres, el contexto se lee con UNA llamada: get_client_brief. No encadenes get_client_overview + get_onboarding + get_athlete_dossier + get_plan_context + … por separado: es lo mismo, ocho veces más caro.`;
