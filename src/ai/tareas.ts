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
 * La lista de pasos vive en `utils/recorridoDelPlan.ts` y es la MISMA que
 * recorre el coach a mano en la pestaña de Implantación. Cada paso declara qué
 * ítems de la checklist de Setup (`utils/clientSetup.ts`) lo comprueban, así
 * que un plan que la checklist da por incompleto es un plan incompleto aunque
 * el chat haya dicho que había terminado — y ya no hay dos listas que alguien
 * tenga que acordarse de sincronizar.
 */

import { textoDelPlanCompleto } from '../utils/recorridoDelPlan';

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
   Ya NO se escribe aquí: se genera desde `utils/recorridoDelPlan.ts`, que es el
   origen único de los 19 pasos y sus seis bloques.

   Antes esta constante era un texto literal y la cabecera de este archivo
   avisaba de que había que mantenerla a mano sincronizada con la checklist de
   Setup. Esa sincronía manual era el problema: un paso que solo entrara en una
   de las dos listas dejaba al asistente diciendo que había terminado un plan
   que la checklist daba por incompleto, sin que nada avisara.

   `recorridoDelPlan.test.ts` fija el texto resultante carácter a carácter, así
   que tocar un paso enseña en el diff exactamente qué línea del prompt cambia. */
const PLAN_COMPLETO = textoDelPlanCompleto();

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
