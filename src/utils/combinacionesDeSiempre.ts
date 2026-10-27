import type { DietCompletionLog, DietItem } from '../types';
import { resumenDelDia } from './resumenDelDia';
import { foodNameWithoutGrams } from './exchangeHelpers';

/* ═══════════════════════════════════════════════════════════════════════════
   Tus combinaciones de siempre (hoja «Añadir», 27-10)

   Lo que el atleta repite en una comida: «pan + mermelada» en la merienda.
   Sale de su registro (los últimos 30 días que ya se leen para «Lo que más
   apuntas»): cada día, lo que marcó como comido en esa comida, como conjunto
   de alimentos. Se proponen los conjuntos de 2 o más alimentos que ha repetido
   al menos 2 veces, el más repetido primero. Añadirlo mete las mismas líneas
   de la última vez.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CombinacionDeSiempre {
  clave: string;
  nombres: string[];
  kcal: number;
  veces: number;
  /** Las líneas de la última vez, para volver a meterlas. */
  items: DietItem[];
}

const nombreDe = (it: DietItem) => foodNameWithoutGrams(it.foodLabel).trim();

export function combinacionesDeSiempre(
  logs: Pick<DietCompletionLog, 'date' | 'doneItemIds' | 'meals'>[],
  comida: { id: string; name?: string },
  max = 2,
): CombinacionDeSiempre[] {
  const porClave = new Map<string, CombinacionDeSiempre & { ultimo: string }>();
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    const meal = log.meals?.find(m => m.id === comida.id) ?? (comida.name ? log.meals?.find(m => m.name === comida.name) : undefined);
    if (!meal) continue;
    const hechos = new Set(log.doneItemIds ?? []);
    const items = (meal.items ?? []).filter((_, i) => hechos.has(`${meal.id}_${i}`));
    // Las líneas de continuación de un producto no son un alimento aparte.
    const principales = items.filter(it => !(it.lineaId && it.gramos == null && it.nutrientes === undefined));
    const nombres = [...new Set(principales.map(nombreDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (nombres.length < 2) continue;
    const clave = nombres.join(' + ').toLowerCase();
    const kcal = resumenDelDia([{ id: 'x', name: 'x', items } as never], items.map((_, i) => `x_${i}`)).kcal;
    const previa = porClave.get(clave);
    // Orden de presentación: el de la última vez (pan antes que mermelada).
    const enOrden = [...new Set(principales.map(nombreDe).filter(Boolean))];
    porClave.set(clave, { clave, nombres: enOrden, kcal, veces: (previa?.veces ?? 0) + 1, items, ultimo: log.date });
  }
  return [...porClave.values()]
    .filter(c => c.veces >= 2)
    .sort((a, b) => b.veces - a.veces || b.ultimo.localeCompare(a.ultimo))
    .slice(0, max)
    .map(({ ultimo: _u, ...c }) => c);
}
