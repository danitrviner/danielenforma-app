import type { DietItem, DietMeal } from '../types';
import { resumenDelDia } from './resumenDelDia';
import { exchangeToKcal } from './nutritionConstants';

/* ═══════════════════════════════════════════════════════════════════════════
   El Diario en modo «Calorías y macros» (Dani, 25-10-2026)

   Mismo registro del día que el modo Intercambios, contado y enseñado como un
   diario de calorías: cada comida lista SOLO lo que el atleta ha apuntado (lo
   sembrado del plan del coach sin marcar no sale: eso vive en la vista «Plan»)
   y cada línea dice sus gramos y sus kcal.

   Aquí no se habla de intercambios: el reparto por comidas también es en kcal.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LineaDiario {
  /** Clave estable para React: `${mealId}_${primer índice}`. */
  clave: string;
  /** Posiciones en `meal.items` que forman la línea (un producto son varias). */
  idxs: number[];
  nombre: string;
  marca?: string;
  gramos?: number;
  /** null = el producto no declara sus nutrientes completos: no suma. */
  kcal: number | null;
  macros: { p: number; hc: number; g: number } | null;
  /** Viene de intercambios del banco, no de datos declarados. */
  aproximado: boolean;
  /** Ingrediente de una receta apuntada desglosada. */
  receta?: { id: string; nombre: string };
  /** `plato` = una receta entera sin desglose (las del recetario sin cantidades
   *  o las que llegan de «Mi menú»): no se edita por gramos. */
  tipo: 'alimento' | 'producto' | 'plato';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** kcal y macros de unas líneas del banco, a partir de sus intercambios. */
function desdeIntercambios(items: DietItem[]) {
  // Sin `lineaId` ni `nutrientes`: aquí se quiere la cuenta por intercambios de
  // todas, y `resumenDelDia` se saltaría las de continuación.
  const limpios = items.map(({ lineaId: _l, nutrientes: _n, ...resto }) => resto);
  const r = resumenDelDia([{ id: 'x', name: 'x', items: limpios } as DietMeal], limpios.map((_, i) => `x_${i}`));
  return { kcal: r.kcal, macros: { p: r.p, hc: r.hc, g: r.g } };
}

/**
 * Las líneas que se ven en una comida: lo comido, agrupado como lo entiende el
 * atleta (un producto repartido en categorías es UNA línea; un plato entero
 * del recetario, también).
 */
export function lineasDelDiario(
  meal: DietMeal,
  hechos: ReadonlySet<string>,
  nombreDeReceta: (id: string) => string | undefined = () => undefined,
): LineaDiario[] {
  const out: LineaDiario[] = [];
  const usados = new Set<number>();
  const items = meal.items ?? [];

  items.forEach((item, idx) => {
    if (usados.has(idx) || !hechos.has(`${meal.id}_${idx}`)) return;

    // Producto (o alimento por 100 g): todas sus líneas por categoría juntas.
    if (item.lineaId) {
      const idxs = items
        .map((it, i) => (it.lineaId === item.lineaId && hechos.has(`${meal.id}_${i}`) ? i : -1))
        .filter(i => i >= 0);
      idxs.forEach(i => usados.add(i));
      const primera = items[idxs.find(i => items[i].nutrientes !== undefined) ?? idxs[0]];
      const n = primera.nutrientes;
      const calculado = n === undefined ? desdeIntercambios(idxs.map(i => items[i])) : null;
      out.push({
        clave: `${meal.id}_${idx}`,
        idxs,
        nombre: primera.foodLabel,
        ...(primera.marca ? { marca: primera.marca } : {}),
        ...(primera.gramos ? { gramos: Math.round(primera.gramos) } : {}),
        kcal: n === null ? null : n ? n.kcal : calculado!.kcal,
        macros: n === null ? null : n ? { p: n.p, hc: n.hc, g: n.g } : calculado!.macros,
        aproximado: n === undefined,
        ...(primera.receta ? { receta: primera.receta } : {}),
        tipo: 'producto',
      });
      return;
    }

    // Plato entero (receta sin ingredientes con gramaje): sus líneas por
    // categoría son el mismo plato.
    if (item.originRecipeId && item.baseGrams == null && !item.receta) {
      const idxs = items
        .map((it, i) => (
          it.originRecipeId === item.originRecipeId && it.baseGrams == null && !it.receta && !it.lineaId
          && hechos.has(`${meal.id}_${i}`) && !usados.has(i) ? i : -1))
        .filter(i => i >= 0);
      idxs.forEach(i => usados.add(i));
      const { kcal, macros } = desdeIntercambios(idxs.map(i => items[i]));
      out.push({
        clave: `${meal.id}_${idx}`,
        idxs,
        nombre: nombreDeReceta(item.originRecipeId) ?? item.foodLabel,
        kcal, macros, aproximado: true, tipo: 'plato',
      });
      return;
    }

    usados.add(idx);
    const gramos = item.baseGrams && item.quantity > 0 ? Math.round(item.baseGrams * item.quantity) : undefined;
    const { kcal, macros } = desdeIntercambios([item]);
    // Un ingrediente de una receta del constructor (antes de existir `receta`)
    // también se agrupa bajo su plato.
    const receta = item.receta
      ?? (item.originRecipeId ? { id: item.originRecipeId, nombre: nombreDeReceta(item.originRecipeId) ?? 'Receta' } : undefined);
    out.push({
      clave: `${meal.id}_${idx}`,
      idxs: [idx],
      nombre: item.foodLabel,
      ...(gramos ? { gramos } : {}),
      kcal, macros, aproximado: true,
      ...(receta ? { receta } : {}),
      tipo: 'alimento',
    });
  });

  return out;
}

export function kcalDeLineas(lineas: LineaDiario[]): number {
  return Math.round(lineas.reduce((s, l) => s + (l.kcal ?? 0), 0));
}

export function macrosDeLineas(lineas: LineaDiario[]): { p: number; hc: number; g: number } {
  const t = lineas.reduce((a, l) => (l.macros ? { p: a.p + l.macros.p, hc: a.hc + l.macros.hc, g: a.g + l.macros.g } : a), { p: 0, hc: 0, g: 0 });
  return { p: r1(t.p), hc: r1(t.hc), g: r1(t.g) };
}

/** Enteros que suman exactamente 100 (resto mayor). */
function aCien(pesos: number[]): number[] {
  const total = pesos.reduce((s, p) => s + p, 0);
  if (pesos.length === 0) return [];
  if (!(total > 0)) return aCien(pesos.map(() => 1));
  const exactos = pesos.map(p => (p / total) * 100);
  const base = exactos.map(Math.floor);
  let falta = 100 - base.reduce((s, b) => s + b, 0);
  const orden = exactos.map((e, i) => ({ i, resto: e - Math.floor(e) })).sort((a, b) => b.resto - a.resto);
  for (const { i } of orden) { if (falta <= 0) break; base[i]++; falta--; }
  return base;
}

/**
 * Reparto por defecto, en % del día: el que ya tenía la dieta por comidas
 * pasado a kcal, y si no tenía ninguno, a partes iguales.
 */
export function repartoKcalPorDefecto(meals: DietMeal[]): number[] {
  const pesos = meals.map(m => (m.target ? exchangeToKcal({ HC: m.target.HC ?? 0, PROT: m.target.PROT ?? 0, GRASA: m.target.GRASA ?? 0 }) : 0));
  return aCien(pesos.some(p => p > 0) ? pesos : meals.map(() => 1));
}

/** El reparto guardado por el atleta si casa con las comidas de hoy; si no, el de por defecto. */
export function repartoKcalVigente(meals: DietMeal[], guardado?: number[] | null): number[] {
  if (guardado && guardado.length === meals.length && guardado.every(n => Number.isFinite(n) && n >= 0)
    && guardado.reduce((s, n) => s + n, 0) === 100) return guardado;
  return repartoKcalPorDefecto(meals);
}

export function kcalPorComida(kcalObjetivo: number, porcentajes: number[]): number[] {
  return porcentajes.map(p => Math.round((kcalObjetivo * p) / 100));
}
