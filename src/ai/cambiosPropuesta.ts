/* «Antes → después» de una propuesta.
 *
 * Una propuesta de mesociclo #3 decía «pecho 12 series» y Dani tenía que
 * acordarse de cuántas llevaba el #2 para saber si eso era subir o bajar. La
 * IA lo contaba a veces en el rationale, a veces no, y nunca igual.
 *
 * Esto lo calcula la app al crear la propuesta, contra lo que el atleta tiene
 * HOY (su último mesociclo, la dieta que ajusta, su periodización en marcha),
 * y se guarda con ella. La tarjeta lo pinta como una lista corta; una
 * propuesta sin nada que comparar (primer mes) no lleva lista.
 */
import {
  Diet, Mesocycle, MuscleGroup, MUSCLE_LABELS, MUSCLE_ORDER, MuscleGroupConfig,
  NutritionProgram, NutritionProgramProposalPayload,
} from '../types';
import { exchangeToKcal } from '../utils/nutritionConstants';

function series(m: Pick<Mesocycle, 'groups'> | undefined, g: MuscleGroup): number {
  return (m?.groups?.[g] as MuscleGroupConfig | undefined)?.series ?? 0;
}

/** Mesociclo nuevo frente al último que tenía el atleta. */
export function cambiosDeMesociclo(anterior: Mesocycle | undefined, nuevo: Omit<Mesocycle, 'id'>): string[] {
  if (!anterior) return [];
  const cambios: string[] = [];
  if (anterior.weeks !== nuevo.weeks) cambios.push(`Semanas: ${anterior.weeks} → ${nuevo.weeks}`);
  if (anterior.daysPerWeek !== nuevo.daysPerWeek) cambios.push(`Días por semana: ${anterior.daysPerWeek} → ${nuevo.daysPerWeek}`);
  if ((anterior.objective ?? '') !== (nuevo.objective ?? '')) cambios.push(`Objetivo: «${anterior.objective ?? ''}» → «${nuevo.objective ?? ''}»`);
  if (anterior.deloadWeek !== nuevo.deloadWeek) {
    cambios.push(nuevo.deloadWeek === undefined
      ? `Descarga: fuera (antes en la semana ${anterior.deloadWeek})`
      : anterior.deloadWeek === undefined
        ? `Descarga: nueva, en la semana ${nuevo.deloadWeek}`
        : `Descarga: semana ${anterior.deloadWeek} → ${nuevo.deloadWeek}`);
  }

  const totalAntes = MUSCLE_ORDER.reduce((s, g) => s + series(anterior, g), 0);
  const totalAhora = MUSCLE_ORDER.reduce((s, g) => s + series(nuevo, g), 0);
  if (totalAntes !== totalAhora) cambios.push(`Series totales: ${totalAntes} → ${totalAhora}`);

  const suben: string[] = [];
  const bajan: string[] = [];
  const entran: string[] = [];
  const salen: string[] = [];
  for (const g of MUSCLE_ORDER) {
    const a = series(anterior, g);
    const b = series(nuevo, g);
    if (a === b) continue;
    const etiqueta = `${MUSCLE_LABELS[g]} ${a} → ${b}`;
    if (a === 0) entran.push(`${MUSCLE_LABELS[g]} ${b}`);
    else if (b === 0) salen.push(`${MUSCLE_LABELS[g]} (tenía ${a})`);
    else if (b > a) suben.push(etiqueta);
    else bajan.push(etiqueta);
  }
  if (suben.length) cambios.push(`Suben: ${suben.join(', ')}`);
  if (bajan.length) cambios.push(`Bajan: ${bajan.join(', ')}`);
  if (entran.length) cambios.push(`Entran: ${entran.join(', ')}`);
  if (salen.length) cambios.push(`Salen: ${salen.join(', ')}`);
  return cambios;
}

/** Dieta propuesta frente a la que ajusta (o, si es nueva, frente a la
 *  dieta activa del atleta si la hay). */
export function cambiosDeDieta(base: Diet | undefined, nueva: Omit<Diet, 'id'>): string[] {
  if (!base) return [];
  const cambios: string[] = [];
  const kcalAntes = exchangeToKcal(base.budget);
  const kcalAhora = exchangeToKcal(nueva.budget);
  if (kcalAntes !== kcalAhora) cambios.push(`Kcal: ${kcalAntes} → ${kcalAhora} (${kcalAhora > kcalAntes ? '+' : ''}${kcalAhora - kcalAntes})`);
  for (const cat of ['HC', 'PROT', 'GRASA'] as const) {
    const a = base.budget?.[cat] ?? 0;
    const b = nueva.budget?.[cat] ?? 0;
    if (a !== b) cambios.push(`${cat}: ${a} → ${b} intercambios`);
  }
  const comidasAntes = base.meals?.length ?? 0;
  const comidasAhora = nueva.meals?.length ?? 0;
  if (comidasAntes !== comidasAhora) cambios.push(`Comidas: ${comidasAntes} → ${comidasAhora}`);

  const alimentos = (d: Pick<Diet, 'meals'>) => new Set((d.meals ?? []).flatMap(m => m.items.map(i => i.foodLabel)));
  const antes = alimentos(base);
  const ahora = alimentos(nueva);
  const entran = [...ahora].filter(x => !antes.has(x)).sort();
  const salen = [...antes].filter(x => !ahora.has(x)).sort();
  if (entran.length) cambios.push(`Entran: ${entran.slice(0, 8).join(', ')}${entran.length > 8 ? ` y ${entran.length - 8} más` : ''}`);
  if (salen.length) cambios.push(`Salen: ${salen.slice(0, 8).join(', ')}${salen.length > 8 ? ` y ${salen.length - 8} más` : ''}`);
  return cambios;
}

/** Periodización propuesta frente a la que está en marcha. */
export function cambiosDePeriodizacion(actual: NutritionProgram | null | undefined, nueva: NutritionProgramProposalPayload): string[] {
  if (!actual || actual.phases.length === 0) return [];
  const cambios: string[] = [];
  const semanas = (fases: { weeks: number }[]) => fases.reduce((t, f) => t + f.weeks, 0);
  if (actual.phases.length !== nueva.phases.length || semanas(actual.phases) !== semanas(nueva.phases)) {
    cambios.push(`Fases: ${actual.phases.length} (${semanas(actual.phases)} sem) → ${nueva.phases.length} (${semanas(nueva.phases)} sem)`);
  }
  const kcal = (fases: { name: string; targetKcal?: number }[]) =>
    fases.map(f => `${f.name} ${f.targetKcal ?? '—'}`).join(' · ');
  const kcalAntes = kcal(actual.phases);
  const kcalAhora = kcal(nueva.phases);
  if (kcalAntes !== kcalAhora) cambios.push(`Kcal por fase: ${kcalAntes} → ${kcalAhora}`);
  const recargasAntes = actual.refeedDays?.length ?? 0;
  const recargasAhora = nueva.refeedDays?.length ?? 0;
  if (recargasAntes !== recargasAhora) cambios.push(`Recargas: ${recargasAntes} → ${recargasAhora}`);
  return cambios;
}
