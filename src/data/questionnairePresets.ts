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

import { QuestionnaireQuestion, QSchedule, BodyMetricKey, Questionnaire, MuscleGroup } from '../types';
import { OPCIONES_GRUPOS, VolumeSignalKey, SignalKey } from './questionnaireSignals';

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

const DOMS: QuestionnairePresetDef = {
  title: "DOM's o \"agujetas\"",
  description: 'Escala de 0 (nada) a 10 (muchísimo) por grupo muscular.',
  suggestedSchedule: { type: 'interval', intervalDays: 14 },
  questions: DOMS_ZONES.map(({ zona, group }) => scaleSignal(zona, `doms.${group}` as VolumeSignalKey, { required: true, min: 0, max: 10, minLabel: 'Nada', maxLabel: 'Muchísimo' })),
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
    metric('Pliegue subglúteo derecho (mm)', 'pliegue_subgluteo_der'),
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
  description: 'Pulso de satisfacción y riesgo de abandono a las 3 semanas de empezar el plan.',
  suggestedSchedule: { type: 'plan_week', planWeek: 3 },
  questions: [
    scale('¿Cómo calificarías tu satisfacción general con el programa hasta ahora?', { required: true }),
    text('¿Qué aspectos te han gustado más estas tres semanas y por qué?', true),
    text('¿Qué partes del entrenamiento o de la nutrición no te están gustando o se te hacen difíciles de seguir?', true),
    text('¿Te has encontrado con obstáculos que te impidan cumplir el plan (horarios, lesiones, falta de motivación, logística)?', true),
    scale('¿En qué medida sientes que recibes el apoyo que necesitas por mi parte?', { required: true }),
    scale('¿Qué probabilidad hay de que continúes con el programa después de esta semana?', { required: true }),
    text('¿Hay algún otro comentario, sugerencia o preocupación que quieras compartir?'),
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
    scale('En cuánto al entrenamiento... ¿Has tenido buenas sensaciones? (del 1 al 10)'),
    scale('¿Qué puntuación le darías a la motivación actual? (del 1 al 10)'),
    numeric('¿Cuántos días te gustaría y podrías entrenar durante la próxima fase de la rutina de entrenamiento?', { unit: 'días' }),
    text('¿En qué aspectos crees que YO podría mejorar para darte aún mejores resultados?'),
    text('SUGERENCIAS aquí:'),
  ],
};

// ── 9. Revisión Semana 10 (mitad de fase) ─────────────────────────────────────
// Nombre exacto de la plantilla original no visible en la captura (se abrió
// directamente sobre las preguntas) — título puesto por el contenido del
// cierre ("la semana 12 de 24... llevamos 10 semanas"). Revisar el nombre.

const REVISION_SEMANA_10: QuestionnairePresetDef = {
  title: 'Revisión Semana 10 (mitad de fase)',
  description: 'Check de mitad de la primera fase (semana 10 de 24) antes de preparar el siguiente bloque.',
  suggestedSchedule: { type: 'plan_week', planWeek: 10 },
  questions: [
    text('Este FORMULARIO es IMPORTANTE porque me servirá muchísimo para poder ir preparándote el NUEVO PLAN de ENTRENAMIENTO que está por caer... Ahora llevamos muchas semanas adaptándonos y mejorando semana tras semana con el mismo patrón de movimiento, es hora de ir al siguiente nivel para seguir avanzando.'),
    text('¿Crees que has entrenado lo suficientemente fuerte y constante durante estas primeras semanas de tu plan de entrenamiento?'),
    text('¿Qué puntuación le darías a los resultados obtenidos durante esta primera fase del programa?'),
    scale('En cuánto al entrenamiento... ¿Has tenido buenas sensaciones? (del 1 al 10)'),
    scale('¿Qué puntuación le darías a la motivación actual? (del 1 al 10)'),
    numeric('¿Cuántos días te gustaría y podrías entrenar durante la próxima fase de la rutina de entrenamiento?', { unit: 'días' }),
    text('¿En qué aspectos crees que YO podría mejorar para darte aún mejores resultados?'),
    text('¿Algo que quieras añadir o sugerencia de cara a ir preparando la nueva planificación de la siguiente fase del programa?'),
    text('🚀Pronto empezamos la mitad de la 1a parte del programa, es decir, la semana 12 de 24... Ahora llevamos 10 semanas, así que a por ello tío, esto solo acaba de empezar y no te imaginas cómo estaremos en 3, 6 y 12 meses vista!'),
  ],
};

// ── 10. Primera Semana ────────────────────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("llevas tu
// primera semana en el programa"). Revisar el nombre.

const PRIMERA_SEMANA: QuestionnairePresetDef = {
  title: 'Primera Semana',
  description: 'Primer contacto tras 7 días de plan — entendimiento del programa y primeras sensaciones.',
  suggestedSchedule: { type: 'plan_week', planWeek: 1 },
  questions: [
    text('Ahora que llevas tu primera semana en el programa... ¿Cómo lo estás llevando a nivel general?'),
    text('Lo más importante antes de hacerte más preguntas... ¿Has entendido e interiorizado todos los conceptos del programa (funcionamiento, soporte, dieta, entrenamiento, normas a cumplir, metodología, etc.)?'),
    text('⚠️Llevas 7 días ENTRENANDO y probando la nueva rutina que te he preparado... ¿Te está gustando para mantenértelo o quieres introducir algún cambio antes de dejarla tal cuál está y empezar a progresar y ver ese cambio físico que estamos buscando?'),
    text('⚠️Llevas 7 días SIGUIENDO EL PLAN NUTRICIONAL... ¿Te está gustando para mantenértelo o quieres introducir algún cambio antes de dejarla tal cuál está hasta que yo decida que sea oportuno cambiar las cantidades, macronutrientes y/o la metodología de la dieta?'),
    text('¿Del 1 al 10 cómo están siendo tus sensaciones en cuánto al ENTRENAMIENTO se refiere? ¿Algo que quieras comentar?'),
    text('¿Del 1 al 10 cómo están siendo tus sensaciones en cuánto a la NUTRICIÓN se refiere? ¿Algo que quieras comentar?'),
    text('¿Del 1 al 10 cómo están siendo tus sensaciones en cuánto al SOPORTE se refiere? ¿Algo que quieras comentar? Ten en cuenta que todavía no hemos pasado ninguna revisión, eso es lo mejor del seguimiento que aún está por llegar'),
    text('¿Algo que quieras comentar? ;)'),
  ],
};

// ── 11. Revisión Mes 1 (4 semanas) ────────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("estas 4
// semanas"). Revisar el nombre.

const REVISION_MES_1: QuestionnairePresetDef = {
  title: 'Revisión Mes 1 (4 semanas)',
  description: 'Primer mes cerrado — adherencia, obstáculos y si mantener o variar la rutina.',
  suggestedSchedule: { type: 'plan_week', planWeek: 4 },
  questions: [
    text('¿Qué tal llevas estas 4 semanas?'),
    text('⚠️Te cuento en cuánto al ENTRENAMIENTO: Lo más óptimo para seguir progresando es seguir con la misma rutina de entrenamiento un par de semanas más porque así consigues sacarle el jugo a los patrones de movimiento que has interiorizado estas 4 semanas... SIN EMBARGO... Somos conscientes de que a veces os puede resultar aburrido o monótono hacer siempre lo mismo, o incluso a veces nos comentáis que preferís tener un cambio ya que estáis pagando dinero (cosa que no tiene sentido)... ENTONCES MI PREGUNTA ES (respóndeme con sinceridad que tenemos confianza)... ¿Quieres seguir con la misma rutina para maximizar los resultados o prefieres cambiar de rutina para tener más variedad y diversión sacrificando un pequeño % de resultados a medio / largo plazo?'),
    text('¿Principales obstáculos encontrados a lo largo de estas 4 semanas trabajando juntos?'),
    text('¿Qué es lo que más te está costando del proceso?'),
    text('¿Qué aspectos te gustaría incluir al servicio para que sea aún mejor?'),
    scale('¿Del 1 al 10 cuánto has cumplido con el plan?'),
    scale('¿Del 1 al 10 cómo de motivado estás?'),
    text('Ahora que ya llevas 4 semanas progresando y trabajando juntos y conocemos tus objetivos a corto plazo... ¿Qué objetivos tendrías a medio (6 meses) y largo plazo (12 meses)? Para tenerlo en cuenta a la hora de cambiarte la dieta y el entreno cuándo sea necesario ;)'),
    text('Comenta lo que quieras:'),
  ],
};

// ── 12. Revisión Mes 2 (8 semanas) ────────────────────────────────────────────
// Nombre exacto no visible en la captura — puesto por contenido ("estas 8
// semanas"). Revisar el nombre.

const REVISION_MES_2: QuestionnairePresetDef = {
  title: 'Revisión Mes 2 (8 semanas)',
  description: 'Segundo mes cerrado — comparación con el punto de partida y objetivos a medio/largo plazo.',
  suggestedSchedule: { type: 'plan_week', planWeek: 8 },
  questions: [
    text('¿Qué tal estás llevando estas 8 semanas?'),
    text('¿Cómo estabas antes de empezar a trabajar conmigo y cómo estás ahora (a nivel mental y físico)?'),
    text('¿Cuáles son tus objetivos a corto medio y largo plazo?'),
    text('¿Cuál ha sido tu mayor victoria y porqué?'),
    text('¿Qué cosa te ha fallado y cómo crees que podríamos solucionarlo?'),
    text('¿En qué sientes que podría echarte un cable extra?'),
    text('Hace 1 mes te pregunté por tus objetivos a corto (3 meses), medio (6 meses) y largo plazo (12 meses)... ¿Quieres añadir algo más a esos objetivos o los mantenemos igual de momento?'),
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
    text('Inserta cualquier tipo de comentario libre que te gustaría que tenga en cuenta a la hora de pasar tu revisión (rellenar con un "." si no tienes nada que añadir)... [TEXTO CORTADO EN LA CAPTURA — completar: seguía "Por cierto aprovecho para recordarte que me envíes vídeos..."]'),
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
];

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
