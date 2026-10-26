import type { Diet, DietCompletionLog, DietItem, FoodCategory, Macros } from '../types';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';
import { MACROS_CERO, kcalDeGramos, sumarMacros } from './macros';

/* ═══════════════════════════════════════════════════════════════════════════
   Datos viejos en intercambios → kcal y macros (10-2026)

   Hasta 10-2026 todo se guardaba en intercambios: el cupo de la dieta
   (`budget`), el de cada día (`DietCompletionLog.budget`) y cada línea apuntada
   (`category` + `quantity`). No se migra nada a la fuerza: TODO el código lee
   por aquí, que traduce lo viejo con las equivalencias de siempre, y al guardar
   se escribe ya en kcal. Así los días e informes pasados dan lo mismo que antes.

   Equivalencias (las de siempre, utils/nutritionConstants.ts): 1 intercambio
   son 25 g de hidratos, 25 g de proteína u 11 g de grasa. Los mixtos son
   medio y medio: MIX_HC = ½ proteína + ½ hidratos; MIX_GRASA = ½ proteína +
   ½ grasa.

   Es el ÚNICO sitio que conoce esas equivalencias fuera de los motores que aún
   no se han pasado a kcal.
   ═══════════════════════════════════════════════════════════════════════════ */

type Vector = Partial<Record<FoodCategory, number>>;

/** Gramos de proteína, hidratos y grasa de unos intercambios. */
function gramosDeIntercambios(v: Vector): { p: number; hc: number; g: number } {
  const hc = (v.HC ?? 0) + (v.MIX_HC ?? 0) * 0.5;
  const p = (v.PROT ?? 0) + (v.MIX_HC ?? 0) * 0.5 + (v.MIX_GRASA ?? 0) * 0.5;
  const g = (v.GRASA ?? 0) + (v.MIX_GRASA ?? 0) * 0.5;
  return { p: p * GRAMS_PER_EXCHANGE.PROT, hc: hc * GRAMS_PER_EXCHANGE.HC, g: g * GRAMS_PER_EXCHANGE.GRASA };
}

/** kcal y macros de un vector de intercambios (un cupo, un objetivo por comida). */
export function macrosDeIntercambios(v: Vector | null | undefined): Macros {
  if (!v) return { ...MACROS_CERO };
  const g = gramosDeIntercambios(v);
  return { kcal: kcalDeGramos(g), ...g };
}

/** kcal de UN intercambio de una categoría (≈ 100). */
export function kcalDeIntercambio(cat: FoodCategory): number {
  return macrosDeIntercambios({ [cat]: 1 }).kcal;
}

/** Lo contrario, para seguir escribiendo `budget` mientras haya binarios
 *  viejos que solo saben leer intercambios. Sin mixtos: todo a HC/PROT/GRASA. */
export function intercambiosDeMacros(m: Macros): Record<FoodCategory, number> {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    HC: r2(m.hc / GRAMS_PER_EXCHANGE.HC),
    PROT: r2(m.p / GRAMS_PER_EXCHANGE.PROT),
    GRASA: r2(m.g / GRAMS_PER_EXCHANGE.GRASA),
    MIX_HC: 0,
    MIX_GRASA: 0,
  };
}

/**
 * kcal y macros de una línea apuntada.
 *  · Con `nutrientes`: los de la etiqueta, tal cual.
 *  · `nutrientes: null`: el producto no los declara completos → no suma.
 *  · Línea de continuación de un producto (`lineaId` sin nutrientes): sus
 *    datos ya van en la primera línea → no suma.
 *  · Si no, una línea vieja del banco: por sus intercambios.
 */
export function macrosDeLinea(item: DietItem): Macros {
  if (item.nutrientes === null) return { ...MACROS_CERO };
  if (item.nutrientes) return { ...item.nutrientes };
  if (item.lineaId) return { ...MACROS_CERO };
  return macrosDeIntercambios({ [item.category]: item.quantity });
}

export function macrosDeLineas(items: DietItem[]): Macros {
  return sumarMacros(...items.map(macrosDeLinea));
}

/** ¿La kcal de esta línea es una estimación por intercambios? */
export function esLineaAproximada(item: DietItem): boolean {
  return item.nutrientes === undefined && !item.lineaId;
}

/** El cupo viejo de un día, con los mixtos repartidos: igual que
 *  `kcalDeDieta` (semanasNutricion.ts), que es la respuesta oficial de
 *  `objetivoDelDia`. (El diario de antes los ignoraba; era la excepción.) */
function macrosDeCupo(budget: Vector | null | undefined): Macros {
  return macrosDeIntercambios(budget);
}

/** Objetivo del día de una dieta: el nuevo en kcal o, si es vieja, su cupo. */
export function objetivoDeDieta(diet: Pick<Diet, 'objetivo' | 'budget'> | null | undefined): Macros {
  if (!diet) return { ...MACROS_CERO };
  return diet.objetivo ? { ...diet.objetivo } : macrosDeCupo(diet.budget);
}

/** Objetivo congelado de un día apuntado, o null si el registro no lo trae. */
export function objetivoDelRegistro(log: Pick<DietCompletionLog, 'objetivo' | 'budget'> | null | undefined): Macros | null {
  if (!log) return null;
  if (log.objetivo) return { ...log.objetivo };
  return log.budget ? macrosDeCupo(log.budget) : null;
}
