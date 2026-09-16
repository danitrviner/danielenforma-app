import type { Diet, DietCompletionLog, DietMeal, FoodCategory } from '../types.js';
import { addToPlaced } from './exchangeHelpers.js';

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
 * `adherenciaPorIntercambios`.
 */
export function adherenciaDelDia(log: DietCompletionLog | null | undefined, diets: Diet[]): number | null {
  const total = totalItemsDelDia(log, diets);
  if (!log || total === 0) return null;
  return Math.min(100, (log.doneItemIds.length / total) * 100);
}

/** Categorías que cuentan para el cupo. Las MIX se reparten entre dos. */
const CATS_DE_CUPO: FoodCategory[] = ['HC', 'PROT', 'GRASA'];

export interface AdherenciaPorIntercambios {
  /** Intercambios comidos ÷ intercambios de cupo, en %. Puede pasar de 100. */
  pct: number;
  comidos: Record<'HC' | 'PROT' | 'GRASA', number>;
  cupo: Record<'HC' | 'PROT' | 'GRASA', number>;
}

/**
 * Adherencia del día medida en COMIDA, no en tics.
 *
 * Suma los intercambios de lo que el atleta marcó como comido y los divide
 * entre el cupo que tenía ese día. Un día en el que se come el 90 % de lo
 * pautado da 90 % aunque haya dejado ocho líneas sin tildar; uno en el que se
 * come el doble da 200 %, que es información y no un error —por eso NO se
 * recorta a 100: pasarse es un dato tan útil como quedarse corto, y taparlo
 * hace que un atleta que come de más se vea idéntico a uno que cumple.
 *
 * `null` cuando no hay cupo: sin objetivo no hay nada que cumplir.
 */
export function adherenciaPorIntercambios(
  log: DietCompletionLog | null | undefined,
  diets: Diet[],
): AdherenciaPorIntercambios | null {
  if (!log) return null;

  const cupoBruto = cupoDelDia(log, diets);
  const cupo = { HC: 0, PROT: 0, GRASA: 0 };
  for (const cat of Object.keys(cupoBruto) as FoodCategory[]) {
    addToPlaced(cupo as unknown as Record<FoodCategory, number>, cat, cupoBruto[cat] ?? 0);
  }
  const totalCupo = CATS_DE_CUPO.reduce((t, c) => t + cupo[c], 0);
  if (totalCupo <= 0) return null;

  const marcados = new Set(log.doneItemIds);
  const comidos = { HC: 0, PROT: 0, GRASA: 0 };
  for (const [i, comida] of comidasDelDia(log, diets).entries()) {
    comida.items.forEach((item, j) => {
      // El id de una línea es `${comida.id}_${índice}` — la misma convención
      // que usa la pantalla del atleta al marcar.
      if (!marcados.has(`${comida.id}_${j}`) && !marcados.has(`${i}_${j}`)) return;
      addToPlaced(comidos as unknown as Record<FoodCategory, number>, item.category, item.quantity);
    });
  }
  const totalComido = CATS_DE_CUPO.reduce((t, c) => t + comidos[c], 0);

  return {
    pct: Math.round((totalComido / totalCupo) * 1000) / 10,
    comidos, cupo,
  };
}

/** Margen dentro del cual un día se considera cumplido. */
export const BANDA_EN_OBJETIVO_PCT = 10;

/** ¿Ese día estuvo en su cupo, con el margen de siempre? */
export function enObjetivo(a: AdherenciaPorIntercambios | null): boolean {
  return a !== null && Math.abs(a.pct - 100) <= BANDA_EN_OBJETIVO_PCT;
}
