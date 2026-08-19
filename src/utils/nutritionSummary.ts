import { Diet, AthleteDietConfig, WeekDay } from '../types';

// Resumen de una fila para Hoy (F3.11, módulo 8: "la nutrición se resume en
// una fila de progreso, nunca repite el detalle del módulo de Nutrición").
// Deliberadamente NO reutiliza el estado interno de NutritionScreen (itemStates
// por índice de item, etc.) — solo necesita cuántas ingestas están registradas
// hoy de cuántas hay, con la misma regla de "ingesta completa" que el tracker:
// todos sus items marcados.

/** La dieta activa hoy según el horario semanal, o la primera activa si no hay horario. */
export function pickTodaysDiet(diets: Diet[], config: AthleteDietConfig | null, weekday: WeekDay): Diet | null {
  const active = diets.filter(d => !d.isDraft && (config?.activeDietIds ?? []).includes(d.id));
  if (active.length === 0) return null;
  const scheduledId = config?.weeklySchedule?.[weekday];
  if (scheduledId) return active.find(d => d.id === scheduledId) ?? null;
  if (scheduledId === null) return null; // día libre a propósito
  return active[0];
}

export interface MealsDoneCount { done: number; total: number }

/** Ingestas completas (todos sus items marcados) frente al total de ingestas con contenido. */
export function countMealsDone(diet: Diet, doneItemIds: string[]): MealsDoneCount {
  const doneSet = new Set(doneItemIds);
  const mealsWithItems = diet.meals.filter(m => m.items.length > 0);
  const done = mealsWithItems.filter(m => m.items.every((_, idx) => doneSet.has(`${m.id}_${idx}`))).length;
  return { done, total: mealsWithItems.length };
}
