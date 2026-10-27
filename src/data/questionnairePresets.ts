// Las 7 plantillas reales que Dani usa hoy en HubFit, traídas a En Forma.
// El coach las carga con un click en QuestionnaireManagerScreen (mismo patrón
// que STANDARD_PLAN_PRESET en phasePresets.ts / LADDER_PRESETS en
// ladderPresets.ts) y luego las edita a medida con QuestionnaireEditor.
//
// Tipos subidos respecto a la hoja original de Dani (todo lo demás respeta su
// tipo exacto — Text/Number/Scale/Yes-No/Metric/Media tal cual los definió):
// - "¿Qué nivel de estrés tienes en tus días? Valóralo del 1-10" → Scale (era Text)
// - "¿Cómo valorarías en general este bloque de entrenamiento del 1 al 10?" → Scale (era Text)
// - "¿Cuántas horas acostumbras a dormir?" → Number, horas (era Text)
// Los tres eran preguntas 1-10/numéricas escritas como texto libre en el
// original — como texto libre no se pueden graficar ni correlacionar, que es
// justo el objetivo de este proyecto.

import { QuestionnaireQuestion, QSchedule, BodyMetricKey, Questionnaire, MuscleGroup } from '../types.js';
import { OPCIONES_GRUPOS, VolumeSignalKey, SignalKey, AgujetasSignalKey } from './questionnaireSignals.js';
import { ZONAS_IEM } from '../utils/cdg/zonas.js';

export interface QuestionnairePresetDef {
  title: string;
  description?: string;
  questions: Omit<QuestionnaireQuestion, 'id'>[];
  // Calendario sugerido al asignar — sin startDate (eso lo fija el coach al
  // asignar, por atleta). ClientReviewsPanel lo usa para prellenar ScheduleFields.
  suggestedSchedule: QSchedule;
}

// ── Helpers terse para no repetir la forma completa en cada una de las ~94
// preguntas de las 7 plantillas ──────────────────────────────────────────────

function text(label: string, required = false, helpText?: string): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'text', required, helpText };
}
function numeric(label: string, opts: { unit?: string; required?: boolean } = {}): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'numeric', required: opts.required ?? false, unit: opts.unit };
}
// Igual que `numeric`, pero etiquetando la respuesta con una señal legible por un motor.
function numericSignal(label: string, signalKey: SignalKey, opts: Parameters<typeof numeric>[1] = {}): Omit<QuestionnaireQuestion, 'id'> {
  return { ...numeric(label, opts), signalKey };
}
// Pregunta de opción única/múltiple genérica (no atada a grupos musculares como choiceGroups).
function choice(label: string, options: string[], opts: { signalKey?: SignalKey; required?: boolean; multiSelect?: boolean; helpText?: string } = {}): Omit<QuestionnaireQuestion, 'id'> {
  return {
    label, type: 'choice', required: opts.required ?? false, options,
    multiSelect: opts.multiSelect ?? false, signalKey: opts.signalKey, helpText: opts.helpText,
  };
}
function scale(label: string, opts: { required?: boolean; min?: number; max?: number; minLabel?: string; maxLabel?: string } = {}): Omit<QuestionnaireQuestion, 'id'> {
  return {
    label, type: 'scale', required: opts.required ?? false,
    scaleMin: opts.min ?? 1, scaleMax: opts.max ?? 10,
    scaleMinLabel: opts.minLabel, scaleMaxLabel: opts.maxLabel,
  };
}
function boolQ(label: string, required = false): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'boolean', required };
}
// Pregunta de "elige grupos musculares" — las 17 opciones se generan desde
// MUSCLE_ORDER/MUSCLE_LABELS (ver questionnaireSignals) para que no puedan
// desincronizarse del enum si algún día se añade un grupo.
function choiceGroups(label: string, signalKey: VolumeSignalKey, helpText?: string): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'choice', required: false, options: OPCIONES_GRUPOS, multiSelect: true, signalKey, helpText };
}
// Igual que `scale`, pero etiquetando la respuesta con una señal legible por
// un motor (hoy, el sugeridor de volumen).
function scaleSignal(label: string, signalKey: SignalKey, opts: Parameters<typeof scale>[1] = {}): Omit<QuestionnaireQuestion, 'id'> {
  return { ...scale(label, opts), signalKey };
}
function metric(label: string, metricKey: BodyMetricKey, required = true): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'metric', required, metricKey };
}
function media(label: string, required = false, mediaKind?: 'video' | 'image'): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'media', required, mediaKind };
}

// ── Presentación (asistente conversación + selección, 27-10) ─────────────────
type Presentacion = Pick<QuestionnaireQuestion, 'bloque' | 'contexto' | 'tituloCorto' | 'conComentario' | 'presentacion' | 'autoRelleno' | 'helpText'>;
/** Añade bloque, contexto, título corto… a una pregunta. */
function con(q: Omit<QuestionnaireQuestion, 'id'>, p: Presentacion): Omit<QuestionnaireQuestion, 'id'> {
  return { ...q, ...p };
}
/** «¿Lo mantenemos o cambiamos algo?» — si cambia, se le pide qué. */
function mantenerCambiar(label: string, labels: { mantener?: string; cambiar?: string } = {}): Omit<QuestionnaireQuestion, 'id'> {
  return { label, type: 'keep_change', required: false, labelTrue: labels.mantener, labelFalse: labels.cambiar };
}
/** Escala 1-10 con comentario opcional debajo. */
function notaConComentario(label: string, opts: Parameters<typeof scale>[1] = {}): Omit<QuestionnaireQuestion, 'id'> {
  return { ...scale(label, opts), conComentario: true };
}

// ── 1. Entrenamiento (alta) ───────────────────────────────────────────────────

const ENTRENAMIENTO: QuestionnairePresetDef = {
  title: 'Entrenamiento',
  description: 'Anamnesis inicial completa — se pasa una vez, al dar de alta al cliente.',
  suggestedSchedule: { type: 'once' },
  questions: [
    text('Nombre completo'),
    text('Ocupación'),
    numeric('Edad'),
    metric('Peso corporal (kg)', 'bodyweight'),
    metric('Altura (cm)', 'altura'),
    choice('Sexo biológico', ['Hombre', 'Mujer'], { signalKey: 'perfil.sexo_biologico', required: true }),
    numericSignal('¿Cuántos años llevas entrenando con regularidad?', 'perfil.antiguedad_entrenamiento_anios', { unit: 'años' }),
    text('Objetivo'),
    text('¿Actualmente tienes alguna lesión o molestia?'),
    text('En caso afirmativo, ¿dónde y qué intensidad del 1-10 le asocias?'),
    text('¿En qué gestos, movimientos o ejercicios sientes dolor?'),
    text('¿Has sufrido lesiones con anterioridad?'),
    text('Si la respuesta es sí, ¿de qué?'),
    text('¿Consumes algún tipo de medicamento o fármaco?'),
    text('¿Te han realizado alguna intervención quirúrgica reciente (prótesis, marcapasos, cirugía gástrica…)?'),
    text('¿Fumas, consumes bebidas alcoholicas y/o alguna otra sustancia?'),
    numeric('¿Cuál es tu exposición al sol durante la semana?', { unit: 'min' }),
    numeric('¿Cuántos días puedes entrenar a la semana?'),
    scale('¿Cuál es tu grado de motivación actual? Valóralo del 1 al 10'),
    text('¿Cuáles son los grupos musculares o ejercicios en los que quieres mejorar?'),
    text('¿Los días de descanso (no realizas deporte) te mantienes activo?'),
    text('¿Cómo calificarías la demanda física de tu trabajo u ocupación?'),
    numeric('Especifica las horas que pasas sentado al día.', { unit: 'h' }),
    text('¿Actualmente te sientes fatigado o tienes sensación de baja energía?'),
    scale('¿Qué nivel de estrés tienes en tus días? Valóralo del 1-10'),
    text('¿A qué crees que puede deberse?'),
    numeric('¿Cuántas horas acostumbras a dormir?', { unit: 'h' }),
    text('¿En qué horario tiene lugar?'),
    text('¿Cómo calificarías el descanso? Reparador, deficitario, insuficiente...'),
    text('En caso de deficitario lo asocias a: (Te cuesta quedarte dormido, Estrés, Pensamientos circulares, Ansiedad, Duermo pero siento que no descanso...)'),
    text('¿Cumples con una rutina de sueño o acostumbras a pasar de la pantalla a dormir?'),
    text('¿Alguna vez has necesitado tomar medicación para conciliar el sueño? En caso afirmativo, especifica cuál.'),
  ],
};

// ── 2. Evaluación Inicial Dolor ───────────────────────────────────────────────

const EVALUACION_DOLOR: QuestionnairePresetDef = {
  title: 'Evaluación Inicial Dolor',
  description: 'Solo para clientes que reportan dolor o molestia en el alta — se pasa una vez.',
  suggestedSchedule: { type: 'once' },
  questions: [
    text('¿En qué crees que puedo ayudarte con este dolor que tienes?'),
    text('¿Cuándo y cómo empezó?'),
    text('¿Cómo ha ido evolucionando?'),
    text('Descríbeme tu dolor / molestia'),
    text('3-5 cosas que aumenten el dolor'),
    text('3-5 cosas que disminuyan el dolor'),
    text('¿Qué haces cuando tu dolor aumenta?'),
    text('¿Cómo te afecta en tu vida diaria?'),
    text('¿Qué cosas harías si no tuvieras dolor/lesión/ o has dejado de hacer por el dolor?'),
    text('¿Cómo crees que evolucionarás con el tiempo?'),
    text('¿Cuáles son tus objetivos con el tratamiento? ¿Por qué son relevantes para ti?'),
  ],
};

// ── 3. DOM's o "agujetas" ─────────────────────────────────────────────────────
// Escala visual analógica 0-10 por grupo muscular. Las 14 zonas se quedan tal
// cual las definió Dani, sin mapear a los MuscleGroup de la app — decisión
// explícita, no se toca el heatmap MEV/MAV/MRV ni la biblioteca de ejercicios.

// Las 14 zonas SIGUEN SIENDO las de Dani; lo único que se añade es la señal
// que las hace legibles para un motor. No es un mapeo perfecto ni pretende
// serlo: OBLICUOS y ABDOMEN caen los dos en `core` (quien lee se queda con el
// valor más alto de los dos) y HOMBRO se apunta al deltoide lateral, que es lo
// que se entiende por "hombro" al hablar de agujetas. Antebrazo, rotadores y
// los deltoides anterior/posterior no tienen zona propia: simplemente se
// quedan sin esa señal, no se inventa una.
const DOMS_ZONES: { zona: string; group: MuscleGroup }[] = [
  { zona: 'CUÁDRICEPS',     group: 'cuadriceps' },
  { zona: 'ISQUIOTIBIALES', group: 'isquios' },
  { zona: 'GLÚTEOS',        group: 'gluteo' },
  { zona: 'ADUCTORES',      group: 'aductores' },
  { zona: 'LUMBARES',       group: 'lumbares' },
  { zona: 'GEMELOS',        group: 'gemelo' },
  { zona: 'OBLICUOS',       group: 'core' },
  { zona: 'ABDOMEN',        group: 'core' },
  { zona: 'PECTORAL',       group: 'pecho' },
  { zona: 'TRAPECIO',       group: 'trapecio' },
  { zona: 'DORSAL',         group: 'dorsal' },
  { zona: 'TRÍCEPS',        group: 'triceps' },
  { zona: 'BÍCEPS',         group: 'biceps' },
  { zona: 'HOMBRO',         group: 'deltoide_lat' },
];

// DOM's 0-10 por grupo, una vez a la semana. El paquete oficial ya no lo usa:
// las agujetas van en 1-5 por zona dentro de «Tu semana» (Dani, 27-10, PR #20).
// Se conserva para quien lo tenga asignado; el CDG lo convierte a 1-5.
const DOMS: QuestionnairePresetDef = {
  title: "DOM's o \"agujetas\"",
  description: 'Una vez a la semana. Escala de 0 (nada) a 10 (muchísimo) por grupo muscular, pensando en cómo quedaste a los dos días de entrenarlo.',
  suggestedSchedule: { type: 'interval', intervalDays: 7 },
  questions: [
    ...DOMS_ZONES.map(({ zona, group }) => scaleSignal(zona, `doms.${group}` as VolumeSignalKey, { required: true, min: 0, max: 10, minLabel: 'Nada', maxLabel: 'Muchísimo' })),
    scaleSignal('¿Cómo de cansado sales de las sesiones esta semana?', 'wellness.fatigue_post_weekly', { required: false, minLabel: 'Fresco', maxLabel: 'Destrozado' }),
    scaleSignal('¿Cuántas ganas tienes de entrenar esta semana?', 'wellness.motivation_weekly', { required: false, minLabel: 'Ninguna', maxLabel: 'Muchísimas' }),
  ],
};

// ── 4. Mediciones ──────────────────────────────────────────────────────────────

const MEDICIONES: QuestionnairePresetDef = {
  title: 'Mediciones',
  description: 'Perímetros corporales mensuales — alimentan la ficha de mediciones y los índices '
    + 'antropométricos (Pecho/Cintura, Bíceps/Cintura, Cadera/Cintura, Muslo/Cintura). Sigue el orden del '
    + 'protocolo en vídeo: https://www.youtube.com/watch?v=cCQ8SPp9jdc',
  suggestedSchedule: { type: 'monthly', dayOfMonth: 26 },
  questions: [
    metric('Cuello (cm)', 'cuello'),
    metric('Contorno de pecho (cm)', 'pecho'),
    metric('Bíceps derecho relajado (cm)', 'biceps_der_relajado'),
    metric('Bíceps derecho contraído (cm)', 'biceps_der_contraido'),
    metric('Bíceps izquierdo relajado (cm)', 'biceps_izq_relajado'),
    metric('Bíceps izquierdo contraído (cm)', 'biceps_izq_contraido'),
    metric('Perímetro de cintura (cm)', 'cintura'),
    metric('Perímetro de abdomen (cm)', 'abdomen'),
    metric('Perímetro de cadera (cm)', 'cadera'),
    metric('Muslo derecho relajado (cm)', 'muslo_der_relajado'),
    metric('Muslo derecho contraído (cm)', 'muslo_der_contraido'),
    metric('Muslo izquierdo relajado (cm)', 'muslo_izq_relajado'),
    metric('Muslo izquierdo contraído (cm)', 'muslo_izq_contraido'),
    metric('Gemelo derecho (cm)', 'gemelo_der'),
    metric('Gemelo izquierdo (cm)', 'gemelo_izq'),
  ],
};

// ── 5. Revisión Semana 3 ──────────────────────────────────────────────────────

const REVISION_SEMANA_3: QuestionnairePresetDef = {
  title: 'Revisión Semana 3',
  description: 'Tres semanas dentro: cómo lo vives, qué cuesta y si necesitas algo más de mí.',
  suggestedSchedule: { type: 'plan_week', planWeek: 3 },
  questions: [
    con(scaleSignal('¿Cómo calificarías tu satisfacción general con el programa hasta ahora?', 'retencion.satisfaccion', { required: true }), { bloque: 'Cómo va', tituloCorto: 'Satisfacción' }),
    con(text('¿Qué aspectos te han gustado más estas tres semanas y por qué?', true), { bloque: 'Cómo va', tituloCorto: 'Lo que más te gusta' }),
    con(text('¿Qué partes del entrenamiento o de la nutrición no te están gustando o se te hacen difíciles de seguir?', true), { bloque: 'Cómo va', tituloCorto: 'Lo que cuesta' }),
    con(text('¿Te has encontrado con obstáculos que te impidan cumplir el plan?', true, 'Horarios, lesiones, falta de motivación, logística…'), { bloque: 'Cómo va', tituloCorto: 'Obstáculos' }),
    con(scale('¿En qué medida sientes que recibes el apoyo que necesitas por mi parte?', { required: true }), { bloque: 'Soporte', tituloCorto: 'Apoyo' }),
    con(scaleSignal('¿Qué probabilidad hay de que continúes con el programa después de esta semana?', 'retencion.continuar', { required: true }), { bloque: 'Soporte', tituloCorto: 'Ganas de seguir' }),
    con(text('¿Hay algún otro comentario, sugerencia o preocupación que quieras compartir?'), { bloque: 'Soporte', tituloCorto: 'Comentarios' }),
  ],
};

// ── 6. Revisión Semanal ───────────────────────────────────────────────────────

const REVISION_SEMANAL: QuestionnairePresetDef = {
  title: 'Revisión Semanal',
  description: 'Control semanal de progreso, adherencia y sensaciones.',
  suggestedSchedule: { type: 'weekdays', weekdays: [5] }, // viernes
  questions: [
    text('¿Hay algo de lo que estés especialmente orgulloso esta semana? Verte mejor, sentirte mas fuerte, subir peso...', true),
    text('¿En qué ejercicios te has sentido más fuerte esta semana?', true),
    text('¿Qué ejercicios te han costado algo más esta semana?', true),
    numeric('Anota pasos diarios de media (si no tienes dispositivo conectado)', { unit: 'pasos' }),
    boolQ('¿Has seguido más del 80% del plan nutricional en la semana?', true),
    scale('Puntúa tu sueño esta semana', { required: true }),
    numericSignal('¿Cuántas horas dormiste de media esta semana?', 'wellness.sleep_hours_weekly', { unit: 'h', required: true }),
    scaleSignal('¿Qué nivel de estrés has tenido esta semana? Valóralo del 1-10', 'wellness.stress_weekly', { required: true }),
    media('Corrección de ejercicios en video (Grábate que no te lo tenga que pedir)', false, 'video'),
    scale('¿Cuánto crees que estás progresando?'),
    scale('¿Cómo de cansado te sientes?'),
  ],
};

// ── 7. Datos sobre final de mesociclo ─────────────────────────────────────────

const FINAL_MESOCICLO: QuestionnairePresetDef = {
  title: 'Datos sobre final de mesociclo',
  description: 'Cierre de bloque: qué mantener, qué cambiar y objetivos del siguiente.',
  suggestedSchedule: { type: 'mesocycle_end' },
  questions: [
    scaleSignal('¿Cómo valorarías en general este bloque de entrenamiento del 1 al 10?', 'meso_end.rating'),
    // Las cuatro preguntas medibles del cierre. No sustituyen a ninguna de las
    // de texto libre de Dani —esas siguen abajo, íntegras— sino que ponen en
    // números lo que él ya preguntaba en prosa, para que el sugeridor de
    // volumen del bloque siguiente pueda leerlo.
    scaleSignal('¿Cómo de bien te has recuperado entre sesiones?', 'meso_end.recovery',
      { minLabel: 'Fatal', maxLabel: 'Perfecto' }),
    scaleSignal('¿Cómo de exigentes te han parecido las series?', 'meso_end.effort',
      { minLabel: 'Me sobraba', maxLabel: 'Al límite' }),
    choiceGroups('¿Qué grupos quieres priorizar en el siguiente bloque?', 'meso_end.priority_groups',
      'Puedes marcar varios.'),
    choiceGroups('¿En qué grupos sentiste que el volumen fue demasiado?', 'meso_end.overload_groups',
      'Puedes marcar varios, o ninguno.'),
    text('¿Hubo alguna semana en la que notaste que la recuperación no era suficiente?'),
    text('¿Qué ejercicios te han generado mejores sensaciones musculares?'),
    text('¿Hay algún ejercicio que no hayas terminado de sentir bien o que te haya generado molestias?'),
    text('¿Qué grupo muscular sientes que ha respondido mejor?'),
    text('¿Hay algún grupo muscular que sientas que se ha quedado atrás o que quieras priorizar en el siguiente bloque?'),
    text('¿Las series te han parecido suficientemente exigentes o sientes que podrías haber metido más?'),
    text('¿Hubo algún día o ejercicio en el que sintieras que el volumen era demasiado?'),
    text('¿Cómo llevas los drop sets o las series cercanas al fallo? ¿Te motivan o te generan rechazo?'),
    text('¿El tiempo de sesión te ha resultado manejable o ha sido demasiado largo?'),
    text('¿Ha habido alguna semana en la que el entreno haya interferido con el trabajo, el sueño u otras áreas?'),
    text('¿Hay algún ejercicio que quieras mantener sí o sí en el siguiente bloque?'),
    text('¿Hay algo que te apetezca probar o cambiar?'),
    text('¿Tienes algún objetivo concreto para el próximo bloque: más fuerza, más masa en una zona específica, mejor condición física general?'),
    text('¿Hay alguna molestia articular o muscular que tengamos que tener en cuenta?'),
    text('¿Algo más que quieras comentarme que no haya preguntado?'),
  ],
};

// ── 8. Check Mes 5 (semestral) ────────────────────────────────────────────────
// El bloque compartido de 4 preguntas (sensaciones entreno/motivación/días
// disponibles/mejora del coach) que reaparece en varias plantillas de Dani —
// aquí en su versión mínima, sin la intro ni el cierre motivacional de la
// Semana 10.

const CHECK_MES_5: QuestionnairePresetDef = {
  title: 'Check Mes 5 (semestral)',
  description: 'Pulso corto de mitad de programa semestral.',
  suggestedSchedule: { type: 'once' },
  questions: [
    con(scale('En cuanto al entrenamiento, ¿has tenido buenas sensaciones?', { minLabel: 'Malas', maxLabel: 'Muy buenas' }), { tituloCorto: 'Sensaciones' }),
    con(scaleSignal('¿Qué puntuación le darías a tu motivación actual?', 'retencion.continuar'), { tituloCorto: 'Motivación' }),
    con(numeric('¿Cuántos días te gustaría y podrías entrenar durante la próxima fase?', { unit: 'días' }), { tituloCorto: 'Días de entreno' }),
    con(text('¿En qué aspectos crees que yo podría mejorar para darte aún mejores resultados?'), { tituloCorto: 'En qué puedo mejorar' }),
    con(text('Sugerencias'), { tituloCorto: 'Sugerencias' }),
  ],
};

// ── 9. Revisión Semana 10 (mitad de fase) ─────────────────────────────────────
// Nombre exacto de la plantilla original no visible en la captura (se abrió
// directamente sobre las preguntas) — título puesto por el contenido del
// cierre ("la semana 12 de 24... llevamos 10 semanas"). Revisar el nombre.

const REVISION_SEMANA_10: QuestionnairePresetDef = {
  title: 'Revisión Semana 10 (mitad de fase)',
  description: 'Mitad de la primera fase: me sirve para preparar tu nuevo plan de entrenamiento.',
  suggestedSchedule: { type: 'plan_week', planWeek: 10 },
  questions: [
    con(text('¿Crees que has entrenado lo suficientemente fuerte y constante durante estas primeras semanas?'), {
      bloque: 'Estas semanas', tituloCorto: 'Constancia',
      contexto: 'Este formulario es importante: me sirve para preparar el nuevo plan de entrenamiento que está por llegar. Llevamos muchas semanas mejorando con los mismos patrones de movimiento y toca subir de nivel.',
    }),
    con(text('¿Qué puntuación le darías a los resultados obtenidos durante esta primera fase del programa?'), { bloque: 'Estas semanas', tituloCorto: 'Resultados' }),
    con(scale('En cuanto al entrenamiento, ¿has tenido buenas sensaciones?', { minLabel: 'Malas', maxLabel: 'Muy buenas' }), { bloque: 'Estas semanas', tituloCorto: 'Sensaciones' }),
    con(scale('¿Qué puntuación le darías a tu motivación actual?', { minLabel: 'Ninguna', maxLabel: 'Muchísima' }), { bloque: 'Estas semanas', tituloCorto: 'Motivación' }),
    con(numeric('¿Cuántos días te gustaría y podrías entrenar durante la próxima fase?', { unit: 'días' }), { bloque: 'Próxima fase', tituloCorto: 'Días de entreno' }),
    con(text('¿En qué aspectos crees que yo podría mejorar para darte aún mejores resultados?'), { bloque: 'Próxima fase', tituloCorto: 'En qué puedo mejorar' }),
    con(text('¿Algo que quieras añadir o sugerir para preparar la planificación de la siguiente fase?'), {
      bloque: 'Próxima fase', tituloCorto: 'Sugerencias',
      helpText: 'Pronto llegamos a la semana 12 de 24. Esto solo acaba de empezar.',
    }),
  ],
};

// ── 10. Primera Semana ────────────────────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("llevas tu
// primera semana en el programa"). Revisar el nombre.

const PRIMERA_SEMANA: QuestionnairePresetDef = {
  title: 'Primera Semana',
  description: 'Primer contacto tras 7 días de plan: cómo entiendes el programa y tus primeras sensaciones.',
  suggestedSchedule: { type: 'plan_week', planWeek: 1 },
  questions: [
    con(text('¿Cómo lo estás llevando a nivel general?'), { bloque: 'General', tituloCorto: 'Cómo lo llevas', contexto: 'Ya llevas tu primera semana en el programa.' }),
    con(text('¿Has entendido e interiorizado todos los conceptos del programa?', false, 'Funcionamiento, soporte, dieta, entrenamiento, normas, metodología…'), {
      bloque: 'General', tituloCorto: 'Conceptos del programa', contexto: 'Lo más importante antes de hacerte más preguntas:',
    }),
    con(mantenerCambiar('¿Te está gustando para mantenerla o quieres introducir algún cambio?'), {
      bloque: 'Tu plan', tituloCorto: 'Rutina',
      contexto: 'Llevas 7 días entrenando y probando la nueva rutina que te he preparado. Antes de dejarla tal cual y empezar a progresar hacia el cambio físico que buscamos…',
    }),
    con(mantenerCambiar('¿Te está gustando para mantenerlo o quieres introducir algún cambio?'), {
      bloque: 'Tu plan', tituloCorto: 'Plan nutricional',
      contexto: 'Llevas 7 días siguiendo el plan nutricional. Las cantidades, los macros y la metodología los cambiaré yo cuando sea oportuno.',
    }),
    con(notaConComentario('Del 1 al 10, ¿cómo están siendo tus sensaciones con el entrenamiento?', { minLabel: 'Muy malas', maxLabel: 'Perfectas' }), { bloque: 'Sensaciones', tituloCorto: 'Entrenamiento' }),
    con(notaConComentario('Del 1 al 10, ¿cómo están siendo tus sensaciones con la nutrición?', { minLabel: 'Muy malas', maxLabel: 'Perfectas' }), { bloque: 'Sensaciones', tituloCorto: 'Nutrición' }),
    con(notaConComentario('Del 1 al 10, ¿cómo están siendo tus sensaciones con el soporte?', { minLabel: 'Muy malas', maxLabel: 'Perfectas' }), {
      bloque: 'Sensaciones', tituloCorto: 'Soporte', helpText: 'Aún no hemos pasado ninguna revisión: lo mejor del seguimiento está por llegar.',
    }),
    con(text('¿Algo que quieras comentar?'), { bloque: 'Cierre', tituloCorto: 'Comentarios' }),
  ],
};

// ── 11. Revisión Mes 1 (4 semanas) ────────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("estas 4
// semanas"). Revisar el nombre.

const REVISION_MES_1: QuestionnairePresetDef = {
  title: 'Revisión Mes 1 (4 semanas)',
  description: 'Primer mes cerrado: adherencia, obstáculos y si mantener o variar la rutina.',
  suggestedSchedule: { type: 'plan_week', planWeek: 4 },
  questions: [
    con(text('¿Qué tal llevas estas 4 semanas?'), { bloque: 'Este mes', tituloCorto: 'Cómo lo llevas' }),
    con(mantenerCambiar('¿Quieres seguir con la misma rutina para maximizar resultados o prefieres cambiar para tener más variedad?', { mantener: 'Misma rutina', cambiar: 'Cambiar de rutina' }), {
      bloque: 'Tu rutina', tituloCorto: 'Rutina',
      contexto: 'Lo más óptimo para seguir progresando es mantener la misma rutina un par de semanas más y sacarle todo el jugo a los movimientos que ya dominas. Aun así, sé que a veces se hace monótono. Respóndeme con sinceridad: cambiar da más variedad a cambio de un pequeño porcentaje de resultados a medio y largo plazo.',
    }),
    con(text('¿Principales obstáculos encontrados a lo largo de estas 4 semanas?'), { bloque: 'Este mes', tituloCorto: 'Obstáculos' }),
    con(text('¿Qué es lo que más te está costando del proceso?'), { bloque: 'Este mes', tituloCorto: 'Lo que más cuesta' }),
    con(text('¿Qué aspectos te gustaría incluir en el servicio para que sea aún mejor?'), { bloque: 'Este mes', tituloCorto: 'Mejoras del servicio' }),
    con(scaleSignal('Del 1 al 10, ¿cuánto has cumplido con el plan?', 'retencion.satisfaccion'), { bloque: 'Notas', tituloCorto: 'Cumplimiento' }),
    con(scaleSignal('Del 1 al 10, ¿cómo de motivado estás?', 'retencion.continuar'), { bloque: 'Notas', tituloCorto: 'Motivación' }),
    con(text('¿Qué objetivos tendrías a medio (6 meses) y largo plazo (12 meses)?'), {
      bloque: 'Objetivos', tituloCorto: 'Objetivos a 6 y 12 meses',
      contexto: 'Ya llevamos 4 semanas trabajando juntos y conocemos tus objetivos a corto plazo. Lo tendré en cuenta cuando toque cambiar dieta y entreno.',
    }),
    con(text('Comenta lo que quieras'), { bloque: 'Objetivos', tituloCorto: 'Comentarios' }),
  ],
};

// ── 12. Revisión Mes 2 (8 semanas) ────────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("estas 8
// semanas"). Revisar el nombre.

const REVISION_MES_2: QuestionnairePresetDef = {
  title: 'Revisión Mes 2 (8 semanas)',
  description: 'Segundo mes cerrado: de dónde partías, dónde estás y hacia dónde vamos.',
  suggestedSchedule: { type: 'plan_week', planWeek: 8 },
  questions: [
    con(text('¿Qué tal estás llevando estas 8 semanas?'), { bloque: 'Estos dos meses', tituloCorto: 'Cómo lo llevas' }),
    con(text('¿Cómo estabas antes de empezar a trabajar conmigo y cómo estás ahora?', false, 'A nivel mental y físico.'), { bloque: 'Estos dos meses', tituloCorto: 'Antes y ahora' }),
    con(text('¿Cuál ha sido tu mayor victoria y por qué?'), { bloque: 'Estos dos meses', tituloCorto: 'Mayor victoria' }),
    con(text('¿Qué cosa te ha fallado y cómo crees que podríamos solucionarlo?'), { bloque: 'Estos dos meses', tituloCorto: 'Lo que ha fallado' }),
    con(text('¿En qué sientes que podría echarte un cable extra?'), { bloque: 'Estos dos meses', tituloCorto: 'Dónde ayudarte' }),
    con(text('¿Cuáles son tus objetivos a corto, medio y largo plazo?'), { bloque: 'Objetivos', tituloCorto: 'Objetivos' }),
    con(text('¿Quieres añadir algo a esos objetivos o los mantenemos igual de momento?'), {
      bloque: 'Objetivos', tituloCorto: 'Cambios en los objetivos',
      contexto: 'Hace un mes te pregunté por tus objetivos a corto (3 meses), medio (6 meses) y largo plazo (12 meses).',
    }),
  ],
};

// ── 13. Revisión express (semanal) ────────────────────────────────────────────
// La última pregunta se cortaba en el borde de la captura — completar el
// texto con el original antes de asignarla a clientes.

const REVISION_EXPRESS: QuestionnairePresetDef = {
  title: '📝Revisión express (semanal)',
  description: 'Check semanal rápido de adherencia — versión corta de la Revisión Semanal.',
  suggestedSchedule: { type: 'interval', intervalDays: 7 },
  questions: [
    numeric('¿Cuántos pasos de media has realizado esta semana?', { unit: 'pasos' }),
    scale('¿Del 1 al 5 cuánto has cumplido con los entrenos?', { min: 1, max: 5 }),
    scale('¿Del 1 al 5 cuánto has cumplido con la nutrición?', { min: 1, max: 5 }),
    text('¿En qué crees que has podido fallar desde la última revisión?'),
    text('¿De qué estás contento de haber logrado?'),
    text('¿De qué estás frustrado de no haber logrado?'),
    text('Inserta cualquier tipo de comentario libre que te gustaría que tenga en cuenta a la hora de pasar tu revisión (rellena con un "." si no tienes nada que añadir). Y aprovecho para recordarte que me envíes vídeos de tus ejercicios: es la forma más rápida de que te corrija la técnica.'),
  ],
};

// ── 14. Revisión Quincenal Completa ───────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("últimas 2
// semanas"). La lista seguía más allá de la pregunta 11 sin verse en la
// captura — revisar si faltan preguntas al final.
//
// La primera pregunta pide la DIFERENCIA de peso frente a hace 30 días, no el
// peso absoluto — por eso es `numeric` y no `metric('bodyweight')`: ese tipo
// alimenta el histórico real de peso corporal (bodyweightLogs) y un valor
// delta ahí lo corrompería.

const REVISION_QUINCENAL: QuestionnairePresetDef = {
  title: 'Revisión Quincenal Completa',
  description: 'Revisión a fondo cada 2 semanas — peso, sensaciones, fatiga/descanso, PRs y sobrecarga progresiva.',
  suggestedSchedule: { type: 'interval', intervalDays: 14 },
  questions: [
    numeric('Diferencia de peso corporal en la báscula respecto a hace 30 días:', { unit: 'kg' }),
    text('Sensaciones y feedback DIETA: (ejemplo aleatorio: Me cuesta comer tanto, todo fenomenal, etc.)'),
    text('Sensaciones y feedback ENTRENO:'),
    scale('Sensaciones y niveles actuales de FATIGA siendo un 1 poco fatigado y un 10 muy fatigado:', { minLabel: 'Poco fatigado', maxLabel: 'Muy fatigado' }),
    scale('Sensaciones y niveles actuales de DESCANSO siendo un 1 poco descansado y un 10 muy descansado:', { minLabel: 'Poco descansado', maxLabel: 'Muy descansado' }),
    numeric('¿Cuántos PASOS de MEDIA has realizado en estas últimas 2 semanas?', { unit: 'pasos' }),
    text('LESIONES/MOLESTIAS:'),
    text('RÉCORDS de series de LEVANTAMIENTOS (ejemplo: 90kg banca a 6 repeticiones y 120kg sentadilla a 4 repeticiones)'),
    text('¿Has conseguido realizar la sobrecarga progresiva en los básicos? ¿Y en los accesorios?'),
    text('¿Qué crees que te ha estado fallando desde la última revisión para que no hayas logrado todas las expectativas que tenías pensado realizar?'),
    text('¿En qué aspecto crees que YO podría mejorar desde la última revisión que hemos tenido para que tú sigas consiguiendo tus objetivos?'),
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PAQUETE OFICIAL (27-10)
//
// Una revisión por semana, el día del coach, montada por módulos: «Tu semana»
// (con las agujetas dentro) cada semana, la quincenal cada dos, los hitos del
// cliente por semana del plan y mediciones + cierre por semana del BLOQUE (se
// recolocan solos si el bloque dura 4, 6 u 8 semanas). Todo lo que contestan
// va a un motor: ver la señal de cada pregunta.
// ═══════════════════════════════════════════════════════════════════════════

export const TITULO_TU_SEMANA = 'Tu semana';

const TU_SEMANA: QuestionnairePresetDef = {
  title: TITULO_TU_SEMANA,
  description: 'Tu revisión de cada semana: unos minutos para que pueda ajustar tu plan.',
  suggestedSchedule: { type: 'weekdays', weekdays: [5] },
  questions: [
    con(scaleSignal('¿Cuánto has cumplido con los entrenos?', 'adherencia.entrenos', { required: true, min: 1, max: 5, minLabel: 'Nada', maxLabel: 'Todo' }), {
      bloque: 'Tu semana', tituloCorto: 'Entrenos', autoRelleno: 'cumplimiento_entrenos',
    }),
    con(scaleSignal('¿Cuánto has cumplido con la nutrición?', 'adherencia.nutricion', { required: true, min: 1, max: 5, minLabel: 'Nada', maxLabel: 'Todo' }), { bloque: 'Tu semana', tituloCorto: 'Nutrición' }),
    con(numeric('Pasos de media', { unit: 'pasos' }), { bloque: 'Tu semana', tituloCorto: 'Pasos', autoRelleno: 'pasos_media', helpText: 'Si tienes el reloj conectado ya sale puesto.' }),
    con(numericSignal('Horas de sueño de media', 'wellness.sleep_hours_weekly', { unit: 'h', required: true }), { bloque: 'Tu semana', tituloCorto: 'Sueño' }),
    con(scaleSignal('¿Cuánto estrés has tenido esta semana?', 'wellness.stress_weekly', { required: true, minLabel: 'Nada', maxLabel: 'Muchísimo' }), { bloque: 'Tu semana', tituloCorto: 'Estrés' }),
    con(scaleSignal('¿Cómo de cansado sales de las sesiones?', 'wellness.fatigue_post_weekly', { minLabel: 'Fresco', maxLabel: 'Destrozado' }), { bloque: 'Tu semana', tituloCorto: 'Cansancio' }),
    con(scaleSignal('¿Cuántas ganas tienes de entrenar?', 'wellness.motivation_weekly', { minLabel: 'Ninguna', maxLabel: 'Muchísimas' }), { bloque: 'Tu semana', tituloCorto: 'Ganas' }),
    ...ZONAS_IEM.map(z => con(
      scaleSignal(z.nombre, `agujetas.${z.clave}` as AgujetasSignalKey, { required: false, min: 1, max: 5, minLabel: 'Apenas noté trabajo', maxLabel: 'Duele en reposo' }),
      { bloque: 'Agujetas', tituloCorto: z.nombre },
    )),
    con(text('¿De qué estás orgulloso esta semana?', false, 'Verte mejor, sentirte más fuerte, subir peso…'), { bloque: 'Cierre', tituloCorto: 'Logro de la semana' }),
    con(media('Corrección de técnica en vídeo', false, 'video'), { bloque: 'Cierre', tituloCorto: 'Vídeo de técnica', helpText: 'Grábate sin que te lo tenga que pedir.' }),
  ],
};

const QUINCENAL: QuestionnairePresetDef = {
  title: 'Quincenal',
  description: 'Cada dos semanas: molestias, récords y si estás consiguiendo progresar.',
  suggestedSchedule: { type: 'interval', intervalDays: 14 },
  questions: [
    // La molestia avisa al coach en el momento (utils/alertasRevision.ts).
    con({ ...boolQ('¿Tienes alguna lesión o molestia?'), signalKey: 'alerta.molestia' }, { bloque: 'Quincenal', tituloCorto: 'Molestias', conComentario: true }),
    con(text('Récords de estas dos semanas', false, 'Ejercicio, kilos y repeticiones. Ej.: banca 90 kg × 6.'), { bloque: 'Quincenal', tituloCorto: 'Récords' }),
    con(choice('¿Has conseguido la sobrecarga progresiva en los básicos?', ['Sí', 'A medias', 'No']), { bloque: 'Quincenal', tituloCorto: 'Sobrecarga en básicos' }),
    con(choice('¿Y en los accesorios?', ['Sí', 'A medias', 'No']), { bloque: 'Quincenal', tituloCorto: 'Sobrecarga en accesorios' }),
    con(text('¿Qué crees que te ha fallado desde la última revisión?'), { bloque: 'Quincenal', tituloCorto: 'Lo que ha fallado' }),
    con(text('¿En qué podría mejorar yo para que sigas consiguiendo tus objetivos?'), { bloque: 'Quincenal', tituloCorto: 'En qué puedo mejorar' }),
  ],
};

const CIERRE_BLOQUE: QuestionnairePresetDef = {
  title: 'Cierre de bloque',
  description: 'Última semana del bloque: lo que mantener, lo que cambiar y cómo ha respondido tu cuerpo.',
  suggestedSchedule: { type: 'mesocycle_week', semanaDelBloque: 'ultima' },
  questions: [
    con(scaleSignal('¿Cómo valorarías este bloque de entrenamiento?', 'meso_end.rating', { required: true, minLabel: 'Muy mal', maxLabel: 'Perfecto' }), { bloque: 'El bloque', tituloCorto: 'Valoración' }),
    con(scaleSignal('¿Cómo de bien te has recuperado entre sesiones?', 'meso_end.recovery', { minLabel: 'Fatal', maxLabel: 'Perfecto' }), { bloque: 'El bloque', tituloCorto: 'Recuperación' }),
    con(scaleSignal('¿Cómo de exigentes te han parecido las series?', 'meso_end.effort', { minLabel: 'Me sobraba', maxLabel: 'Al límite' }), { bloque: 'El bloque', tituloCorto: 'Exigencia' }),
    con(choice('¿Cómo te ha resultado la duración de las sesiones?', ['Corta', 'Bien', 'Demasiado larga']), { bloque: 'El bloque', tituloCorto: 'Duración de la sesión' }),
    con(choiceGroups('¿Qué grupos quieres priorizar en el siguiente bloque?', 'meso_end.priority_groups', 'Toca las zonas en el dibujo.'), { bloque: 'Siguiente bloque', tituloCorto: 'Grupos a priorizar', presentacion: 'mapa' }),
    con(choiceGroups('¿En qué grupos sentiste que el volumen fue demasiado?', 'meso_end.overload_groups', 'Puedes marcar varios, o ninguno.'), { bloque: 'Siguiente bloque', tituloCorto: 'Demasiado volumen', presentacion: 'mapa' }),
    con(text('¿Qué ejercicios quieres mantener sí o sí, y qué te apetece probar o cambiar?'), { bloque: 'Siguiente bloque', tituloCorto: 'Mantener y probar' }),
    con(text('¿Tienes algún objetivo concreto para el próximo bloque?', false, 'Más fuerza, más masa en una zona, mejor condición física…'), { bloque: 'Siguiente bloque', tituloCorto: 'Objetivo' }),
    con(text('¿Hay alguna molestia articular o muscular que tengamos que tener en cuenta?'), { bloque: 'Siguiente bloque', tituloCorto: 'Molestias' }),
  ],
};

const MEDICIONES_BLOQUE: QuestionnairePresetDef = {
  title: 'Mediciones del bloque',
  description: 'Perímetros al cerrar cada bloque. Sigue el orden del vídeo del protocolo: https://www.youtube.com/watch?v=cCQ8SPp9jdc',
  suggestedSchedule: { type: 'mesocycle_week', semanaDelBloque: 'ultima' },
  questions: [
    con(metric('Contorno de pecho', 'pecho'), { bloque: 'Mediciones', tituloCorto: 'Pecho' }),
    con(metric('Perímetro de cintura', 'cintura'), { bloque: 'Mediciones', tituloCorto: 'Cintura' }),
    con(metric('Perímetro de abdomen', 'abdomen'), { bloque: 'Mediciones', tituloCorto: 'Abdomen' }),
    con(metric('Perímetro de cadera', 'cadera'), { bloque: 'Mediciones', tituloCorto: 'Cadera' }),
    con(metric('Bíceps derecho relajado', 'biceps_der_relajado'), { bloque: 'Mediciones', tituloCorto: 'Bíceps relajado' }),
    con(metric('Bíceps derecho contraído', 'biceps_der_contraido'), { bloque: 'Mediciones', tituloCorto: 'Bíceps contraído' }),
    con(metric('Muslo derecho relajado', 'muslo_der_relajado'), { bloque: 'Mediciones', tituloCorto: 'Muslo relajado' }),
    con(metric('Muslo derecho contraído', 'muslo_der_contraido'), { bloque: 'Mediciones', tituloCorto: 'Muslo contraído' }),
  ],
};

/** El paquete oficial: qué plantilla y con qué calendario. Mediciones va dos
 *  veces: al cerrar cada bloque y, en bloques de 8 semanas o más, también a
 *  mitad. */
export const PAQUETE_OFICIAL: { nombre: string; items: { titulo: string; schedule: QSchedule }[] } = {
  nombre: 'Paquete oficial',
  items: [
    { titulo: TITULO_TU_SEMANA, schedule: { type: 'weekdays', weekdays: [5] } },
    { titulo: 'Quincenal', schedule: { type: 'interval', intervalDays: 14 } },
    { titulo: 'Primera Semana', schedule: { type: 'plan_week', planWeek: 1 } },
    { titulo: 'Revisión Semana 3', schedule: { type: 'plan_week', planWeek: 3 } },
    { titulo: 'Revisión Mes 1 (4 semanas)', schedule: { type: 'plan_week', planWeek: 4 } },
    { titulo: 'Revisión Mes 2 (8 semanas)', schedule: { type: 'plan_week', planWeek: 8 } },
    { titulo: 'Revisión Semana 10 (mitad de fase)', schedule: { type: 'plan_week', planWeek: 10 } },
    { titulo: 'Mediciones del bloque', schedule: { type: 'mesocycle_week', semanaDelBloque: 'ultima' } },
    { titulo: 'Mediciones del bloque', schedule: { type: 'mesocycle_week', semanaDelBloque: 'mitad', minSemanasBloque: 8 } },
    { titulo: 'Cierre de bloque', schedule: { type: 'mesocycle_week', semanaDelBloque: 'ultima' } },
  ],
};

export const QUESTIONNAIRE_PRESETS: QuestionnairePresetDef[] = [
  ENTRENAMIENTO,
  EVALUACION_DOLOR,
  DOMS,
  MEDICIONES,
  REVISION_SEMANA_3,
  REVISION_SEMANAL,
  FINAL_MESOCICLO,
  CHECK_MES_5,
  REVISION_SEMANA_10,
  PRIMERA_SEMANA,
  REVISION_MES_1,
  REVISION_MES_2,
  REVISION_EXPRESS,
  REVISION_QUINCENAL,
  TU_SEMANA,
  QUINCENAL,
  CIERRE_BLOQUE,
  MEDICIONES_BLOQUE,
];

/** Preset por título exacto. */
export function presetPorTitulo(title: string): QuestionnairePresetDef | undefined {
  return QUESTIONNAIRE_PRESETS.find(p => p.title === title);
}

export function suggestedScheduleForTitle(title: string): QSchedule | undefined {
  return QUESTIONNAIRE_PRESETS.find(p => p.title === title)?.suggestedSchedule;
}

function uid(prefix: string, idx: number): string {
  return `${prefix}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
}

// Instancia el preset como un Questionnaire listo para createQuestionnaire():
// asigna un id único a cada pregunta (formato consistente con newQuestion()
// en QuestionnaireEditor.tsx).
export function buildQuestionnaireFromPreset(def: QuestionnairePresetDef, ownerId: string): Omit<Questionnaire, 'id'> {
  return {
    ownerId,
    title: def.title,
    description: def.description,
    questions: def.questions.map((q, idx) => ({ ...q, id: uid('q', idx) })),
  };
}
