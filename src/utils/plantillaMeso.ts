import type { Mesocycle, TemplateDay, TemplateStage } from '../types.js';

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
