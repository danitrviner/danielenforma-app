import type { Recipe, FoodCategory, Macros } from '../types.js';
import type { LineaDiario } from './diarioCalorias.js';
import { recetaDesglosada } from './recetaDesglosada.js';
import { macrosDeLineas } from './macrosLegado.js';
import { parseBaseGrams } from './conversionNutricional.js';
import { foodNameWithoutGrams, addToPlaced } from './exchangeHelpers.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Editar una receta propia del atleta (cliente, 17-11-2026)

   «¿No puedo editar una receta? ¿Tengo que eliminarla y volverla a hacer? …
   quiero bajarle cantidades al queso de cabra y guardar otra vez la receta».

   Las recetas que guardan los atletas («Guardar como receta») son alimentos
   del banco con su gramaje en la etiqueta y una cantidad: «30g queso (…)» ×
   1,33 = 40 g; editar es cambiar esa cantidad. Las vinculadas (`vinculo`)
   llevan los gramos directamente. A 25-11-2026, 28 de las 41 recetas de
   atletas se pueden editar; las otras 13 mezclan productos guardados sin
   gramos (desde ahora se guardan con ellos: `gramosParaGuardar`).

   Las kcal y macros salen del mismo desglose con el que la receta entra en
   el diario: lo que se ve al editar es lo que luego se apunta.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface IngredienteEditable {
  /** Posición en `ingredients` (banco) o `vinculo.ingredientes[].n`. */
  n: number;
  nombre: string;
  gramos: number;
}

type Tipo = 'vinculo' | 'banco';

const vinculados = (r: Recipe) => (r.vinculo?.ingredientes ?? []).filter(i => i.alimentoId !== null && i.porCien && i.gramos > 0);

function tipoDe(r: Recipe): Tipo | null {
  if (vinculados(r).length > 0) return 'vinculo';
  const ings = r.ingredients ?? [];
  if (ings.length > 0 && ings.every(i => parseBaseGrams(i.foodLabel) != null)) return 'banco';
  return null;
}

const conMayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Nombre corto de un alimento del banco: «30g queso (curado, semicurado,
 *  cabra…)» → «Queso»; «10ml (1 cuchara) aceite (preferible AOVE)» → «Aceite». */
export function nombreCorto(label: string): string {
  const sinGramos = foodNameWithoutGrams(label).replace(/^\([^)]*\)\s*/, '');
  const corto = sinGramos.replace(/\s*\([^)]*\)?.*$/, '').trim();
  return conMayuscula(corto || sinGramos);
}

/** Los ingredientes que se pueden pesar, en el orden en que se apuntan. */
export function ingredientesEditables(r: Recipe): IngredienteEditable[] {
  const tipo = tipoDe(r);
  if (tipo === 'vinculo') {
    return vinculados(r).map(i => ({
      n: i.n,
      nombre: r.ingredientsText?.[i.n]?.name ?? r.ingredients?.[i.n]?.foodLabel ?? 'Ingrediente',
      gramos: i.gramos,
    }));
  }
  if (tipo === 'banco') {
    return (r.ingredients ?? []).map((i, n) => ({
      n,
      nombre: nombreCorto(i.foodLabel),
      gramos: Math.round(parseBaseGrams(i.foodLabel)! * i.quantity),
    }));
  }
  return [];
}

export function sePuedeEditar(r: Recipe | null | undefined, uid: string): boolean {
  return !!r && r.ownerId === uid && ingredientesEditables(r).length > 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La receta con esos gramos (n → gramos; 0 = quitado). */
export function recetaConGramos(r: Recipe, gramos: Readonly<Record<number, number>>): Recipe {
  const tipo = tipoDe(r);
  if (tipo === 'vinculo' && r.vinculo) {
    const quitado = (n: number) => gramos[n] != null && gramos[n] <= 0;
    return {
      ...r,
      vinculo: {
        ...r.vinculo,
        ingredientes: r.vinculo.ingredientes
          .filter(i => !quitado(i.n))
          .map(i => (gramos[i.n] != null ? { ...i, gramos: gramos[i.n] } : i)),
      },
      ...(r.ingredientsText ? { ingredientsText: r.ingredientsText.map((t, n) => (gramos[n] != null && !quitado(n) ? { ...t, quantity: gramos[n] } : t)) } : {}),
    };
  }
  if (tipo === 'banco') {
    return {
      ...r,
      ingredients: (r.ingredients ?? []).flatMap((i, n) => {
        const g = gramos[n];
        if (g == null) return [i];
        if (g <= 0) return [];
        return [{ ...i, quantity: r2(g / parseBaseGrams(i.foodLabel)!) }];
      }),
    };
  }
  return r;
}

let lineaTmp = 0;
/** kcal y macros de una receta tal y como entraría en el diario. */
function macrosDeDesglose(r: Recipe): Macros {
  return macrosDeLineas(recetaDesglosada(r, { nuevoLineaId: () => `editar_${++lineaTmp}` }).items);
}

export function macrosConGramos(r: Recipe, gramos: Readonly<Record<number, number>>): Macros {
  return macrosDeDesglose(recetaConGramos(r, gramos));
}

/** kcal de un ingrediente suelto con unos gramos. */
export function kcalDeIngrediente(r: Recipe, n: number, gramos: number): number {
  if (tipoDe(r) === 'vinculo') {
    const solo = { ...r, vinculo: { ...r.vinculo!, ingredientes: r.vinculo!.ingredientes.filter(i => i.n === n) } };
    return Math.round(macrosConGramos(solo, { [n]: gramos }).kcal);
  }
  // Del banco: se queda solo él, que pasa a ser el primero.
  const solo = { ...r, ingredients: (r.ingredients ?? []).filter((_, k) => k === n) };
  return Math.round(macrosConGramos(solo, { 0: gramos }).kcal);
}

/** Lo que hay que escribir en la receta para dejarla con esos gramos. */
export function cambiosConGramos(r: Recipe, gramos: Readonly<Record<number, number>>, nombre?: string): Partial<Recipe> {
  const nueva = recetaConGramos(r, gramos);
  const m = macrosDeDesglose(nueva);
  const totales = {
    macros: { prot: Math.round(m.p * 10) / 10, carb: Math.round(m.hc * 10) / 10, fat: Math.round(m.g * 10) / 10 },
    kcal: Math.round(m.kcal),
  };
  const renombre = nombre && nombre.trim() && nombre.trim() !== r.name ? { name: nombre.trim() } : {};
  if (tipoDe(r) === 'banco') {
    // `exchanges` sigue para los binarios viejos (igual que «Guardar como receta»).
    const placed: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    for (const i of nueva.ingredients ?? []) addToPlaced(placed, i.category, i.quantity);
    return { ...renombre, ingredients: nueva.ingredients, exchanges: { HC: r2(placed.HC), PROT: r2(placed.PROT), GRASA: r2(placed.GRASA) }, ...totales };
  }
  return {
    ...renombre,
    ...(nueva.vinculo ? { vinculo: nueva.vinculo } : {}),
    ...(nueva.ingredientsText ? { ingredientsText: nueva.ingredientsText } : {}),
    ...totales,
  };
}

/** Al guardar una comida como receta: los gramos y los valores por 100 g de
 *  cada alimento, para poder editarla después y que vuelva al diario con sus
 *  gramos. Sin esto, un producto escaneado o del catálogo se guardaba solo en
 *  intercambios (13 de las 41 recetas de atletas, 25-11-2026). `fijo`: el
 *  motor del menú no las reajusta. null si alguna línea no tiene gramos. */
export function gramosParaGuardar(lineas: readonly LineaDiario[], hoy: string): Pick<Recipe, 'vinculo' | 'ingredientsText'> | null {
  const ok = lineas.length > 0 && lineas.every(l => l.tipo !== 'plato' && (l.gramos ?? 0) > 0 && l.macros && l.kcal != null);
  if (!ok) return null;
  return {
    vinculo: {
      calculadoEn: hoy,
      ingredientes: lineas.map((l, n) => {
        const f = 100 / l.gramos!;
        return {
          n, alimentoId: `propio_${n}`, gramos: Math.round(l.gramos!), min: 0, max: Math.round(l.gramos! * 3), fijo: true,
          porCien: { kcal: l.kcal! * f, p: l.macros!.p * f, hc: l.macros!.hc * f, g: l.macros!.g * f },
        };
      }),
    },
    ingredientsText: lineas.map(l => ({ name: l.nombre, quantity: Math.round(l.gramos!) })),
  };
}
