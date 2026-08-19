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

import { QuestionnaireQuestion, QSchedule, BodyMetricKey, Questionnaire } from '../types';

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
    numeric('Altura en CM'),
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

const DOMS_ZONES = [
  'CUÁDRICEPS', 'ISQUIOTIBIALES', 'GLÚTEOS', 'ADUCTORES', 'LUMBARES', 'GEMELOS',
  'OBLICUOS', 'ABDOMEN', 'PECTORAL', 'TRAPECIO', 'DORSAL', 'TRÍCEPS', 'BÍCEPS', 'HOMBRO',
];

const DOMS: QuestionnairePresetDef = {
  title: "DOM's o \"agujetas\"",
  description: 'Escala de 0 (nada) a 10 (muchísimo) por grupo muscular.',
  suggestedSchedule: { type: 'interval', intervalDays: 14 },
  questions: DOMS_ZONES.map(zone => scale(zone, { required: true, min: 0, max: 10, minLabel: 'Nada', maxLabel: 'Muchísimo' })),
};

// ── 4. Mediciones ──────────────────────────────────────────────────────────────

const MEDICIONES: QuestionnairePresetDef = {
  title: 'Mediciones',
  description: 'Perímetros corporales — alimentan la ficha de mediciones y las correlaciones.',
  suggestedSchedule: { type: 'monthly', dayOfMonth: 26 },
  questions: [
    metric('Contorno de pecho (cm)', 'pecho'),
    metric('Bíceps izquierdo contraído (cm)', 'biceps_izq'),
    metric('Muslo izquierdo contraido (cm)', 'muslo_izq'),
    metric('Bíceps derecho contraído (cm)', 'biceps_der'),
    metric('Muslo derecho contraído (cm)', 'muslo_der'),
    metric('Perímetro de abdomen (cm)', 'abdomen'),
    metric('Perimetro de cintura (cm)', 'cintura'),
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
    scale('¿Cómo valorarías en general este bloque de entrenamiento del 1 al 10?'),
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

export const QUESTIONNAIRE_PRESETS: QuestionnairePresetDef[] = [
  ENTRENAMIENTO,
  EVALUACION_DOLOR,
  DOMS,
  MEDICIONES,
  REVISION_SEMANA_3,
  REVISION_SEMANAL,
  FINAL_MESOCICLO,
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
