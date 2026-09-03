import type { Diet, DietCompletionLog, DietMeal, FoodCategory } from '../types';

const CUPO_VACIO: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };

/**
 * Las comidas de un día concreto.
 *
 * Un registro nuevo las trae dentro (`log.meals`): son las de ESE día y no se
 * mueven aunque después se edite la dieta. Un registro anterior a 09-2026 no,
 * así que para esos se cae a la dieta a la que apuntaba — que es exactamente lo
 * que hacía todo el mundo antes, ni mejor ni peor, pero sin romper el histórico.
 *
 * Todo lo que calcula adherencia, kcal o macros de un día pasa por aquí, para
 * que no queden dos formas distintas de responder a la misma pregunta.
 */
export function comidasDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): DietMeal[] {
  if (!log) return [];
  if (log.meals) return log.meals;
  return diets.find(d => d.id === log.dietId)?.meals ?? [];
}

/** El cupo que regía ese día; mismo criterio que `comidasDelDia`. */
export function cupoDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): Record<FoodCategory, number> {
  if (!log) return CUPO_VACIO;
  if (log.budget) return log.budget;
  return diets.find(d => d.id === log.dietId)?.budget ?? CUPO_VACIO;
}

/**
 * El día como si fuera una `Diet`, para las funciones que ya reciben una y
 * calculan kcal/macros a partir de `meals` + `budget`. Evita reescribir la
 * firma de media docena de utilidades de informes.
 */
export function dietaDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): Diet | undefined {
  if (!log) return undefined;
  const original = diets.find(d => d.id === log.dietId);
  if (!log.meals && !log.budget) return original;
  return {
    id: log.dietId || `dia_${log.date}`,
    athleteId: log.athleteId,
    name: original?.name ?? 'Plan del día',
    budget: cupoDelDia(log, diets),
    meals: comidasDelDia(log, diets),
    selfManaged: true,
  };
}

/** Cuántos alimentos tenía el día en total — el denominador de la adherencia. */
export function totalItemsDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): number {
  return comidasDelDia(log, diets).reduce((n, m) => n + m.items.length, 0);
}

/**
 * Adherencia del día en % (0-100), o `null` si ese día no había nada planificado
 * —dividir entre cero daría 0% y un día sin plan no es un día incumplido.
 */
export function adherenciaDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): number | null {
  const total = totalItemsDelDia(log, diets);
  if (!log || total === 0) return null;
  return Math.min(100, (log.doneItemIds.length / total) * 100);
}
