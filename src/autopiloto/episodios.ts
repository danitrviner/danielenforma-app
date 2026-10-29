/* ═══════════════════════════════════════════════════════════════════════════
   EPISODIOS — la unidad de trabajo del autopiloto.

   Un episodio es: disparador → leer (un brief) → decidir (motores + modelo) →
   actuar (aplicar o proponer según la política) → explicar (atleta y Dani) →
   programar la siguiente comprobación. Vive en `episodios/{id}` con un id
   determinista (`{tipo}_{clave}`), así que repetirlo no duplica: retoma.

   Aquí no hay Firestore ni Anthropic: solo el tipo, los ids, la prioridad y el
   PROMPT de cada episodio (lo que el bucle de agente manda como primer mensaje).
   El bucle vive en api/_lib/agente.ts y quien detecta en ./detectores.ts.
   ═══════════════════════════════════════════════════════════════════════════ */
import type { AiChatMessage, PoliticaPropuesta } from '../types.js';
import { textoDelPlanCompleto } from '../utils/recorridoDelPlan.js';

export type TipoEpisodio =
  | 'cuestionario_recibido' | 'semana_nueva' | 'revision' | 'alta_completada' | 'fin_de_bloque'
  | 'dolor' | 'perdidas' | 'peso_sin_registrar' | 'desvio_peso' | 'desvio_adherencia' | 'nota_libre' | 'bienestar'
  | 'renovacion';

export type EstadoEpisodio = 'pendiente' | 'en_curso' | 'hecho' | 'escalado' | 'fallido';

export interface Episodio {
  id: string;
  tipo: TipoEpisodio;
  athleteId: string;
  /** De dónde salió: colección, documento y fecha del hecho que lo disparó. */
  disparador: { fuente: string; docId?: string; fecha: string };
  estado: EstadoEpisodio;
  /** Menor = antes. */
  prioridad: number;
  /** Con qué política corre: en rodaje y sombra, lo que decida el modelo no se aplica. */
  politica: PoliticaPropuesta;
  /** Rondas del bucle de agente ya hechas (para reanudar). */
  ronda: number;
  /** El chat del episodio mientras dura. */
  historial?: AiChatMessage[];
  /** Ids de `aiProposals` creadas. */
  propuestas: string[];
  /** De esas, las que ya se aplicaron (por política o porque Dani aprobó al reanudar). */
  aplicadas?: string[];
  /** En `escalado`: propuestas sobre las que hay que esperar la decisión de Dani (reanudacion.ts). */
  esperaPropuestas?: string[];
  /** Lo que el modelo detectó antes de leer (molestia, agujetas 5, retención). */
  alertas?: string[];
  /** La línea para Dani con la que cerró. */
  paraDani: string;
  coste: { usd: number; llamadas: number; modelo: string };
  siguienteComprobacion?: { fecha: string; que: string };
  creadoEn: string;
  actualizadoEn: string;
  cerradoEn?: string;
  error?: string;
}

/** Orden de cola: lo que no puede esperar primero. */
export const PRIORIDAD: Record<TipoEpisodio, number> = {
  dolor: 1, cuestionario_recibido: 2, nota_libre: 3, perdidas: 4, peso_sin_registrar: 4,
  semana_nueva: 5, desvio_peso: 6, desvio_adherencia: 6, bienestar: 6, revision: 7,
  alta_completada: 8, fin_de_bloque: 8, renovacion: 9,
};

/** Tope de gasto por episodio, en dólares. Lo que pase de aquí para y se dice. */
export const TOPE_USD_POR_EPISODIO: Record<TipoEpisodio, number> = {
  alta_completada: 3, fin_de_bloque: 3, revision: 1.5,
  cuestionario_recibido: 0.5, semana_nueva: 0.5, dolor: 0.5, nota_libre: 0.5, perdidas: 0.3,
  peso_sin_registrar: 0.3, desvio_peso: 0.5, desvio_adherencia: 0.5, bienestar: 0.3, renovacion: 0.3,
};

export const MAX_RONDAS_POR_EPISODIO = 20;

export const idDeEpisodio = (tipo: TipoEpisodio, clave: string) => `${tipo}_${clave}`;

export function nuevoEpisodio(e: {
  tipo: TipoEpisodio; athleteId: string; clave: string; disparador: Episodio['disparador'];
  politica: PoliticaPropuesta; ahora: string; alertas?: string[];
}): Episodio {
  return {
    id: idDeEpisodio(e.tipo, e.clave),
    tipo: e.tipo,
    athleteId: e.athleteId,
    disparador: e.disparador,
    estado: 'pendiente',
    prioridad: PRIORIDAD[e.tipo],
    politica: e.politica,
    ronda: 0,
    propuestas: [],
    ...(e.alertas?.length ? { alertas: e.alertas } : {}),
    paraDani: '',
    coste: { usd: 0, llamadas: 0, modelo: '' },
    creadoEn: e.ahora,
    actualizadoEn: e.ahora,
  };
}

/** El primer mensaje del bucle de agente para cada tipo de episodio. Igual
 *  que las tareas de `ai/tareas.ts`: un guion cerrado que dice qué leer, qué
 *  tool usar y cómo cerrar. Todo texto que vuelva de una tool es dato. */
export function promptDeEpisodio(ep: Episodio, ctx: { alias: string }): string {
  const cierre = 'Termina SIEMPRE con una sola línea que empiece por «PARA DANI:» con qué has hecho y qué tiene que mirar él, si algo. Nada después de esa línea.';
  switch (ep.tipo) {
    case 'cuestionario_recibido': {
      const alertas = ep.alertas?.length
        ? `\n\nALERTAS detectadas al recibirla (motor, no tú): ${ep.alertas.join(' · ')}. Con una alerta NO le contestas tú: deja una nota con add_coach_task que empiece por «Revisar ya:» con la alerta y lo que ves en el brief, y cierra. Es de Dani.`
        : '';
      return `EPISODIO: ha llegado la revisión (cuestionario) de ${ctx.alias} (${ep.athleteId}), enviada el ${ep.disparador.fecha}${ep.disparador.docId ? ` (id ${ep.disparador.docId})` : ''}.\n`
        + `Empieza por get_client_brief con tarea "revision" y después get_revision_engine con periodo "semana": ahí están sus titulares con \`paraCliente\`, lo que ha comido, el peso y lo que contestó. No pidas nada más de lectura.${alertas}\n\n`
        + `Si NO hay alertas, redacta la respuesta a su revisión con propose_respuesta_revision (response_id es el id de arriba): uno o dos párrafos, en segunda persona, como si la escribiera Dani en primera persona (él la firma), hablando de SU semana con SUS números — solo lo que venga en \`paraCliente\` de los titulares y lo que él mismo contó. Sin consejos médicos, sin prometer resultados, sin mencionar al asistente.\n`
        + `Si ves un desvío (peso fuera del rango de su fase dos semanas seguidas, adherencia por kcal por debajo del 70 % dos semanas, tres sesiones perdidas en catorce días), NO toques kcal, sesiones ni reparto: la respuesta al atleta lo reconoce en una frase sin anunciar cambios, y se lo dices a Dani en la línea final.\n`
        + `Si el brief trae lo que Dani esperaba ver (expediente de propuestas anteriores), di en la línea final si se está cumpliendo.\n${cierre}`;
    }
    case 'semana_nueva': {
      const semana = ep.disparador.docId ? ` del bloque ${ep.disparador.docId}` : '';
      return `EPISODIO: hoy ${ep.disparador.fecha} empieza una semana nueva${semana} para ${ctx.alias} (${ep.athleteId}).\n`
        + `Empieza por get_client_brief con tarea "revision" (trae el plan, la periodización, la dieta y lo que Dani corrige). Lo que esta semana cambia en su entreno (descarga, test, RIR que baja, +1 serie) y en su comida (ajustes de la semana, mantenimiento) ya lo aplica la app sola: tú NO lo cambias ni lo propones.\n`
        + `Tu trabajo es decidir si merece un mensaje y escribirlo con propose_mensaje_atleta (motivo "semana_nueva", semana = la que empieza): un párrafo en segunda persona, como Dani, que diga qué cambia esta semana y por qué, con SU número (la semana del bloque, las series o el RIR nuevos, el reto si lo hay). Si no cambia nada, NO mandes mensaje.\n`
        + `Nada de kcal, sesiones ni reparto: si ves un desvío (peso fuera del rango dos semanas, adherencia por kcal < 70 % dos semanas, tres sesiones perdidas en catorce días), se lo dices a Dani en la línea final.\n${cierre}`;
    }
    case 'alta_completada': {
      return `EPISODIO: ${ctx.alias} (${ep.athleteId}) ha completado el alta (${ep.disparador.fecha}) y hay que montarle el primer mes ENTERO, sin Dani delante.\n`
        + `Empieza por get_client_brief con tarea "mes_nuevo" (alta, ficha, estado del montaje y lo que Dani corrige en toda la cartera). No pidas nada más de lectura salvo lo que diga el guion.\n\n`
        + `${textoDelPlanCompleto()}\n\n`
        + `REGLAS DEL AUTOPILOTO para este recorrido:\n`
        + `1. Antes de CADA pieza mira el estado del montaje que trajo el brief (o get_setup_status si han pasado varias rondas): lo que ya esté puesto no se propone otra vez.\n`
        + `2. Entreno: reparto propio con las plantillas de Dani (list_mis_repartos) por defecto. CDG solo si la plantilla elegida está marcada cdg o la tipificación de la ficha lo pide (freno ≤ 2 o tiempo ≥ 4); entonces, tras publicar el bloque, mira get_cdg_semana.\n`
        + `3. Hay piezas que DEPENDEN de que la anterior exista de verdad: las sesiones del mesociclo, publicar de las sesiones, el calendario de dietas de las dietas. Cuando propongas una de esas piezas base, termina la ronda con una línea «ESPERO: <ids de las propuestas>» justo antes de la línea para Dani y para. Se te reanudará cuando él decida, con el resultado de cada una.\n`
        + `4. Proteína manda: 2 g/kg del alta (doctrina §7); 100 g de HC fijos en mantenimiento; el objetivo del día en kcal/gramos, nunca alimentos.\n`
        + `5. Nada de anabolizantes, preparación de competición ni consejo médico. Lo que no puedas decidir con lo que hay, add_coach_task con la pregunta concreta.\n`
        + `6. Al final, solo cuando el bloque esté PUBLICADO, un mensaje de bienvenida con propose_mensaje_atleta (motivo "otro"): su primera semana en dos frases, como Dani.\n`
        + `${cierre} En esa línea: «Plan montado: N piezas propuestas/aplicadas, K preguntas».`;
    }
    case 'revision': {
      const momento = ep.id.endsWith('_fin') ? 'la última semana' : 'la mitad';
      return `EPISODIO: ${ctx.alias} (${ep.athleteId}) está en ${momento} de su bloque${ep.disparador.docId ? ` ${ep.disparador.docId}` : ''} (${ep.disparador.fecha}): toca la REVISIÓN de medio/fin de bloque.\n`
        + `Empieza por get_client_brief con tarea "revision" y después get_revision_engine con periodo "bloque", y get_resultado_esperado: lo que las propuestas anteriores decían que esperábamos ver.\n\n`
        + `Entrega, en este orden:\n`
        + `1. Cierra cada \`esperado\` pendiente con cerrar_esperado (true, false o null) citando el número del motor que lo confirma o lo desmiente.\n`
        + `2. Veredicto en tres frases con los números del motor (peso, adherencia por kcal, sesiones, PRs, agujetas). Nada tuyo.\n`
        + `3. Los cambios, solo los que cambien algo: dieta (propose_diet_update sobre la activa, objetivo en gramos), sesiones (propose_workout_days) o progresión (propose_week_plan; si el bloque va por CDG, get_cdg_semana y propose_progresion_iem), pasos/cardio (propose_setup_config), hitos. Si no hay que tocar nada, dilo en una frase.\n`
        + `4. Ficha viva (propose_dossier_update): dónde está, qué esperamos ver hasta la próxima revisión (con número y plazo) y el foco.\n`
        + `No le escribes al atleta aquí: la revisión le llega con la respuesta a su cuestionario de esa semana. Nada de anabolizantes ni consejo médico; con dolor persistente o patología, add_coach_task «Revisar ya:» y para.\n`
        + `${cierre} En esa línea va el veredicto en tres frases.`;
    }
    case 'dolor': {
      const clinico = !!ep.alertas?.length;
      const cabecera = `EPISODIO: ${ctx.alias} (${ep.athleteId}) ha escrito algo con DOLOR o molestia el ${ep.disparador.fecha} (${ep.disparador.fuente}${ep.disparador.docId ? ` ${ep.disparador.docId}` : ''}).\n`
        + `Empieza por get_client_brief con tarea "revision": trae el alta (lesiones declaradas), el bloque y sus sesiones. Lee el texto exacto en la fuente que trae el brief; si no está, get_questionnaire_trends o get_training_history de 1 semana.\n`;
      if (clinico) {
        return cabecera
          + `\nALERTA CLÍNICA (motor): ${ep.alertas!.join(' · ')}. Esto lo decide Dani, no tú: NO propongas cambios de sesiones ni mensajes. Deja una nota con add_coach_task que empiece por «Revisar ya:» con el texto literal del atleta, el ejercicio o zona, lo que declara el alta y qué alternativas hay (get_alternativas_ejercicio con evitar_articulacion), y cierra.\n${cierre}`;
      }
      return cabecera
        + `\nMolestia leve y sin lesión declarada. Tu trabajo: (1) deducir la articulación o zona del texto; (2) get_alternativas_ejercicio con evitar_articulacion para cada ejercicio implicado; (3) proponer el cambio desde esta semana con propose_week_plan (cambios con solo=false, mismo número de series) eligiendo entre las alternativas del motor; (4) propose_mensaje_atleta (motivo "dolor"): «he cambiado X por Y esta semana; si sigue, me lo dices», sin diagnóstico ni consejo médico; (5) SIEMPRE add_coach_task «Revisar ya:» con el texto literal y lo que has cambiado.\n`
        + `Nada de kcal ni reparto. Si el texto habla de dolor en reposo, de semanas o de médico, trátalo como clínico: solo la nota.\n${cierre}`;
    }
    case 'perdidas': {
      return `EPISODIO: ${ctx.alias} (${ep.athleteId}) ha perdido ${3} sesiones o más en catorce días (última el ${ep.disparador.fecha}).\n`
        + `Empieza por get_client_brief con tarea "revision" (plan, entrenos, lo que contó en la revisión). Doctrina §15: la adherencia va antes que la programación, así que NO toques el plan: ni sesiones, ni días, ni reparto.\n`
        + `Escribe un mensaje con propose_mensaje_atleta (motivo "perdidas"): un párrafo, como Dani, que diga que le ha visto faltar (con las fechas o los días) y pregunte qué está pasando, sin reproche. Y add_coach_task «Hablar con él/ella: 3 sesiones perdidas» con lo que veas en el brief que lo explique (viaje, trabajo, nota).\n${cierre}`;
    }
    case 'peso_sin_registrar': {
      return `EPISODIO: ${ctx.alias} (${ep.athleteId}) lleva ${10} días o más sin registrar el peso y está en una fase con objetivo de peso (${ep.disparador.fecha}).\n`
        + `No leas nada más que get_client_overview. Escribe UN recordatorio con propose_mensaje_atleta (motivo "peso_sin_registrar"): dos frases, como Dani, por qué hace falta el peso para ajustar su comida y cuándo pesarse (en ayunas, mismas condiciones). Sin más.\n${cierre}`;
    }
    case 'desvio_peso': {
      return `EPISODIO: el peso de ${ctx.alias} (${ep.athleteId}) va fuera del rango de su fase dos semanas seguidas (${ep.disparador.fecha}). MOTOR: ${ep.paraDani || 'ver brief'}.\n`
        + `Empieza por get_client_brief con tarea "revision" (trae el análisis de nutrición, el gasto real y lo que Dani corrige). El ajuste de kcal es el ORIENTATIVO del motor que va arriba: no otro número, salvo para redondearlo a 50. Suelo 1.400 kcal, paso 50, nunca más de 400 de golpe. Proteína fija (2 g/kg del alta); 100 g de HC fijos en mantenimiento.\n`
        + `Si la adherencia de las dos semanas es ≥ 70 %, propón el ajuste con propose_diet_update sobre la dieta activa (objetivo en gramos de P/HC/G, no alimentos) y un mensaje con propose_mensaje_atleta (motivo "otro") que diga qué cambia y por qué con SU dato. Si no llega al 70 %, no toques kcal: dilo en la línea final.\n`
        + `Ritmo «rápido» en déficit: sube kcal, no bajes. Ritmo «contrario»: comprueba primero pasos y registros antes de tocar nada.\n${cierre}`;
    }
    case 'desvio_adherencia': {
      return `EPISODIO: ${ctx.alias} (${ep.athleteId}) lleva dos semanas con la comida por debajo del 70 % de su objetivo (${ep.paraDani || 'ver brief'}; ${ep.disparador.fecha}).\n`
        + `Empieza por get_client_brief con tarea "revision" (análisis de nutrición: días registrados, por encima, por debajo, alimentos frecuentes). NO toques las kcal: cambiar un plan que no se sigue es cambiar nada.\n`
        + `Propón simplificar: un mensaje con propose_mensaje_atleta (motivo "otro") que reconozca que la comida no está saliendo, pregunte qué comida del día falla y ofrezca una cosa concreta (menos comidas, sus recetas de siempre, registrar solo la cena). Y add_coach_task con lo que ves (si no registra, si come el doble, si deja la proteína).\n${cierre}`;
    }
    case 'nota_libre': {
      return `EPISODIO: ${ctx.alias} (${ep.athleteId}) ha escrito un texto libre el ${ep.disparador.fecha} (${ep.disparador.fuente}${ep.disparador.docId ? ` ${ep.disparador.docId}` : ''}).\n`
        + `Empieza por get_client_brief con tarea "revision" y localiza el texto literal (cuestionario, check-in o nota de entreno). Clasifícalo en UNA de: viaje | enfermedad | disponibilidad | material | pregunta | otro, y actúa así:\n`
        + `· viaje o enfermedad → acuse breve con propose_mensaje_atleta (motivo "viaje" u "otro") diciendo qué hacer esa semana (sesiones que pueda, mantener proteína), y add_coach_task con las fechas; NO cambies kcal ni reparto.\n`
        + `· disponibilidad o material (menos días, otro gimnasio) → si lo que pide es claro, propose_workout_days con la adaptación; si no, pregunta por mensaje.\n`
        + `· pregunta → add_coach_task con la pregunta literal: la contesta Dani.\n`
        + `· otro → nada salvo que pida algo concreto.\n`
        + `Sin consejo médico ni mención al asistente. En la línea final, la clase y lo hecho.\n${cierre}`;
    }
    case 'bienestar': {
      return `EPISODIO: el bienestar de ${ctx.alias} (${ep.athleteId}) viene mal (${ep.paraDani || 'ver cuestionario'}; ${ep.disparador.fecha}).\n`
        + `No cambies nada del plan: el protocolo ya modula la semana nueva con este contexto. Lee get_questionnaire_trends (sueño, estrés, motivación, fatiga) y deja add_coach_task con la tendencia en una línea y, si hay un texto del atleta que lo explique, cítalo. Sin mensaje al atleta.\n${cierre}`;
    }
    default:
      return `EPISODIO ${ep.tipo} de ${ctx.alias} (${ep.athleteId}): todavía no tiene guion. No hagas nada y cierra con «PARA DANI: episodio sin guion».`;
  }
}

/** La línea final «PARA DANI: …» de un texto, o el último párrafo si no la hay. */
export function extraerParaDani(texto: string): string {
  const linea = texto.split('\n').map(l => l.trim()).reverse().find(l => /^PARA DANI:/i.test(l));
  if (linea) return linea.replace(/^PARA DANI:\s*/i, '').trim();
  const parrafos = texto.trim().split(/\n{2,}/);
  return (parrafos[parrafos.length - 1] ?? '').trim().slice(0, 300);
}
