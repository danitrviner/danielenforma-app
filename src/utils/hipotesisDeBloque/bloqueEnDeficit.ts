import type { NutritionProgram } from '../../types.js';
import { computePhaseStartDate } from '../fasesNutricion.js';
import { objetivoDeFase } from '../objetivoDeFase.js';
import { addDays, diasEntreFechas } from '../trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ¿El bloque cae en déficit? (auditoría de cifras, 17-11-2026)

   En déficit no se le pide a una zona que gane fuerza: se le pide no perderla,
   y no se le sube el estímulo. Para saber si un bloque «es de déficit» se mira
   la periodización nutricional del atleta (`NutritionProgram.phases`) con la
   MISMA lectura que el cierre de bloque (`objetivoDeFase`: el objetivo que
   marcó el coach y, si no, lo que se deduce del tipo, el nombre o las kcal;
   «déficit» y «pérdida acelerada» son déficit, igual que en
   `conclusionesDelBloque.ts`).

   «Mayoritariamente»: más de la mitad de los días del bloque caen en fases de
   déficit. Los días que quedan fuera del programa (antes de que empiece o
   después de la última fase) no son déficit.

   Solo alimenta una SUGERENCIA de la hipótesis (regla de Dani: la
   periodización nutricional no toca el entreno): el coach edita la ficha como
   quiera. Puro.
   ═══════════════════════════════════════════════════════════════════════════ */

const esFecha = (f: string | undefined | null): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);

/** Días del bloque (`inicio` a `fin`, los dos incluidos) que caen en una fase de déficit. */
export function diasEnDeficit(programa: NutritionProgram | null | undefined, inicio: string, fin: string): number {
  if (!programa || !esFecha(programa.startDate) || !esFecha(inicio) || !esFecha(fin) || fin < inicio) return 0;
  let dias = 0;
  for (let idx = 0; idx < programa.phases.length; idx++) {
    const tipo = objetivoDeFase(programa, idx)?.tipo;
    if (tipo !== 'deficit' && tipo !== 'deficit_acelerado') continue;
    const desde = computePhaseStartDate(programa, idx);
    const hasta = addDays(desde, programa.phases[idx].weeks * 7 - 1); // incluido
    const a = desde > inicio ? desde : inicio;
    const b = hasta < fin ? hasta : fin;
    if (b >= a) dias += diasEntreFechas(a, b) + 1;
  }
  return dias;
}

/** ¿Más de la mitad de los días del bloque caen en una fase de déficit? */
export function bloqueEnDeficit(programa: NutritionProgram | null | undefined, inicio: string, fin: string): boolean {
  if (!esFecha(inicio) || !esFecha(fin) || fin < inicio) return false;
  const total = diasEntreFechas(inicio, fin) + 1;
  return diasEnDeficit(programa, inicio, fin) * 2 > total;
}
