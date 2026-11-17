import {
  Exercise, Mesocycle, MuscleGroup, Questionnaire, QuestionnaireResponse, WorkoutAssignment, WorkoutLog,
} from '../types.js';
import { adherenciaDeMesociclo } from './adherence.js';
import { grupoDesdeEtiqueta, esSeñalDoms } from '../data/questionnaireSignals.js';
import { seriesRealizadasPorGrupo } from './programacion.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';
import { mesocycleWeekNumber } from './progression.js';
import { ZONA_POR_CLAVE, esZonaIem } from './cdg/zonas.js';

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
  /** Series SEMANALES realmente registradas, de media en las semanas de
   *  TRABAJO del bloque (las de descarga no cuentan: ver `semanasContadas`). */
  performed: number;
  deltaPct: number;
}

export interface MesoEndFeedback {
  rating?: number;
  recovery?: number;
  effort?: number;
  priorityGroups: MuscleGroup[];
  overloadGroups: MuscleGroup[];
  /** Agujetas por grupo en escala 0-10: la última lectura de cada grupo dentro
   *  del bloque anterior. Las del módulo oficial (1-5 por zona) vienen ya
   *  convertidas. */
  doms: Partial<Record<MuscleGroup, number>>;
}

export interface VolumeHistory {
  previous?: Mesocycle;
  adherencePct: number | null;
  /** RIR medio de las series registradas en el bloque anterior. */
  meanRir: number | null;
  groups: Partial<Record<MuscleGroup, GroupHistory>>;
  feedback?: MesoEndFeedback;
  /** Semanas de trabajo del bloque anterior que entran en `performed` (sin las
   *  de descarga y, si sigue en curso, solo las ya terminadas). */
  semanasContadas?: number;
  /** El bloque anterior aún no ha terminado a fecha de `hoy`. */
  enCurso?: boolean;
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
 * Una respuesta de agujetas, llevada a grupos musculares y a la escala 0-10
 * del sugeridor. Hay dos cuestionarios vivos y los dos valen:
 *  - `doms.<grupo>`: el DOM's antiguo, 0-10 por grupo. Se lee tal cual.
 *  - `agujetas.<zona>`: el módulo oficial de «Tu semana» (27-10-2026), 1-5 por
 *    zona del IEM. El CDG convierte el 0-10 a 1-5 con `max(1, round(v / 2))`
 *    (utils/cdg/agujetas.ts); aquí se hace el camino contrario, ×2, para que
 *    el 4 del curso («te pasas, baja») sea el 8 que ya recortaba el sugeridor.
 *    Una zona puede cubrir varios grupos (deltoides → anterior, lateral y
 *    posterior): la lectura vale para todos.
 * Hasta el 17-11-2026 solo se leía `doms.*`: los atletas del paquete oficial,
 * que son los que contestan agujetas cada semana, no aportaban ninguna.
 */
function lecturaDeAgujetas(señal: string, valor: string | number | boolean): { grupos: readonly MuscleGroup[]; valor: number } | null {
  const n = Number(valor);
  const grupoDoms = esSeñalDoms(señal);
  if (grupoDoms) return Number.isNaN(n) ? null : { grupos: [grupoDoms], valor: n };
  if (!señal.startsWith('agujetas.')) return null;
  const zona = señal.slice('agujetas.'.length);
  if (!esZonaIem(zona) || Number.isNaN(n) || n < 1) return null;
  return { grupos: ZONA_POR_CLAVE[zona].grupos, valor: Math.min(10, n * 2) };
}

const esSeñalDeAgujetas = (señal: string) => señal.startsWith('doms.') || señal.startsWith('agujetas.');

/**
 * Lee el feedback del atleta de la ÚLTIMA respuesta enviada de cada
 * cuestionario que lleve señales. Se recorren todas las respuestas de más
 * reciente a más antigua y la primera que aporte cada señal gana — así el
 * cierre de mesociclo y el cuestionario de DOM's, que son dos cuestionarios
 * distintos, se combinan sin pisarse.
 *
 * Las agujetas siguen la misma regla, por grupo: manda la lectura más reciente
 * de cada grupo, y solo las enviadas dentro de `ventanaAgujetas` (las fechas
 * del bloque anterior). Antes se quedaba con el MÁXIMO de todas las respuestas
 * de la vida del atleta: unas agujetas de 9 en su primera semana de gimnasio,
 * un año atrás, le seguían quitando un escalón de volumen en cada bloque.
 */
export function leerFeedback(
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
  ventanaAgujetas?: { desde: string; hasta: string },
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
    const fecha = r.submittedAt.slice(0, 10);
    const enVentana = !ventanaAgujetas || (fecha >= ventanaAgujetas.desde && fecha <= ventanaAgujetas.hasta);
    // Dos zonas distintas pueden apuntar al mismo grupo (OBLICUOS y ABDOMEN →
    // core): dentro de UNA respuesta manda la peor de las dos, que es la que
    // condiciona si se puede subir volumen ahí.
    const agujetasDeEsta: Partial<Record<MuscleGroup, number>> = {};

    for (const a of r.answers) {
      const señal = señalPorPregunta.get(a.questionId);
      if (!señal) continue;

      if (esSeñalDeAgujetas(señal)) {
        const lectura = enVentana ? lecturaDeAgujetas(señal, a.value) : null;
        for (const g of lectura?.grupos ?? []) {
          agujetasDeEsta[g] = Math.max(agujetasDeEsta[g] ?? 0, lectura!.valor);
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

    for (const [g, valor] of Object.entries(agujetasDeEsta) as [MuscleGroup, number][]) {
      if (fb.doms[g] !== undefined) continue; // ya hay una lectura más reciente de este grupo
      fb.doms[g] = valor;
      encontradoAlgo = true;
    }
  }

  return encontradoAlgo ? fb : undefined;
}

/**
 * El cuestionario de la última semana del bloque se envía el viernes y se
 * puede contestar hasta el martes: esos dos días de después siguen hablando
 * del bloque que acaba, y son justo las agujetas del momento de más volumen.
 */
const DIAS_DE_GRACIA_AGUJETAS = 2;

/** RIR medio de unos registros, con la misma cuenta que `computeAverageRir`
 *  (series principales, las de «al fallo» fuera) pero SIN su ventana de 28
 *  días desde hoy: aquí la ventana la pone quien elige los registros. */
function rirMedioDe(logs: WorkoutLog[]): number | null {
  const valores: number[] = [];
  for (const log of logs) {
    for (const entry of log.entries) {
      for (const set of seriesPrincipales(entry.sets)) {
        if (set.alFallo) continue;
        if (typeof set.rir === 'number' && !Number.isNaN(set.rir)) valores.push(set.rir);
      }
    }
  }
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

/**
 * El bloque del que sacar historial cuando el bloque nuevo todavía no existe
 * (el asistente, antes de proponerlo): el último que haya empezado y tenga al
 * menos una semana terminada a fecha de `hoy`. Uno recién empezado, o uno ya
 * creado con fecha futura, no ha enseñado nada todavía.
 */
function ultimoBloqueConHistorial(mesocycles: Mesocycle[], hoy: string): Mesocycle | undefined {
  return [...mesocycles]
    .filter(m => !!m.startDate && diasEntreFechas(m.startDate, hoy) >= 7)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.number - a.number)[0];
}

/**
 * Composición pura — todo lo que se lee de red entra ya resuelto por parámetros.
 *
 * Todo lo que devuelve es DEL BLOQUE ANTERIOR, acotado a sus fechas. No lo era
 * (17-11-2026): el RIR medio salía de los últimos 28 días desde hoy —o sea, del
 * bloque en curso, o de nada si el anterior acabó hace un mes— y las agujetas,
 * de toda la vida del atleta. El motor decidía «cumplió el bloque anterior»
 * mezclando la adherencia de un bloque con el esfuerzo de otro.
 *
 * `currentId` es el bloque que se está montando; el anterior es el de número
 * inmediatamente menor. `null` = el bloque nuevo aún no existe (el asistente,
 * antes de `propose_mesocycle`): el anterior es entonces el último bloque con
 * historial a fecha de `hoy`, que suele ser el que está en curso.
 *
 * `hoy` (YYYY-MM-DD), si se pasa, recorta un bloque anterior que sigue en
 * curso a sus semanas ya TERMINADAS: series, RIR y adherencia salen solo de
 * ellas. Sin eso, a mitad de bloque «hizo 5 de las 10 series semanales» sería
 * mentira (lleva la mitad de las semanas) y las sesiones que aún no tocan
 * contarían como no hechas.
 */
export function buildVolumeHistoryFrom(params: {
  mesocycles: Mesocycle[];
  currentId: string | null;
  logs: WorkoutLog[];
  exercises: Exercise[];
  assignments: WorkoutAssignment[];
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
  hoy?: string;
}): VolumeHistory {
  const { mesocycles, currentId, logs, exercises, assignments, hoy } = params;
  const actual = currentId === null ? undefined : mesocycles.find(m => m.id === currentId);
  const previous = currentId === null && hoy
    ? ultimoBloqueConHistorial(mesocycles, hoy)
    : [...mesocycles]
      .filter(m => m.id !== currentId && (actual ? m.number < actual.number : true))
      .sort((a, b) => b.number - a.number)[0];

  if (!previous) {
    return { ...HISTORIAL_VACIO, feedback: leerFeedback(params.responses ?? [], params.questionnaires ?? []) };
  }

  // ── La ventana del bloque anterior ──────────────────────────────────────
  const finDelBloque = addDays(previous.startDate, previous.weeks * 7 - 1);
  const enCurso = !!hoy && hoy <= finDelBloque;
  const semanasDeCalendario = enCurso
    ? Math.max(0, Math.min(previous.weeks, Math.floor(diasEntreFechas(previous.startDate, hoy) / 7)))
    : Math.max(1, previous.weeks);
  const finPrevio = enCurso ? addDays(previous.startDate, semanasDeCalendario * 7 - 1) : finDelBloque;

  const feedback = leerFeedback(params.responses ?? [], params.questionnaires ?? [], {
    desde: previous.startDate,
    hasta: addDays(finPrevio, DIAS_DE_GRACIA_AGUJETAS),
  });

  // Por `mesocycleId` cuando el registro lo trae; por fechas para los antiguos.
  // De un bloque en curso, además, solo lo de sus semanas ya terminadas.
  const logsPrevios = logs.filter(l => (l.mesocycleId
    ? l.mesocycleId === previous.id && (!enCurso || l.date <= finPrevio)
    : (l.date >= previous.startDate && l.date <= finPrevio)));

  // ── Semanas de trabajo: las de descarga no entran en la media ───────────
  // En una descarga se hace la mitad de series A PROPÓSITO. Contándola, un
  // bloque de 4 semanas con una de descarga y todo cumplido salía con un 12 %
  // menos de series «hechas» que las programadas, y la regla «no hizo el 70 %»
  // se acercaba sola. Solo `semanasDescarga` (la que recorta el entreno): la
  // marca `deloadWeek` del calendario no bajó ninguna serie. Van en semanas de
  // ciclo, así que se cuentan por días (una vuelta de 14 días son 2 semanas).
  const cicloDias = cicloDiasDeMeso(previous);
  const descargas = new Set(previous.semanasDescarga ?? []);
  const esDescarga = (fecha: string) => descargas.has(mesocycleWeekNumber(previous.startDate, fecha, cicloDias));
  let diasDeDescarga = 0;
  if (descargas.size > 0) {
    for (let d = 0; d < semanasDeCalendario * 7; d++) {
      if (esDescarga(addDays(previous.startDate, d))) diasDeDescarga++;
    }
  }
  const semanasDeTrabajo = semanasDeCalendario - diasDeDescarga / 7;
  // Un bloque que fuera todo descarga no tiene semanas de trabajo: se cuenta
  // entero antes que dividir por cero.
  const sinDescargas = semanasDeTrabajo > 0;
  const semanas = sinDescargas ? semanasDeTrabajo : semanasDeCalendario;
  const logsDeTrabajo = sinDescargas && descargas.size > 0 ? logsPrevios.filter(l => !esDescarga(l.date)) : logsPrevios;

  // Series del bloque anterior por grupo PRINCIPAL, en la misma unidad en que
  // se programaron (`MuscleGroupConfig.series` es semanal: se divide por las
  // semanas de trabajo del bloque). Hasta el 26-10-2026 se usaban las series
  // ponderadas del informe (secundario 0,5), que inflaban lo hecho un 20-40 % y
  // la regla «adherencia < 70 % → techo en lo hecho» casi nunca recortaba (M10).
  const groups: Partial<Record<MuscleGroup, GroupHistory>> = {};
  // Un bloque en curso sin ninguna semana terminada no tiene nada que contar:
  // sin grupos, el motor cae a reglas puras en vez de leer «no hizo nada».
  if (semanas > 0) {
    const realizadas = seriesRealizadasPorGrupo(logsDeTrabajo, exercises);
    for (const [grupo, sets] of realizadas) {
      if ((grupo as string) === 'none') continue;
      const planned = previous.groups[grupo]?.series ?? 0;
      const performed = Math.round(sets / semanas);
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
  }

  return {
    previous,
    adherencePct: adherenciaDeMesociclo(enCurso ? assignments.filter(a => a.date <= finPrevio) : assignments, previous.id),
    meanRir: rirMedioDe(logsPrevios),
    groups,
    feedback,
    semanasContadas: Math.round(semanas * 10) / 10,
    enCurso,
  };
}
