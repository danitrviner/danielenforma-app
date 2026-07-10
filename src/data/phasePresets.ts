// Preset "Plan estándar" — el patrón de asesoramiento habitual del coach:
// adaptación → pérdida de grasa acelerada → recomposición → ganancia muscular
// → mini-cut → ganancia muscular II. El coach lo carga con un click en
// PlanPhaseEditor y lo edita a medida; las semanas/dirección/ritmo alimentan
// el generador de periodización nutricional (planNutritionBridge.ts).

import { PlanPhase, PhaseMetricTarget, WeightDirection } from '../types';

export interface PhasePresetDef {
  name: string;
  motto: string;
  description: string;
  icon: string;
  color: string;
  suggestedWeeks: number;
  weightDirection: WeightDirection;
  weightRateKgWeek: number; // magnitud
  metrics: Omit<PhaseMetricTarget, 'id'>[];
  exitCriteria: string;
}

export const STANDARD_PLAN_PRESET: PhasePresetDef[] = [
  {
    name: 'Adaptación y cambio de hábitos',
    motto: 'Primero la salud. Después, todo lo demás.',
    description: 'Un mes para construir la base: rutina de entrenos, registro diario y hábitos que ganan salud. Sin prisas — esto es lo que sostiene todo lo que viene.',
    icon: 'foundation',
    color: '#00eefc',
    suggestedWeeks: 4,
    weightDirection: 'deficit',
    weightRateKgWeek: 0.25,
    metrics: [
      { kind: 'pasos_media', label: 'Media de 8.000 pasos al día', targetValue: 8000, unit: 'pasos' },
      { kind: 'adherencia', label: 'Adherencia a la dieta del 80%', targetValue: 80, unit: '%' },
      { kind: 'manual', label: '3 entrenos por semana durante todo el mes' },
    ],
    exitCriteria: 'Un mes entero registrando pasos, comidas y peso sin fallar, con la rutina de entrenos consolidada.',
  },
  {
    name: 'Pérdida de grasa acelerada',
    motto: 'La grasa que sobra se queda atrás. De invisible a visible.',
    description: 'La fase más larga: déficit sostenido, pasos altos y disciplina. Aquí es donde el espejo empieza a devolver otra imagen.',
    icon: 'local_fire_department',
    color: '#fbcb1a',
    suggestedWeeks: 12,
    weightDirection: 'deficit',
    weightRateKgWeek: 0.7,
    metrics: [
      { kind: 'peso_perdido', label: 'Perder 8 kg', targetValue: 8, unit: 'kg' },
      { kind: 'pasos_media', label: 'Media de 10.000 pasos al día', targetValue: 10000, unit: 'pasos' },
      { kind: 'adherencia', label: 'Adherencia a la dieta del 85%', targetValue: 85, unit: '%' },
    ],
    exitCriteria: 'Perder ~8 kg conservando la fuerza en los básicos.',
  },
  {
    name: 'Recomposición corporal',
    motto: 'Mismo peso, otro cuerpo.',
    description: 'El peso se estabiliza pero el cuerpo sigue cambiando: menos grasa, más músculo, cargas subiendo semana a semana.',
    icon: 'balance',
    color: '#a78bfa',
    suggestedWeeks: 8,
    weightDirection: 'mantenimiento',
    weightRateKgWeek: 0,
    metrics: [
      { kind: 'sentadilla_xbw', label: 'Sentadilla a 1x tu peso corporal', targetValue: 1, unit: 'xBW' },
      { kind: 'adherencia', label: 'Adherencia a la dieta del 85%', targetValue: 85, unit: '%' },
      { kind: 'manual', label: 'Cintura estable o bajando con el peso estable' },
    ],
    exitCriteria: 'Peso estable ±1 kg con cargas subiendo en todos los básicos.',
  },
  {
    name: 'Ganancia de masa muscular',
    motto: 'Construye el motor.',
    description: 'Superávit controlado y entreno duro: es el momento de ganar músculo de verdad, con la grasa a raya.',
    icon: 'fitness_center',
    color: '#ff8c69',
    suggestedWeeks: 10,
    weightDirection: 'superavit',
    weightRateKgWeek: 0.25,
    metrics: [
      { kind: 'sentadilla_xbw', label: 'Sentadilla a 1.25x tu peso corporal', targetValue: 1.25, unit: 'xBW' },
      { kind: 'pasos_media', label: 'Media de 8.000 pasos al día', targetValue: 8000, unit: 'pasos' },
      { kind: 'manual', label: 'Subir cargas en todos los básicos' },
    ],
    exitCriteria: 'Ganar 2-3 kg limpios con la sentadilla en 1.25x tu peso corporal.',
  },
  {
    name: 'Mini-cut',
    motto: 'Afila el filo: fuera lo que tapa el trabajo.',
    description: 'Cuatro semanas quirúrgicas de déficit agresivo para quitar la grasa acumulada en la etapa de construcción, sin tocar el músculo.',
    icon: 'content_cut',
    color: '#00eefc',
    suggestedWeeks: 4,
    weightDirection: 'deficit',
    weightRateKgWeek: 0.8,
    metrics: [
      { kind: 'adherencia', label: 'Adherencia a la dieta del 90%', targetValue: 90, unit: '%' },
      { kind: 'pasos_media', label: 'Media de 10.000 pasos al día', targetValue: 10000, unit: 'pasos' },
      { kind: 'manual', label: 'Recuperar la definición del final de la recomposición' },
    ],
    exitCriteria: 'Cuatro semanas quirúrgicas: fuera la grasa acumulada, intacto el músculo.',
  },
  {
    name: 'Ganancia muscular II',
    motto: 'Imparable: más fuerte que nunca.',
    description: 'El cierre del ciclo: otro bloque de construcción partiendo de la mejor versión hasta ahora. Récords en los básicos y el mejor físico de tu vida.',
    icon: 'rocket_launch',
    color: '#fbcb1a',
    suggestedWeeks: 12,
    weightDirection: 'superavit',
    weightRateKgWeek: 0.25,
    metrics: [
      { kind: 'sentadilla_xbw', label: 'Sentadilla a 1.5x tu peso corporal', targetValue: 1.5, unit: 'xBW' },
      { kind: 'pasos_media', label: 'Media de 8.000 pasos al día', targetValue: 8000, unit: 'pasos' },
      { kind: 'manual', label: 'Récord personal en press banca y peso muerto' },
    ],
    exitCriteria: 'Cerrar el ciclo con récords en todos los básicos y el mejor físico de tu vida.',
  },
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Instancia el preset como PlanPhases listas para guardar: la primera fase
// queda activa desde hoy, el resto futuras.
export function buildPhasesFromPreset(today: string): PlanPhase[] {
  return STANDARD_PLAN_PRESET.map((def, idx) => ({
    id: uid('phase'),
    order: idx,
    name: def.name,
    motto: def.motto,
    description: def.description,
    color: def.color,
    icon: def.icon,
    status: idx === 0 ? 'actual' : 'futura',
    startedAt: idx === 0 ? today : undefined,
    metrics: def.metrics.map(m => ({ ...m, id: uid('m') })),
    exitCriteria: def.exitCriteria,
    suggestedWeeks: def.suggestedWeeks,
    weightDirection: def.weightDirection,
    weightRateKgWeek: def.weightRateKgWeek,
  }));
}
