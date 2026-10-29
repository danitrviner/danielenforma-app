import type { DietMeal, FoodCategory } from '../types.js';
import { addToPlaced } from './exchangeHelpers.js';
import { exchangeToKcal, GRAMS_PER_EXCHANGE } from './nutritionConstants.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Calorías y macros de lo comido en un día (D-02)

   La otra cara del cupo de intercambios: lo mismo que el atleta ha apuntado,
   contado en kcal y gramos de macro. Un producto con nutrientes congelados
   suma esos números exactos; un alimento del banco, que aún no trae datos por
   100 g (llegan con N-04), se deriva de sus intercambios con los gramos de
   macro por intercambio de siempre y se marca como aproximado.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ResumenDelDia {
  kcal: number;
  p: number;
  hc: number;
  g: number;
  /** Alguna parte viene de intercambios, no de nutrientes declarados. */
  aproximado: boolean;
  /** Productos apuntados cuyos nutrientes no están completos: no suman. */
  incompletos: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * `doneItemIds` usa las claves del registro del día: `${mealId}_${posición}`.
 * Solo cuenta lo marcado como comido.
 */
export function resumenDelDia(meals: DietMeal[] | undefined, doneItemIds: Iterable<string>): ResumenDelDia {
  const hechos = new Set(doneItemIds);
  let kcal = 0; let p = 0; let hc = 0; let g = 0; let incompletos = 0;
  const banco: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  let hayBanco = false;

  for (const meal of meals ?? []) {
    (meal.items ?? []).forEach((item, idx) => {
      if (!hechos.has(`${meal.id}_${idx}`)) return;
      if (item.nutrientes === null) { incompletos++; return; }
      if (item.nutrientes) {
        kcal += item.nutrientes.kcal; p += item.nutrientes.p; hc += item.nutrientes.hc; g += item.nutrientes.g;
        return;
      }
      // Línea de continuación de un producto: sus nutrientes ya están en la primera.
      if (item.lineaId) return;
      addToPlaced(banco, item.category, item.quantity);
      hayBanco = true;
    });
  }

  if (hayBanco) {
    const vec = { HC: banco.HC, PROT: banco.PROT, GRASA: banco.GRASA };
    kcal += exchangeToKcal(vec);
    hc += vec.HC * GRAMS_PER_EXCHANGE.HC;
    p += vec.PROT * GRAMS_PER_EXCHANGE.PROT;
    g += vec.GRASA * GRAMS_PER_EXCHANGE.GRASA;
  }
  return { kcal: Math.round(kcal), p: r1(p), hc: r1(hc), g: r1(g), aproximado: hayBanco, incompletos };
}
