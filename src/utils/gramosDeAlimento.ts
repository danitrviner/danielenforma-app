import type { DietItem, MealItem } from '../types.js';
import { parseBaseGrams } from './conversionNutricional.js';
import { itemsDeProducto, nutrientesDeRacion, type Nutrientes } from './productoAIntercambios.js';
import { resumenDelDia } from './resumenDelDia.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Apuntar un alimento por gramos (D-03, modo «Calorías y macros»)

   Dos casos, según lo que sepamos del alimento:
     · Personal con macros por 100 g (`porCien`): producto con datos reales →
       `itemsDeProducto` (kcal y macros exactos, líneas por categoría).
     · Del banco: solo conocemos sus gramos por intercambio. Se guarda UNA línea
       con `quantity = gramos / gramos por intercambio` (sin redondear a
       cuartos) y los kcal/macros salen de sus intercambios, marcados como
       aproximados hasta que lleguen los datos por 100 g (N-04).
   Sin gramos por intercambio legibles no se puede pedir gramos: devuelve null
   y la pantalla cae al intercambio de siempre.
   ═══════════════════════════════════════════════════════════════════════════ */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Gramos que son un intercambio de este alimento, si se pueden saber. */
export function gramosPorIntercambioDe(food: MealItem): number | null {
  if (food.gramosPorIntercambio && food.gramosPorIntercambio > 0) return food.gramosPorIntercambio;
  return parseBaseGrams(food.label);
}

/** ¿Se puede apuntar este alimento en gramos? */
export function sePuedeEnGramos(food: MealItem): boolean {
  return (!!food.personal && !!food.porCien) || gramosPorIntercambioDe(food) != null;
}

/** Gramos con los que arranca la ficha: el de siempre, o el de un intercambio. */
export function gramosSugeridos(food: MealItem, ultimos?: number): number {
  if (ultimos && ultimos > 0) return ultimos;
  return Math.round(gramosPorIntercambioDe(food) ?? 100);
}

export interface PrevisionGramos {
  nutrientes: Nutrientes | null;
  /** Viene de intercambios, no de datos declarados. */
  aproximado: boolean;
}

export function previsionDeGramos(food: MealItem, gramos: number): PrevisionGramos {
  if (!(gramos > 0)) return { nutrientes: null, aproximado: false };
  if (food.personal && food.porCien) {
    const { kcal, hc, prot, grasa } = food.porCien;
    return { nutrientes: nutrientesDeRacion({ kcal, hc, p: prot, g: grasa }, gramos), aproximado: false };
  }
  const base = gramosPorIntercambioDe(food);
  if (!base) return { nutrientes: null, aproximado: true };
  const r = resumenDelDia(
    [{ id: 'x', name: 'x', items: [{ category: food.category, foodLabel: food.label, quantity: gramos / base }] }] as never,
    ['x_0'],
  );
  return { nutrientes: { kcal: r.kcal, p: r.p, hc: r.hc, g: r.g }, aproximado: true };
}

/** Las líneas del día para este alimento y estos gramos. `lineaId` solo se usa en productos. */
export function itemsDeAlimentoPorGramos(
  food: MealItem,
  gramos: number,
  lineaId: string,
  hora?: string,
): DietItem[] {
  if (food.personal && food.porCien) {
    const { kcal, hc, prot, grasa } = food.porCien;
    const r = itemsDeProducto({
      nombre: food.label, gramos, lineaId, ...(hora ? { hora } : {}),
      origen: { tipo: 'personal', id: food.id },
      porCien: { kcal, hc, p: prot, g: grasa },
    });
    if (r.items.length > 0) return r.items;
  }
  const base = gramosPorIntercambioDe(food) ?? gramos;
  return [{
    category: food.category,
    foodLabel: food.label,
    quantity: Math.max(0.01, r2(gramos / base)),
    baseGrams: base,
    origen: { tipo: food.personal ? 'personal' : 'catalogo', id: food.id },
    ...(hora ? { hora } : {}),
  }];
}
