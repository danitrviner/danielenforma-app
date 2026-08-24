import {
  Exercise, Mesocycle, MuscleGroup, Questionnaire, QuestionnaireResponse, WorkoutAssignment, WorkoutLog,
} from '../types';
import { buildTrainingReport } from './trainingReport';
import { computeAverageRir } from './rirStats';
import { adherenciaDeMesociclo } from './adherence';
import { grupoDesdeEtiqueta, esSeñalDoms } from '../data/questionnaireSignals';

// ═══════════════════════════════════════════════════════════════════════════
// HISTORIAL DE VOLUMEN — lo que pasó en el bloque anterior, en la forma exacta
// que el sugeridor (utils/volumeSuggestion.ts) necesita para decidir.
//
// No calcula nada nuevo: compone piezas que ya existían y que hasta ahora se
// calculaban y se tiraban (las series realizadas por grupo de trainingReport,
// la adherencia por mesociclo que vivía suelta dentro de MesocycleDashboard).
//
// Todo es tolerante a la ausencia: un cliente nuevo devuelve un historial
// vacío y el motor cae a reglas puras, que es el comportamiento correcto, no
// un caso de error.
// ═══════════════════════════════════════════════════════════════════════════

export interface GroupHistory {
  /** Series SEMANALES programadas para el grupo en el bloque anterior. */
  planned: number;
  /** Series SEMANALES realmente registradas (total del bloque ÷ sus semanas). */
  performed: number;
  deltaPct: number;
}

export interface MesoEndFeedback {
  rating?: number;
  recovery?: number;
  effort?: number;
  priorityGroups: MuscleGroup[];
  overloadGroups: MuscleGroup[];
  doms: Partial<Record<MuscleGroup, number>>;
}

export interface VolumeHistory {
  previous?: Mesocycle;
  adherencePct: number | null;
  meanRir: number | null;
  groups: Partial<Record<MuscleGroup, GroupHistory>>;
  feedback?: MesoEndFeedback;
}

export const HISTORIAL_VACIO: VolumeHistory = {
  adherencePct: null, meanRir: null, groups: {},
};

/** Separa por comas la respuesta de una pregunta multi-opción y traduce a grupos. */
function gruposDeRespuesta(valor: string | number | boolean | undefined): MuscleGroup[] {
  if (typeof valor !== 'string') return [];
  return valor.split(',')
    .map(v => grupoDesdeEtiqueta(v))
    .filter((g): g is MuscleGroup => g !== null);
}

/**
 * Lee el feedback del atleta de la ÚLTIMA respuesta enviada de cada
 * cuestionario que lleve señales. Se recorren todas las respuestas de más
 * reciente a más antigua y la primera que aporte cada señal gana — así el
 * cierre de mesociclo y el cuestionario de DOM's, que son dos cuestionarios
 * distintos, se combinan sin pisarse.
 */
export function leerFeedback(
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): MesoEndFeedback | undefined {
  const señalPorPregunta = new Map<string, string>();
  for (const q of questionnaires) {
    for (const pregunta of q.questions) {
      if (pregunta.signalKey) señalPorPregunta.set(pregunta.id, pregunta.signalKey);
    }
  }
  if (señalPorPregunta.size === 0) return undefined;

  const fb: MesoEndFeedback = { priorityGroups: [], overloadGroups: [], doms: {} };
  let encontradoAlgo = false;
  const vistas = new Set<string>();

  const ordenadas = [...responses].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  for (const r of ordenadas) {
    for (const a of r.answers) {
      const señal = señalPorPregunta.get(a.questionId);
      if (!señal) continue;

      const grupoDoms = esSeñalDoms(señal);
      if (grupoDoms) {
        // Dos zonas distintas pueden apuntar al mismo grupo (OBLICUOS y
        // ABDOMEN → core): manda la peor de las dos, que es la que condiciona
        // si se puede subir volumen ahí.
        const n = Number(a.value);
        if (!Number.isNaN(n)) {
          fb.doms[grupoDoms] = Math.max(fb.doms[grupoDoms] ?? 0, n);
          encontradoAlgo = true;
        }
        continue;
      }

      if (vistas.has(señal)) continue; // ya la tenemos de una respuesta más reciente
      vistas.add(señal);
      encontradoAlgo = true;

      switch (señal) {
        case 'meso_end.rating':   fb.rating   = Number(a.value); break;
        case 'meso_end.recovery': fb.recovery = Number(a.value); break;
        case 'meso_end.effort':   fb.effort   = Number(a.value); break;
        case 'meso_end.priority_groups': fb.priorityGroups = gruposDeRespuesta(a.value); break;
        case 'meso_end.overload_groups': fb.overloadGroups = gruposDeRespuesta(a.value); break;
        default: break;
      }
    }
  }

  return encontradoAlgo ? fb : undefined;
}

/** Composición pura — todo lo que se lee de red entra ya resuelto por parámetros. */
export function buildVolumeHistoryFrom(params: {
  mesocycles: Mesocycle[];
  currentId: string;
  logs: WorkoutLog[];
  exercises: Exercise[];
  assignments: WorkoutAssignment[];
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
}): VolumeHistory {
  const { mesocycles, currentId, logs, exercises, assignments } = params;
  const actual = mesocycles.find(m => m.id === currentId);
  const previous = [...mesocycles]
    .filter(m => m.id !== currentId && (actual ? m.number < actual.number : true))
    .sort((a, b) => b.number - a.number)[0];

  const feedback = leerFeedback(params.responses ?? [], params.questionnaires ?? []);
  if (!previous) return { ...HISTORIAL_VACIO, feedback };

  const informe = buildTrainingReport({
    logs, exercises, mesocycles,
    periodStart: previous.startDate, periodEnd: previous.startDate,
    comparison: { mode: 'mesocycle', currentId: previous.id, previousId: null },
  });

  // El informe da series del BLOQUE entero; `MuscleGroupConfig.series` es
  // semanal. Sin esta división se compararían peras con manzanas y el motor
  // creería que el atleta hizo cuatro veces el volumen que le tocaba.
  //
  // Ojo con la unidad: `MuscleGroupPerf.sets` son series efectivas PONDERADAS
  // (el grupo principal del ejercicio cuenta 1 y cada secundario 0,5), así que
  // `performed` recoge también el estímulo indirecto — un fondo programado como
  // tríceps suma medio set a pecho. Es lo que interesa para decidir el volumen
  // del bloque siguiente. El panel de «Cierre» (utils/cierreMesociclo.ts) cuenta
  // solo el grupo principal a propósito, porque allí la pregunta es otra: si se
  // ejecutó lo que se programó, medido en la misma unidad en que se programó.
  const semanas = Math.max(1, previous.weeks);
  const groups: Partial<Record<MuscleGroup, GroupHistory>> = {};
  for (const g of informe.muscleGroups) {
    if (g.group === 'none') continue;
    const grupo = g.group as MuscleGroup;
    const planned = previous.groups[grupo]?.series ?? 0;
    const performed = Math.round(g.sets / semanas);
    groups[grupo] = {
      planned, performed,
      deltaPct: planned > 0 ? Math.round(((performed - planned) / planned) * 100) : 0,
    };
  }
  // Los grupos que se programaron pero de los que no hay ni una serie
  // registrada no salen del informe — y son justo los que más importa ver.
  for (const grupo of Object.keys(previous.groups) as MuscleGroup[]) {
    const planned = previous.groups[grupo]?.series ?? 0;
    if (planned > 0 && !groups[grupo]) groups[grupo] = { planned, performed: 0, deltaPct: -100 };
  }

  return {
    previous,
    adherencePct: adherenciaDeMesociclo(assignments, previous.id),
    meanRir: computeAverageRir(logs),
    groups,
    feedback,
  };
}
