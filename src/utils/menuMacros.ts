import type { FoodCategory, Macros, MenuComplement, MenuDay, MenuMeal, MenuRacionExtra } from '../types';
import { macrosDeIntercambios } from './macrosLegado';
import { MACROS_CERO, redondearMacros, sumarMacros } from './macros';

/* ═══════════════════════════════════════════════════════════════════════════
   kcal y gramos de un menú semanal guardado (10-2026)

   Los menús nuevos guardan el plato (`MenuMeal.macros`), el objetivo de cada
   comida (`objetivoMacros`) y el del día (`MenuDay.objetivo`) en kcal y gramos.
   Los publicados antes solo traen intercambios (`exch`, `objetivo`, `target`):
   se traducen aquí con las equivalencias de siempre. Todo el que lee un menú
   pasa por aquí, así que un menú viejo y uno nuevo se leen igual.

   Acompañamientos y raciones extra se miden en RACIONES del banco: una ración
   es la de referencia del alimento («40 g de pan»), y aporta lo que aportaba
   un intercambio de su grupo (25 g de hidratos o proteína, 11 g de grasa; los
   mixtos, medio y medio).
   ═══════════════════════════════════════════════════════════════════════════ */

/** kcal y gramos de unas raciones de un grupo del banco. */
export function macrosDeRaciones(category: FoodCategory, raciones: number): Macros {
  return macrosDeIntercambios({ [category]: raciones });
}

export function macrosDelPlato(meal: Pick<MenuMeal, 'macros' | 'exch'>): Macros {
  return meal.macros ? { ...meal.macros } : macrosDeIntercambios(meal.exch);
}

export function macrosDeAcompanamientos(complements: MenuComplement[] | undefined): Macros {
  return sumarMacros(...(complements ?? []).map(c => macrosDeRaciones(c.category, c.quantity)));
}

export function macrosDeRacionesExtra(raciones: MenuRacionExtra[] | undefined): Macros {
  return sumarMacros(...(raciones ?? []).map(r => macrosDeRaciones(r.category, r.quantity)));
}

/** Lo que suma una comida: el plato, la ración extra de sus propios
 *  ingredientes y los acompañamientos. */
export function macrosDeLaComida(meal: Pick<MenuMeal, 'macros' | 'exch' | 'complements' | 'racionesExtra'>): Macros {
  return sumarMacros(macrosDelPlato(meal), macrosDeRacionesExtra(meal.racionesExtra), macrosDeAcompanamientos(meal.complements));
}

/** Lo que esa comida debería sumar, guardado al generar; null en menús muy viejos. */
export function objetivoDeLaComida(meal: Pick<MenuMeal, 'objetivoMacros' | 'objetivo'>): Macros | null {
  if (meal.objetivoMacros) return { ...meal.objetivoMacros };
  return meal.objetivo ? macrosDeIntercambios(meal.objetivo) : null;
}

export function objetivoDelDiaDeMenu(day: Pick<MenuDay, 'objetivo' | 'target'>): Macros {
  return day.objetivo ? { ...day.objetivo } : macrosDeIntercambios(day.target);
}

export function macrosDelDiaDeMenu(day: Pick<MenuDay, 'meals'>): Macros {
  return redondearMacros(sumarMacros(MACROS_CERO, ...day.meals.map(macrosDeLaComida)));
}
