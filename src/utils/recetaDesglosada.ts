import type { DietItem, DietMode, Recipe } from '../types';
import type { AlimentoCatalogo } from './catalogoAlimentos';
import { nombreDeAlimento } from './catalogoAlimentos';
import { itemsDeProducto } from './productoAIntercambios';
import { recipeToDietItems, ALL_DIET_MODES } from './exchangeHelpers';
import { emparejar, esIngredienteQueNoCuenta } from './recetaVinculada';
import { parseBaseGrams } from './conversionNutricional';
import { macrosDeReceta } from './macrosDeReceta';
import { kcalDeGramos } from './macros';
import { alimentoGeneral } from './alimentosGenerales';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';

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
     3. `ingredientsText` con gramos (los traen todas las recetas completas).
        Lo que empareja seguro con el catálogo lleva sus valores; lo demás se
        reparte lo que falta hasta las kcal y macros de la receta, así el
        total es siempre el de la receta (Dani, 26-10-2026: «esta receta
        debería mostrar los alimentos dentro de la misma comida»).
   Si nada de eso sirve, la receta entra como plato entero.
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

  // 3 · Ingredientes con gramos (los traen todas las recetas completas).
  const conGramos = (recipe.ingredientsText ?? []).filter(i => Number.isFinite(i.quantity) && i.quantity > 0);
  const cuentan = conGramos.filter(i => !esIngredienteQueNoCuenta(i.name));
  if (cuentan.length > 0) {
    const repartidos = repartirReceta(recipe, cuentan, opciones.catalogo?.length ? opciones.catalogo : catalogoGenerico());
    if (repartidos) {
      const items = repartidos.flatMap(({ nombre, gramos, porCien }) => lineasDeIngrediente(
        { nombre, gramos: Math.round(gramos * factor), lineaId: opciones.nuevoLineaId(), origen, porCien },
      ).map(it => ({ ...it, receta })));
      if (items.length > 0) return { items, desglosada: true };
    }
  }

  return { items: recipeToDietItems(recipe, opciones.enabledModes ?? ALL_DIET_MODES), desglosada: false };
}

type MacrosPorCien = { kcal: number; p: number; hc: number; g: number };

/** Las líneas de un ingrediente. Uno que no llega a un cuarto de ración de
 *  nada (30 g de cebolla) se queda igual en su línea: si no, desaparecería de
 *  la comida y sus kcal con él. */
function lineasDeIngrediente(p: { nombre: string; gramos: number; lineaId: string; origen: DietItem['origen']; porCien: MacrosPorCien }): DietItem[] {
  const r = itemsDeProducto(p);
  if (r.items.length > 0 || !r.nutrientes) return r.items;
  const n = r.nutrientes;
  const category = n.p * 4 >= n.hc * 4 && n.p * 4 >= n.g * 9 ? 'PROT' : n.g * 9 > n.hc * 4 ? 'GRASA' : 'HC';
  return [{ category, foodLabel: p.nombre, quantity: 0, origen: p.origen, lineaId: p.lineaId, gramos: p.gramos, nutrientes: n }];
}

/** Los alimentos generales de la app como catálogo por 100 g: lo que se usa
 *  para emparejar si no hay catálogo cargado (sin conexión, banco de pruebas). */
let genericos: AlimentoCatalogo[] | null = null;
function catalogoGenerico(): AlimentoCatalogo[] {
  if (genericos) return genericos;
  const vistos = new Set<string>();
  genericos = SYSTEM_FOODS.filter(f => f.mode !== 'SIN_PESAR').map(alimentoGeneral).flatMap(a => {
    if (!a.porCien || vistos.has(a.nombre)) return [];
    vistos.add(a.nombre);
    return [{ id: `sistema_${a.food.id}`, nombre: a.nombre, porCien: { kcal: a.porCien.kcal, p: a.porCien.p, hc: a.porCien.hc, g: a.porCien.g } }];
  });
  return genericos;
}

/* Perfil típico por 100 g de cada familia de alimento. Solo sirve para
   REPARTIR el total de la receta entre los ingredientes que no emparejan seguro
   (que las nueces se lleven la grasa y no la leche); las cifras finales salen
   del total de la receta. El primero que encaja manda. */
const PERFILES: [RegExp, { p: number; hc: number; g: number }][] = [
  [/aceite|mantequilla|manteca/, { p: 0, hc: 0, g: 100 }],
  [/whey|prote[ií]na en polvo|caseina/, { p: 78, hc: 8, g: 5 }],
  [/nuez|nueces|almendra|avellana|anacardo|pistacho|cacahuete|pipas|semillas|ch[ií]a|crema de/, { p: 18, hc: 12, g: 55 }],
  [/chocolate|cacao/, { p: 8, hc: 45, g: 35 }],
  [/queso fresco|batido|reques[oó]n|skyr|yogur/, { p: 9, hc: 4, g: 2 }],
  [/queso/, { p: 25, hc: 2, g: 27 }],
  [/leche|bebida de/, { p: 3.3, hc: 4.8, g: 3 }],
  [/huevo|clara/, { p: 12.5, hc: 0.7, g: 9.5 }],
  [/pollo|pavo|ternera|cerdo|lomo|carne|jam[oó]n|at[uú]n|salm[oó]n|merluza|bacalao|pescado|gamba|langostino|tofu|seit[aá]n|soja texturizada/, { p: 22, hc: 1, g: 5 }],
  [/garbanzo|lenteja|alubia|jud[ií]a blanca|guisante|edamame|hummus/, { p: 8, hc: 18, g: 3 }],
  [/arroz|pasta|macarr|espagueti|fideo|cusc[uú]s|quinoa|avena|copos|cereal|harina|pan|tortita|tortilla de trigo|wrap|biscote|galleta|ma[ií]z/, { p: 9, hc: 72, g: 3 }],
  [/patata|boniato|yuca/, { p: 2, hc: 18, g: 0.2 }],
  [/miel|az[uú]car|sirope|mermelada|d[aá]til/, { p: 0.5, hc: 78, g: 0 }],
  [/pl[aá]tano|manzana|pera|fresa|ar[aá]ndano|frambuesa|mango|pi[ñn]a|naranja|kiwi|uva|melocot[oó]n|fruta|sand[ií]a|mel[oó]n/, { p: 1, hc: 14, g: 0.3 }],
];
const PERFIL_VERDURA = { p: 1.5, hc: 4, g: 0.3 };

function perfilDe(nombre: string): { p: number; hc: number; g: number } {
  const n = nombre.toLowerCase();
  return PERFILES.find(([re]) => re.test(n))?.[1] ?? PERFIL_VERDURA;
}

/**
 * Valores por 100 g de cada ingrediente, de forma que entre todos sumen las
 * kcal y los macros de la RECETA (que es el dato bueno).
 *
 * Los que emparejan seguro con el catálogo llevan sus valores. Lo que les falta
 * a esos para llegar al total de la receta se reparte entre los demás, macro a
 * macro, en proporción a lo que aportaría cada uno según su familia
 * (`PERFILES`): las nueces se llevan la grasa, no la leche.
 * Null si la receta no trae sus macros y algo no empareja: no hay con qué cuadrar.
 */
function repartirReceta(
  recipe: Recipe,
  ingredientes: { name: string; quantity: number }[],
  catalogo: AlimentoCatalogo[],
): { nombre: string; gramos: number; porCien: MacrosPorCien }[] | null {
  const emparejados = ingredientes.map(i => ({ ing: i, ...emparejar(i.name, catalogo) }));
  const seguro = (e: typeof emparejados[number]) => !!e.alimento && (e.confianza === 'alta' || e.confianza === 'media');
  const deCatalogo = (e: typeof emparejados[number]): MacrosPorCien => {
    const c = e.alimento!.porCien;
    return { kcal: c.kcal, p: c.p, hc: c.hc, g: c.g };
  };
  if (emparejados.every(seguro)) {
    return emparejados.map(e => ({ nombre: e.ing.name, gramos: e.ing.quantity, porCien: deCatalogo(e) }));
  }
  const total = macrosDeReceta(recipe);
  if (!(total.kcal > 0)) return null;

  const aporte = (por: MacrosPorCien, gramos: number) => ({ p: por.p * gramos / 100, hc: por.hc * gramos / 100, g: por.g * gramos / 100 });
  const fijos = emparejados.filter(seguro);
  const resto = emparejados.filter(e => !seguro(e));
  const puesto = { p: 0, hc: 0, g: 0 };
  for (const e of fijos) {
    const a = aporte(deCatalogo(e), e.ing.quantity);
    puesto.p += a.p; puesto.hc += a.hc; puesto.g += a.g;
  }
  const falta = { p: Math.max(0, total.p - puesto.p), hc: Math.max(0, total.hc - puesto.hc), g: Math.max(0, total.g - puesto.g) };
  const reparto = (['p', 'hc', 'g'] as const).map(k => {
    const pesos = resto.map(e => perfilDe(e.ing.name)[k] * e.ing.quantity / 100);
    const suma = pesos.reduce((s, v) => s + v, 0);
    const porGramos = resto.map(e => e.ing.quantity);
    const sumaG = porGramos.reduce((s, v) => s + v, 0);
    return resto.map((_, i) => (suma > 0 ? falta[k] * pesos[i] / suma : sumaG > 0 ? falta[k] * porGramos[i] / sumaG : 0));
  });
  return emparejados.map(e => {
    if (seguro(e)) return { nombre: e.ing.name, gramos: e.ing.quantity, porCien: deCatalogo(e) };
    const i = resto.indexOf(e);
    const f = 100 / e.ing.quantity;
    const g = { p: reparto[0][i] * f, hc: reparto[1][i] * f, g: reparto[2][i] * f };
    return { nombre: e.ing.name, gramos: e.ing.quantity, porCien: { kcal: kcalDeGramos(g), ...g } };
  });
}

/** ¿Hace falta bajar la receta completa? Las del índice del recetario traen los
 *  ingredientes sin cantidades, y sin cantidades no hay desglose posible. */
export function faltanCantidades(recipe: Recipe): boolean {
  if ((recipe.vinculo?.ingredientes ?? []).length > 0) return false;
  if ((recipe.ingredients ?? []).length > 0) return false;
  const txt = recipe.ingredientsText ?? [];
  return txt.length === 0 || txt.some(i => !Number.isFinite(i.quantity));
}
