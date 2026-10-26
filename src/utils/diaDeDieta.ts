import type { Diet, DietCompletionLog, DietItem, DietMeal, FoodCategory, Macros } from '../types.js';
import { macrosDeIntercambios, macrosDeLineas, objetivoDelRegistro } from './macrosLegado.js';

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
 *
 * ── Por qué este número dice cada vez menos ────────────────────────────────
 * Cuenta líneas marcadas ÷ líneas puestas. Eso valía cuando el atleta recibía
 * un plan cerrado y tildaba lo que iba comiendo. Desde que en «Mi plan» todo lo
 * que él añade nace YA marcado, el numerador y el denominador crecen juntos: un
 * día montado a mano da 100 % coma lo que coma. Además trata igual media
 * cucharada de aceite que 200 g de pollo, porque cuenta líneas, no comida.
 *
 * Se mantiene porque hay histórico calculado así y porque para un plan que sí
 * dicta el coach todavía significa algo. Lo que mide la comida de verdad es
 * `adherenciaPorKcal`.
 */
export function adherenciaDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): number | null {
  const total = totalItemsDelDia(log, diets);
  if (!log || total === 0) return null;
  return Math.min(100, (log.doneItemIds.length / total) * 100);
}

export interface AdherenciaPorKcal {
  /** kcal comidas ÷ kcal del objetivo, en %. Puede pasar de 100. */
  pct: number;
  comido: Macros;
  objetivo: Macros;
}

/** Lo marcado como comido un día (con sus kcal y gramos reales). */
export function lineasComidas(log: DietCompletionLog, diets: Diet[]): DietItem[] {
  const marcados = new Set(log.doneItemIds ?? []);
  const out: DietItem[] = [];
  for (const [i, comida] of comidasDelDia(log, diets).entries()) {
    comida.items.forEach((item, j) => {
      // El id de una línea es `${comida.id}_${índice}` — la misma convención
      // que usa la pantalla del atleta al marcar.
      if (marcados.has(`${comida.id}_${j}`) || marcados.has(`${i}_${j}`)) out.push(item);
    });
  }
  return out;
}

/**
 * Adherencia del día medida en COMIDA, no en tics (10-2026: en kcal).
 *
 * Las kcal de lo que el atleta marcó como comido entre las de su objetivo de
 * ese día. Un día en el que se come el 90 % da 90 % aunque haya dejado líneas
 * sin tildar; uno en el que se come el doble da 200 %, que es información y no
 * un error —por eso NO se recorta a 100—.
 *
 * `null` cuando no hay objetivo: sin objetivo no hay nada que cumplir.
 */
export function adherenciaPorKcal(
  log: DietCompletionLog | null | undefined,
  diets: Diet[],
): AdherenciaPorKcal | null {
  if (!log) return null;
  const objetivo = objetivoDelRegistro(log) ?? macrosDeIntercambios(cupoDelDia(log, diets));
  if (objetivo.kcal <= 0) return null;
  const comido = macrosDeLineas(lineasComidas(log, diets));
  return {
    pct: Math.round((comido.kcal / objetivo.kcal) * 1000) / 10,
    comido, objetivo,
  };
}

/** Margen dentro del cual un día se considera cumplido. */
export const BANDA_EN_OBJETIVO_PCT = 10;
/** …y nunca menos de esto en kcal, para objetivos pequeños. */
export const BANDA_EN_OBJETIVO_MIN_KCAL = 100;

/** Kcal de margen de un día con ese objetivo: el 10 % o 100 kcal, lo que sea
 *  mayor. La misma cifra en la Revisión, los titulares y el diario (M9, 26-10-2026). */
export function toleranciaDelDiaKcal(objetivoKcal: number): number {
  return Math.max(BANDA_EN_OBJETIVO_MIN_KCAL, objetivoKcal * (BANDA_EN_OBJETIVO_PCT / 100));
}

/** ¿Ese día estuvo en su objetivo, con el margen de siempre? */
export function enObjetivo(a: AdherenciaPorKcal | null): boolean {
  return a !== null && Math.abs(a.comido.kcal - a.objetivo.kcal) <= toleranciaDelDiaKcal(a.objetivo.kcal);
}
