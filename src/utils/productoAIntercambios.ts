import type { BudgetVec, DietItem } from '../types.js';
import { exchangesFromMacros } from './exchangeRounding.js';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants.js';

/* ═══════════════════════════════════════════════════════════════════════════
   De un producto con sus macros a líneas de intercambios (D-02)

   El atleta escanea o elige un producto y dice cuántos gramos come. Se calcula
   cuánto aporta a cada categoría con las mismas reglas que las recetas
   (`exchangesFromMacros`: a cuartos, luego `snapExchanges`) y se reparte entre
   las categorías que toquen: un yogur proteico es «1 PROT + 0,25 GRASA», no
   «1 PROT» a secas. Una línea por categoría, enlazadas por `lineaId`.

   Sin datos completos no se inventa nada: `incompleto: true` y ninguna línea.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Valores por 100 g tal y como los declara el producto. `undefined` = no declarado. */
export interface MacrosPorCien { kcal?: number; p?: number; hc?: number; g?: number }

export interface Nutrientes { kcal: number; p: number; hc: number; g: number }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrientes de la ración, o `null` si falta alguno de los tres macros. */
export function nutrientesDeRacion(porCien: MacrosPorCien, gramos: number): Nutrientes | null {
  const { p, hc, g } = porCien;
  if (!(gramos > 0) || p == null || hc == null || g == null) return null;
  if ([p, hc, g].some(v => !Number.isFinite(v) || v < 0)) return null;
  const f = gramos / 100;
  const kcalPorCien = porCien.kcal != null && Number.isFinite(porCien.kcal) && porCien.kcal >= 0
    ? porCien.kcal
    : p * 4 + hc * 4 + g * 9;
  return { kcal: Math.round(kcalPorCien * f), p: r1(p * f), hc: r1(hc * f), g: r1(g * f) };
}

export interface ProductoApuntado {
  nombre: string;
  marca?: string;
  origen: NonNullable<DietItem['origen']>;
  gramos: number;
  porCien: MacrosPorCien;
  /** Id que enlaza las líneas del producto; lo genera quien llama. */
  lineaId: string;
  hora?: string;
  /** Fibra, azúcares, sal y micros de la ración; viajan en la primera línea. */
  extras?: DietItem['extras'];
}

export interface ResultadoProducto {
  items: DietItem[];
  nutrientes: Nutrientes | null;
  intercambios: BudgetVec;
  /** Faltan datos: no se ha creado ninguna línea. */
  incompleto: boolean;
}

export function itemsDeProducto(p: ProductoApuntado): ResultadoProducto {
  const nutrientes = nutrientesDeRacion(p.porCien, p.gramos);
  if (!nutrientes) {
    return { items: [], nutrientes: null, intercambios: { HC: 0, PROT: 0, GRASA: 0 }, incompleto: true };
  }
  const intercambios = exchangesFromMacros(
    { carb: nutrientes.hc, prot: nutrientes.p, fat: nutrientes.g },
    GRAMS_PER_EXCHANGE,
  );
  const items: DietItem[] = [];
  for (const category of ['HC', 'PROT', 'GRASA'] as const) {
    const quantity = intercambios[category];
    if (quantity <= 0) continue;
    items.push({
      category,
      foodLabel: p.nombre,
      quantity,
      origen: p.origen,
      lineaId: p.lineaId,
      ...(p.marca ? { marca: p.marca } : {}),
      ...(p.hora ? { hora: p.hora } : {}),
    });
  }
  // Gramos y nutrientes, una sola vez por producto: en la primera línea.
  if (items.length > 0) {
    items[0] = { ...items[0], gramos: p.gramos, nutrientes, ...(p.extras ? { extras: p.extras } : {}) };
  }
  return { items, nutrientes, intercambios, incompleto: false };
}
