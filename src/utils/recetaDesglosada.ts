import type { DietItem, DietMode, Recipe } from '../types';
import type { AlimentoCatalogo } from './catalogoAlimentos';
import { comoProducto, nombreDeAlimento } from './catalogoAlimentos';
import { itemsDeProducto } from './productoAIntercambios';
import { recipeToDietItems, ALL_DIET_MODES } from './exchangeHelpers';
import { emparejar, esIngredienteQueNoCuenta } from './recetaVinculada';
import { parseBaseGrams } from './conversionNutricional';

/* ═══════════════════════════════════════════════════════════════════════════
   Una receta apuntada ingrediente a ingrediente (modo «Calorías y macros»)

   Dani (25-10-2026): «las recetas que añadas deberían salirte segmentadas con
   los alimentos». En vez de un renglón «Pasta boloñesa · 5 int.», la comida
   enseña cada ingrediente con sus gramos y sus kcal, y se puede tocar uno a uno
   (menos aceite, más pasta) sin rehacer el plato.

   De dónde salen los ingredientes, de mejor a peor dato:
     1. `vinculo` — receta ya vinculada al catálogo por 100 g (Rápidas y las
        revisadas por Dani): gramos y macros exactos por ingrediente.
     2. `ingredients` del constructor — alimentos del banco con su gramaje.
     3. `ingredientsText` con gramos, emparejados con el catálogo. Solo si TODO
        lo que cuenta empareja con confianza alta o media: un ingrediente mal
        emparejado daría unas kcal falsas con aspecto de exactas.
   Si nada de eso sirve, la receta entra como plato entero (lo de siempre).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Desglose {
  items: DietItem[];
  /** false = no había datos para desglosar y va como plato entero. */
  desglosada: boolean;
}

export function recetaDesglosada(
  recipe: Recipe,
  opciones: { catalogo?: AlimentoCatalogo[]; nuevoLineaId: () => string; factor?: number; enabledModes?: DietMode[] },
): Desglose {
  const factor = opciones.factor && opciones.factor > 0 ? opciones.factor : 1;
  const receta = { id: recipe.id, nombre: recipe.name };
  const origen = { tipo: 'receta' as const, id: recipe.id };

  // 1 · Vinculada al catálogo.
  const vinculados = (recipe.vinculo?.ingredientes ?? []).filter(i => i.alimentoId !== null && i.porCien && i.gramos > 0);
  if (vinculados.length > 0) {
    const porId = new Map((opciones.catalogo ?? []).map(a => [a.id, a]));
    const items = vinculados.flatMap(ing => {
      const alimento = ing.alimentoId ? porId.get(ing.alimentoId) : undefined;
      const nombre = recipe.ingredientsText?.[ing.n]?.name
        ?? (alimento ? nombreDeAlimento(alimento) : undefined)
        ?? recipe.ingredients?.[ing.n]?.foodLabel
        ?? 'Ingrediente';
      return itemsDeProducto({
        nombre, gramos: Math.round(ing.gramos * factor), lineaId: opciones.nuevoLineaId(), origen, porCien: ing.porCien!,
      }).items.map(it => ({ ...it, receta }));
    });
    if (items.length > 0) return { items, desglosada: true };
  }

  // 2 · Receta del constructor: cada ingrediente ya es un alimento del banco.
  const estructurados = (recipe.ingredients ?? [])
    .filter(ing => !opciones.enabledModes || opciones.enabledModes.includes(ing.mode))
    .filter(ing => parseBaseGrams(ing.foodLabel) != null);
  if (estructurados.length > 0 && estructurados.length === (recipe.ingredients ?? []).length) {
    const items = recipeToDietItems(recipe, opciones.enabledModes ?? (recipe.ingredients ?? []).map(i => i.mode))
      .map(it => ({ ...it, quantity: Math.round(it.quantity * factor * 100) / 100, receta, origen }));
    if (items.length > 0) return { items, desglosada: true };
  }

  // 3 · Ingredientes con gramos, emparejados con el catálogo.
  const conGramos = (recipe.ingredientsText ?? []).filter(i => Number.isFinite(i.quantity) && i.quantity > 0);
  if (conGramos.length > 0 && opciones.catalogo && opciones.catalogo.length > 0) {
    const cuentan = conGramos.filter(i => !esIngredienteQueNoCuenta(i.name));
    const emparejados = cuentan.map(i => ({ ing: i, ...emparejar(i.name, opciones.catalogo!) }));
    const fiables = emparejados.every(e => e.alimento && (e.confianza === 'alta' || e.confianza === 'media'));
    if (fiables && emparejados.length > 0) {
      const items = emparejados.flatMap(({ ing, alimento }) => {
        const prod = comoProducto(alimento!);
        return itemsDeProducto({
          nombre: ing.name, gramos: Math.round(ing.quantity * factor), lineaId: opciones.nuevoLineaId(), origen,
          porCien: { kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g },
        }).items.map(it => ({ ...it, receta }));
      });
      if (items.length > 0) return { items, desglosada: true };
    }
  }

  return { items: recipeToDietItems(recipe, opciones.enabledModes ?? ALL_DIET_MODES), desglosada: false };
}

/** ¿Hace falta bajar la receta completa? Las del índice del recetario traen los
 *  ingredientes sin cantidades, y sin cantidades no hay desglose posible. */
export function faltanCantidades(recipe: Recipe): boolean {
  if ((recipe.vinculo?.ingredientes ?? []).length > 0) return false;
  if ((recipe.ingredients ?? []).length > 0) return false;
  const txt = recipe.ingredientsText ?? [];
  return txt.length === 0 || txt.some(i => !Number.isFinite(i.quantity));
}
