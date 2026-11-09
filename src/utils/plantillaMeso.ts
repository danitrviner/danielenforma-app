import type { Mesocycle, MesocycleTemplate, MuscleGroup, TemplateDay, TemplateStage, Workout } from '../types.js';
import { nombreDeSesion } from './nombresMeso.js';
import { nombrePropioDeSesion } from './draftEjercicios.js';
import { distribucionDesdeDias } from './distribucionDeMeso.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Mesociclo ↔ etapa de plantilla

   El único sitio que traduce entre los dos. Antes había tres traducciones a
   mano (guardar como plantilla, aplicar plantilla y el formulario de la
   biblioteca), cada una con su lista de campos, y las tres se dejaban el
   reparto, el ciclo, la distribución… Ahora la plantilla se edita con el mismo
   editor que un mesociclo, y lo que se diseña ahí tiene que llegar entero al
   atleta.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo que define el PLAN de un bloque y no depende de ningún atleta ni fecha. */
const CAMPOS_DE_PLAN = [
  'cycleDays', 'customOffsets', 'splitId', 'reparto', 'distribution', 'phaseType',
  'nombresSesion', 'ejerciciosClave', 'notasSemana', 'deloadWeek', 'semanasDescarga', 'semanasTest', 'semanasPivot',
] as const satisfies readonly (keyof Mesocycle & keyof TemplateStage)[];

/**
 * «Fecha de inicio» de un mesociclo de plantilla dentro del editor. Una
 * plantilla no empieza ningún día, pero el editor pinta los días de la semana
 * a partir de la fecha: con un lunes, el día 1 del ciclo se lee «L».
 */
export const LUNES_DE_PLANTILLA = '2024-01-01';

const copia = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

function copiarDias(dias: TemplateDay[] | undefined): TemplateDay[] | undefined {
  return dias && dias.length > 0 ? dias.map(d => ({ ...d, exercises: d.exercises.map(e => structuredClone(e)) })) : undefined;
}

/** Una etapa de plantilla a partir de un mesociclo (el plan entero, sin atleta ni fechas). */
export function etapaDesdeMeso(
  meso: Mesocycle,
  opciones: { id: string; dias?: TemplateDay[]; revisiones?: Pick<TemplateStage, 'reviewCadenceWeeks' | 'reviewType'> },
): TemplateStage {
  const etapa: TemplateStage = {
    id: opciones.id,
    name: meso.name?.trim() || meso.objective?.trim() || `Mesociclo ${meso.number}`,
    weeks: meso.weeks,
    daysPerWeek: meso.daysPerWeek,
    groups: copia(meso.groups),
    ...(meso.objective?.trim() ? { objective: meso.objective.trim() } : {}),
    ...(opciones.revisiones?.reviewCadenceWeeks ? opciones.revisiones : {}),
  };
  const dias = copiarDias(opciones.dias ?? meso.days);
  if (dias) etapa.days = dias;
  for (const k of CAMPOS_DE_PLAN) {
    if (meso[k] !== undefined) (etapa as unknown as Record<string, unknown>)[k] = copia(meso[k]);
  }
  return etapa;
}

/**
 * Plantilla de biblioteca a partir del mesociclo de un atleta («Guardar como
 * plantilla»). Se queda con el plan (días, ejercicios, series, reps, RIR,
 * progresión…) y nada del atleta: ni id, ni fechas, ni eventos, ni el draft, ni
 * los ajustes de CDG que dependen de él. `nombre` vacío = el del mesociclo.
 */
export function plantillaDesdeMeso(
  meso: Mesocycle,
  opciones: { ownerId: string; nombre?: string; etapaId: string; dias?: TemplateDay[] },
): Omit<MesocycleTemplate, 'id'> {
  const etapa = etapaDesdeMeso(meso, { id: opciones.etapaId, dias: opciones.dias });
  return {
    ownerId: opciones.ownerId,
    name: opciones.nombre?.trim() || meso.name?.trim() || `Meso #${meso.number}`,
    description: 'Guardada desde un mesociclo, con sus cambios semana a semana.',
    stages: [etapa],
  };
}

/**
 * Un mesociclo a partir de una etapa. `base` pone lo que la plantilla no
 * sabe: de quién es, qué número lleva y cuándo empieza.
 *
 * `conNombre`: el nombre de la etapa pasa a ser el nombre del mesociclo. En el
 * editor de plantillas sí (es el campo que se edita); al aplicarla a un atleta
 * no, como siempre: allí el bloque sigue llamándose «Meso #N» y la etapa da
 * su objetivo.
 */
export function mesoDesdeEtapa(
  etapa: TemplateStage,
  base: Pick<Mesocycle, 'id' | 'athleteId' | 'number' | 'startDate'> & Partial<Pick<Mesocycle, 'programId' | 'programOrder'>>,
  conNombre = false,
): Mesocycle {
  const meso: Mesocycle = {
    ...base,
    weeks: etapa.weeks,
    objective: etapa.objective ?? etapa.name,
    daysPerWeek: etapa.daysPerWeek,
    groups: copia(etapa.groups),
    ...(conNombre ? { name: etapa.name } : {}),
  };
  const dias = copiarDias(etapa.days);
  if (dias) meso.days = dias;
  for (const k of CAMPOS_DE_PLAN) {
    if (etapa[k] !== undefined) (meso as unknown as Record<string, unknown>)[k] = copia(etapa[k]);
  }
  return meso;
}

/**
 * Las rutinas (una por sesión del ciclo) de un mesociclo que viene de una
 * plantilla con sus ejercicios ya hechos. Sin esto, al aplicar o importar una
 * plantilla el mesociclo traía el plan pero la pestaña Ejercicios salía vacía
 * —«Ir a Distribución para generarlas»—, como si nadie lo hubiera diseñado.
 *
 * Solo crea las rutinas: NO las asigna al calendario del atleta. Eso sigue
 * siendo «Asignar mesociclo», cuando el coach lo decida.
 *
 * Vacío si la plantilla no traía ejercicios (entonces sí hay que generarlas).
 */
export function rutinasDeMesoDePlantilla(
  meso: Mesocycle,
  opciones: { ownerId: string; athleteName?: string },
): Omit<Workout, 'id'>[] {
  const dias = meso.days ?? [];
  if (!dias.some(d => d.exercises.length > 0)) return [];
  return dias.slice(0, meso.daysPerWeek).map((dia, i) => ({
    ownerId: opciones.ownerId,
    name: nombreDeSesion({
      tipo: nombrePropioDeSesion(meso.nombresSesion, i) ?? dia.name,
      dayIdx: i, athleteName: opciones.athleteName, meso,
    }),
    mesocycleId: meso.id,
    dayIndex: i,
    exercises: dia.exercises.map(e => structuredClone(e)),
  }));
}

/**
 * `mesoDesdeEtapa` para el mesociclo de un ATLETA (aplicar la plantilla en el
 * gestor o importarla desde el calendario). Además del traspaso, si la etapa
 * trae los ejercicios hechos pero se guardó sin distribución —plantillas
 * anteriores al 16-10—, la saca de esos ejercicios (`distribucionDesdeDias`): la plantilla está terminada y la pestaña
 * Distribución no debe pedir que se haga otra vez.
 */
export function mesoDeAtletaDesdeEtapa(
  etapa: TemplateStage,
  base: Parameters<typeof mesoDesdeEtapa>[1],
  grupoDe?: (exerciseId: string) => MuscleGroup | undefined,
): Mesocycle {
  const meso = mesoDesdeEtapa(etapa, base);
  if (!meso.distribution) {
    const distribution = distribucionDesdeDias(meso, grupoDe);
    if (distribution) meso.distribution = distribution;
  }
  return meso;
}
