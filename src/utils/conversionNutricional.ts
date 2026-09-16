import type { DietItem, MenuMeal, Recipe } from '../types';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';

/* ═══════════════════════════════════════════════════════════════════════════
   Gramos e intercambios: la única puerta

   Hay DOS cosas distintas que en esta app se llaman «gramos», y confundirlas
   es lo que descuadraba las cantidades del plan (auditoría §7-§9, reproducido
   con recetas reales el 15-09-2026 — ver docs/gramos-e-intercambios.md):

     · gramos de ALIMENTO — 40 g de pan son un intercambio. Salen del banco del
       atleta, donde el gramaje va escrito dentro del nombre ("40g pan (de
       molde…)"), y son distintos para cada alimento.
     · gramos de MACRO — 25 g de hidrato son un intercambio, sea de pan o de
       arroz. Son `GRAMS_PER_EXCHANGE`, iguales para todo.

   Lo que pasaba: `Recipe.exchanges` se calcula dividiendo los macros del PLATO
   ENTERO entre la segunda tabla, y luego la pantalla reconstruía los gramos de
   UN ingrediente multiplicando por la primera. Al pan de un sándwich se le
   atribuía todo el hidrato del relleno, y al arroz cocido se le aplicaba el
   gramaje del arroz crudo. Medido: 60 g de pan salían como 40, 50 o 70 g según
   la receta; 125 g de arroz cocido, como 37,5 g.

   La regla, decidida por Dani: MANDA EL GRAMAJE DE LA RECETA. El banco solo
   sirve para derivar gramos cuando el ítem no trae los suyos.

   Las dos conversiones viven aquí con nombres que dicen en voz alta cuál es
   cuál, para que no se puedan volver a mezclar sin darse cuenta.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Gramos que el banco del atleta asigna a un intercambio, leídos del nombre. */
export function parseBaseGrams(label: string): number | null {
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(g|ml|cc|kg|l)\b/i);
  if (!m) return null;
  let val = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg' || u === 'l') val *= 1000;
  return val;
}

// ── Sentido A: gramos → intercambios ────────────────────────────────────────

/**
 * Gramos de ALIMENTO → intercambios. 60 g de pan ÷ 40 g por intercambio = 1,5.
 *
 * NO es `intercambiosDeGramosDeMacro`. Parecen la misma división y no lo son:
 * ahí el divisor es el gramaje de ese alimento concreto, aquí son los 25/25/11
 * del macro. Ver la cabecera del módulo.
 */
export function intercambiosDeGramosDeAlimento(
  gramos: number,
  gramosPorIntercambio: number | null,
): number | null {
  if (gramosPorIntercambio == null || gramosPorIntercambio <= 0) return null;
  return gramos / gramosPorIntercambio;
}

/**
 * Gramos de MACRO → intercambios. 60 g de hidrato ÷ 25 = 2,4.
 *
 * NO es `intercambiosDeGramosDeAlimento`. Ver la cabecera del módulo.
 */
export function intercambiosDeGramosDeMacro(
  gramos: number,
  macro: 'HC' | 'PROT' | 'GRASA',
): number {
  return gramos / GRAMS_PER_EXCHANGE[macro];
}

// ── Sentido B: intercambios → gramos ────────────────────────────────────────

/** Intercambios → gramos de ALIMENTO. La inversa exacta de la de arriba. */
export function gramosDeIntercambios(intercambios: number, gramosPorIntercambio: number): number {
  return intercambios * gramosPorIntercambio;
}

// ── El peso de un ítem del plan ─────────────────────────────────────────────

/** De dónde han salido los gramos que se enseñan. */
export type FuenteDeGramos =
  | 'item'       // el ítem trae su propio gramaje: manda
  | 'banco'      // derivado del nombre del banco (todo lo guardado antes de 09-2026)
  | 'receta'     // es un plato entero: no tiene peso por ingrediente
  | 'sin-datos'; // ni gramaje propio ni gramos en el nombre

export interface PesoDeItem {
  /** Gramos de este ítem, o null si no se pueden saber sin inventarlos. */
  gramos: number | null;
  /** Gramos que pesa UN intercambio de este ítem. */
  porIntercambio: number | null;
  fuente: FuenteDeGramos;
}

type ItemPesable = Pick<DietItem, 'foodLabel' | 'quantity' | 'baseGrams' | 'originRecipeId'>;

/**
 * Cuánto pesa un ítem del plan. Único sitio de la app que decide de dónde
 * salen los gramos.
 *
 * El orden importa:
 *  1. Si el ítem trae `baseGrams`, ese manda — es el gramaje de SU receta.
 *  2. Si viene de una receta importada, NO tiene peso por ingrediente: la fila
 *     «HC» de un arroz con atún no pesa los 125 g del arroz, el plato pesa 400.
 *     Antes se le inventaba un peso desde el banco, y de ahí el 125 → 37,5.
 *  3. Si no, se deriva del nombre del banco, exactamente como hasta hoy. Es lo
 *     que mantiene igual todo lo ya guardado, sin migración.
 */
export function pesoDeItem(item: ItemPesable): PesoDeItem {
  const cantidad = item.quantity;

  if (item.baseGrams != null && item.baseGrams > 0) {
    return {
      gramos: redondearDecima(item.baseGrams * cantidad),
      porIntercambio: item.baseGrams,
      fuente: 'item',
    };
  }

  if (item.originRecipeId) {
    return { gramos: null, porIntercambio: null, fuente: 'receta' };
  }

  const base = parseBaseGrams(item.foodLabel);
  if (base == null) return { gramos: null, porIntercambio: null, fuente: 'sin-datos' };

  return { gramos: redondearDecima(base * cantidad), porIntercambio: base, fuente: 'banco' };
}

/**
 * Lo que se pinta junto al nombre: "60g", "1.2kg", o **nada**.
 *
 * Cadena vacía cuando no se sabe el peso, nunca un "×2": eso es lo que salía
 * antes en las recetas importadas, y a un atleta que mira un plato no le dice
 * absolutamente nada. Sin gramos, se abre la ficha, que sí los tiene bien.
 */
export function etiquetaDePeso(item: ItemPesable): string {
  const { gramos } = pesoDeItem(item);
  if (gramos == null) return '';
  return gramos >= 1000 ? `${(gramos / 1000).toFixed(1)}kg` : `${gramos}g`;
}

function redondearDecima(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Una comida del menú semanal → ítems del plan ────────────────────────────

/**
 * Convierte una comida del menú en los ítems que van al plan del atleta:
 * el plato a la escala servida, más los acompañamientos, más las raciones
 * extra de sus propios ingredientes.
 *
 * Existe porque había DOS formas de meter la misma comida y no coincidían
 * (auditoría §8.4, «20 intercambios salen 26»):
 *
 *   · Marcarla hecha en «Mi menú» sumaba `meal.exch` —ya escalado— con todos
 *     sus extras.
 *   · El botón «Añadir a mi plan» pasaba la receta CRUDA: sin la escala y sin
 *     un solo extra. Una comida a ×1,5 con pan entraba como el plato base.
 *
 * Ahora los dos caminos pasan por aquí. `paridadDeCaminos.test.ts` lo vigila.
 *
 * Se lee de `meal`, no de `recipe`, todo lo que el menú ya calculó: la escala
 * está aplicada en `exch`, y los gramos de las raciones extra vienen resueltos
 * contra el banco desde `menuEngine`. Recalcularlo aquí sería abrir otra vez la
 * puerta a que las dos cuentas se separen.
 */
export function itemsDeComidaDelMenu(recipe: Recipe, meal: MenuMeal): DietItem[] {
  const items: DietItem[] = [];

  // El plato. Una fila por categoría, como el resto de recetas importadas: sin
  // gramaje propio, porque la fila representa el plato entero y no un alimento.
  for (const cat of ['HC', 'PROT', 'GRASA'] as const) {
    const cantidad = meal.exch?.[cat] ?? 0;
    if (cantidad > 0) {
      items.push({
        category: cat,
        foodLabel: meal.recipeName || recipe.name,
        quantity: cantidad,
        originRecipeId: meal.recipeId || recipe.id,
      });
    }
  }

  // Los acompañamientos SÍ son alimentos del banco: llevan su gramaje.
  for (const c of meal.complements ?? []) {
    if (c.quantity <= 0) continue;
    items.push({
      category: c.category,
      foodLabel: c.foodLabel,
      quantity: c.quantity,
      baseGrams: parseBaseGrams(c.foodLabel) ?? undefined,
    });
  }

  // Más ración de un ingrediente del propio plato. `gramos` es el total que
  // hay que añadir, ya calculado contra el banco en menuEngine; aquí se guarda
  // por intercambio, que es como lo espera `pesoDeItem`.
  for (const r of meal.racionesExtra ?? []) {
    if (r.quantity <= 0) continue;
    items.push({
      category: r.category,
      foodLabel: `${r.nombre} (ración extra)`,
      quantity: r.quantity,
      baseGrams: r.gramos > 0 ? r.gramos / r.quantity : undefined,
    });
  }

  return items;
}
