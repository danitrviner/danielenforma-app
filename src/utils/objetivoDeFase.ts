import { NutritionPhase, NutritionPhaseType, NutritionProgram } from '../types.js';
import { addDays } from './trainingWeek.js';
import { computePhaseStartDate } from './fasesNutricion.js';
import { clasificarFaseNutricion } from './roadmapCalendar.js';
import { ObjetivoCorporalTipo, OBJETIVO_LABEL, RANGO_PCT_SEMANA } from './verificacionObjetivo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El objetivo corporal vive en la periodización

   Una fase ES un objetivo con duración: «Déficit, 8 semanas». No hay segunda
   caja: `NutritionPhase.objetivo` guarda cuál de los seis es, y `phaseType`
   (los tres colores del calendario) se sigue rellenando a partir de él para
   que todo lo que ya lee `phaseType` —calendario, Roadmap, IA— funcione igual.

   Las fases de antes no tienen `objetivo`: se deduce de su `phaseType` o del
   salto de kcal con la anterior, y se marca como deducido para que el coach
   sepa que puede confirmarlo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Semanas con las que nace una fase creada desde «Cambiar objetivo». */
export const SEMANAS_FASE_NUEVA = 8;

const TIPO_DE_OBJETIVO: Record<ObjetivoCorporalTipo, NutritionPhaseType> = {
  volumen: 'superavit',
  salida_deficit: 'superavit',
  deficit: 'deficit',
  deficit_acelerado: 'deficit',
  mantenimiento: 'mantenimiento',
  recomposicion: 'mantenimiento',
};

const OBJETIVO_DE_TIPO: Record<NutritionPhaseType, ObjetivoCorporalTipo> = {
  superavit: 'volumen',
  deficit: 'deficit',
  mantenimiento: 'mantenimiento',
};

export function phaseTypeDeObjetivo(tipo: ObjetivoCorporalTipo): NutritionPhaseType {
  return TIPO_DE_OBJETIVO[tipo];
}

/** Ritmo en kg/sem del centro del rango, redondeado a 50 g. Undefined en los objetivos de franja. */
export function ritmoSugeridoKg(tipo: ObjetivoCorporalTipo, pesoKg: number | null | undefined): number | undefined {
  const r = RANGO_PCT_SEMANA[tipo];
  if (!r || pesoKg == null) return undefined;
  const kg = (((r.min + r.max) / 2) / 100) * pesoKg;
  return Math.round(kg * 20) / 20;
}

export interface ObjetivoResuelto {
  tipo: ObjetivoCorporalTipo;
  /** true si la fase no lo trae marcado y se ha deducido de su tipo o sus kcal. */
  deducido: boolean;
  /** De dónde sale: marcado por el coach, su `phaseType`, su nombre o el salto de kcal. */
  por: 'marcado' | 'tipo' | 'nombre' | 'kcal';
}

/**
 * Palabras del NOMBRE de la fase que delatan su objetivo. Van antes que las
 * kcal: «Mantenimiento» tras un déficit sube kcal y, por kcal, saldría
 * «Volumen»; el nombre que puso el coach dice mucho más. El orden importa:
 * «déficit acelerado» antes que «déficit», «salida de déficit» antes también.
 */
const PALABRAS_OBJETIVO: [RegExp, ObjetivoCorporalTipo][] = [
  [/salida|invers|reverse/i, 'salida_deficit'],
  [/acelerad|agresiv|r[aá]pid/i, 'deficit_acelerado'],
  [/recomp/i, 'recomposicion'],
  [/mantenim|manten|diet ?break|mant\b/i, 'mantenimiento'],
  [/d[eé]ficit|definici|p[eé]rdida|cut/i, 'deficit'],
  [/volumen|super[aá]vit|bulk|ganancia/i, 'volumen'],
];

function objetivoPorNombre(nombre: string | undefined): ObjetivoCorporalTipo | null {
  if (!nombre) return null;
  for (const [re, tipo] of PALABRAS_OBJETIVO) if (re.test(nombre)) return tipo;
  return null;
}

export function objetivoDeFase(program: NutritionProgram, idx: number): ObjetivoResuelto | null {
  const fase = program.phases[idx];
  if (!fase) return null;
  if (fase.objetivo) return { tipo: fase.objetivo, deducido: false, por: 'marcado' };
  // El tipo que marcó el coach a mano manda sobre el nombre.
  if (fase.phaseType) return { tipo: OBJETIVO_DE_TIPO[fase.phaseType], deducido: true, por: 'tipo' };
  const porNombre = objetivoPorNombre(fase.name);
  if (porNombre) return { tipo: porNombre, deducido: true, por: 'nombre' };
  const tipo = clasificarFaseNutricion(fase, program.phases[idx - 1]);
  return tipo ? { tipo: OBJETIVO_DE_TIPO[tipo], deducido: true, por: 'kcal' } : null;
}

export interface FaseEnCurso {
  idx: number;
  fase: NutritionPhase;
  desde: string;
  hasta: string; // exclusivo
  objetivo: ObjetivoResuelto | null;
}

/** La fase que rige `hoy`, con sus fechas y su objetivo. */
export function faseEnCurso(program: NutritionProgram | null, hoy: string): FaseEnCurso | null {
  if (!program?.startDate) return null;
  for (let idx = 0; idx < program.phases.length; idx++) {
    const desde = computePhaseStartDate(program, idx);
    const hasta = addDays(desde, program.phases[idx].weeks * 7);
    if (hoy >= desde && hoy < hasta) {
      return { idx, fase: program.phases[idx], desde, hasta, objetivo: objetivoDeFase(program, idx) };
    }
  }
  return null;
}

function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

/**
 * Pone el objetivo a una fase. El ritmo que ya tuviera se respeta si va en la
 * dirección del objetivo (el coach lo afinó a mano); si va en contra o no hay,
 * se pone el centro del rango. En los objetivos de franja (mantenimiento,
 * recomposición) se quita: su verificación no usa ritmo.
 */
function conObjetivo(fase: NutritionPhase, tipo: ObjetivoCorporalTipo, pesoKg?: number | null): NutritionPhase {
  const rango = RANGO_PCT_SEMANA[tipo];
  const { targetRateKgWeek: previo, ...resto } = fase;
  let ritmo: number | undefined;
  if (rango) {
    const direccion = rango.min + rango.max >= 0 ? 1 : -1;
    ritmo = previo != null && previo * direccion > 0 ? previo : ritmoSugeridoKg(tipo, pesoKg);
  }
  return {
    ...resto,
    objetivo: tipo,
    phaseType: phaseTypeDeObjetivo(tipo),
    ...(ritmo != null ? { targetRateKgWeek: ritmo } : {}),
  };
}

/**
 * Recorta una fase a las semanas ya vividas. Se le quita el ritmo: con ritmo y
 * peso objetivo el panel de periodización RECALCULA las semanas al guardar, y
 * devolvería a la fase su duración original, pisando a la nueva.
 */
function recortada(fase: NutritionPhase, semanas: number): NutritionPhase {
  const { targetRateKgWeek: _ritmo, ...resto } = fase;
  return { ...resto, weeks: semanas };
}

/**
 * Cambia el objetivo del atleta a partir de hoy, SIN borrar historia.
 *
 *  · Sin programa → nace uno con una fase desde hoy.
 *  · Con una fase en curso de menos de una semana → se le cambia el objetivo
 *    a esa misma fase (el coach se lo ha pensado mejor, no es un cambio de
 *    etapa).
 *  · Con una fase en curso más larga → se recorta a las semanas ya vividas y
 *    se inserta la nueva detrás. Las fases planificadas después se conservan y
 *    se desplazan: borrar lo que el coach planificó no se pidió.
 *  · Programa aún sin empezar → se cambia el objetivo de la primera fase.
 *  · Programa terminado → se rellena el hueco con una fase «Sin objetivo»
 *    (las fases van encadenadas, no puede haber huecos) y se añade la nueva.
 *
 * Las fases empiezan siempre en múltiplos de semana desde `startDate`: la
 * nueva arranca en el corte de semana más reciente, como mucho 6 días antes
 * de hoy.
 */
export function cambiarObjetivo(params: {
  program: NutritionProgram | null;
  athleteEmail: string;
  tipo: ObjetivoCorporalTipo;
  hoy: string;
  pesoKg?: number | null;
  nuevoId?: string;
}): NutritionProgram {
  const { program, athleteEmail, tipo, hoy, pesoKg } = params;
  const id = params.nuevoId ?? `phase_${Date.now()}`;
  const nueva = (dietId: string): NutritionPhase => conObjetivo(
    { id, name: OBJETIVO_LABEL[tipo], weeks: SEMANAS_FASE_NUEVA, dietId }, tipo, pesoKg);

  if (!program || !program.startDate || program.phases.length === 0) {
    return { ...(program ?? {}), athleteId: athleteEmail, startDate: hoy, phases: [nueva('')] };
  }

  const phases = [...program.phases];

  if (hoy < program.startDate) {
    phases[0] = conObjetivo(phases[0], tipo, pesoKg);
    return { ...program, phases };
  }

  const enCurso = faseEnCurso(program, hoy);
  if (enCurso) {
    const vividas = Math.floor(diasEntre(enCurso.desde, hoy) / 7);
    if (vividas === 0) {
      phases[enCurso.idx] = conObjetivo(enCurso.fase, tipo, pesoKg);
      return { ...program, phases };
    }
    phases[enCurso.idx] = recortada(enCurso.fase, vividas);
    phases.splice(enCurso.idx + 1, 0, nueva(enCurso.fase.dietId));
    return { ...program, phases };
  }

  // Terminado: hueco hasta el corte de semana de hoy.
  const fin = computePhaseStartDate(program, phases.length);
  const hueco = Math.floor(diasEntre(fin, hoy) / 7);
  const ultimaDieta = phases[phases.length - 1].dietId;
  if (hueco > 0) phases.push({ id: `${id}_hueco`, name: 'Sin objetivo', weeks: hueco, dietId: ultimaDieta });
  phases.push(nueva(ultimaDieta));
  return { ...program, phases };
}

/** Marca (o corrige) el objetivo de una fase ya existente, sin partirla. */
export function corregirObjetivoDeFase(
  program: NutritionProgram, idx: number, tipo: ObjetivoCorporalTipo, pesoKg?: number | null,
): NutritionProgram {
  const phases = [...program.phases];
  phases[idx] = conObjetivo(phases[idx], tipo, pesoKg);
  return { ...program, phases };
}

export interface ObjetivoAsignado {
  idx: number;
  faseId: string;
  nombre: string;
  tipo: ObjetivoCorporalTipo;
  por: ObjetivoResuelto['por'];
}

/**
 * Marca como CONFIRMADO el objetivo deducido de cada fase que aún no lo tiene
 * (el backfill de una vez: scripts/asignar-objetivos.ts). Solo pone
 * `objetivo` —y `phaseType` si faltaba—: no toca ritmo, semanas ni kcal, para
 * que ninguna duración ni proyección cambie por el camino. Las fases que no se
 * pueden deducir se quedan como están y se devuelven aparte.
 */
export function confirmarObjetivosDeducidos(program: NutritionProgram): {
  program: NutritionProgram;
  asignados: ObjetivoAsignado[];
  sinDeducir: { idx: number; nombre: string }[];
} {
  const asignados: ObjetivoAsignado[] = [];
  const sinDeducir: { idx: number; nombre: string }[] = [];
  const phases = program.phases.map((fase, idx) => {
    if (fase.objetivo) return fase;
    const r = objetivoDeFase(program, idx);
    if (!r) { sinDeducir.push({ idx, nombre: fase.name }); return fase; }
    asignados.push({ idx, faseId: fase.id, nombre: fase.name, tipo: r.tipo, por: r.por });
    return { ...fase, objetivo: r.tipo, ...(fase.phaseType ? {} : { phaseType: phaseTypeDeObjetivo(r.tipo) }) };
  });
  return { program: { ...program, phases }, asignados, sinDeducir };
}
