import type { DietType, FoodCategory, Macros, MenuComplement } from '../types.js';
import { nombreDeAlimento, type AlimentoCatalogo } from './catalogoAlimentos.js';
import {
  DAIRY_KEYWORDS, FRUIT_KEYWORDS, NUT_KEYWORDS, NUNCA_AUTOMATICO, READY_HC_KEYWORDS,
  labelIncludesAny, nombreVetadoPorCondicion,
} from './menuComplements.js';
import { normalizeStr } from './foodPrefs.js';
import { sinNegativos, restarMacros } from './macros.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Extras del catálogo por 100 g (Dani, 28-10-2026)

   «Ahora sabemos cuál es el peso medio de un plátano: que se use esa referencia
   en vez de la general de antes.» Los acompañamientos que cierran una comida
   salen del catálogo de alimentos (utils/catalogoAlimentos.ts), no del banco
   de intercambios: fruta, lácteo, pan y frutos secos, en gramos reales y en
   PIEZAS (enteras o medias) cuando el alimento tiene medida casera. Los macros
   son los de esos gramos exactos.

   Lo que una pieza no llega a cubrir no se inventa: el generador lo arrastra a
   la comida siguiente (menuEngine.finalizeDay).
   ═══════════════════════════════════════════════════════════════════════════ */

export type FamiliaDeExtra = 'fruta' | 'lacteo' | 'pan' | 'frutoSeco';

/** Piezas: de media en media, hasta tres. */
export const PASO_PIEZAS = 0.5;
export const MAX_PIEZAS = 3;
/** Sin medida casera, en gramos de 25 en 25. */
export const PASO_GRAMOS = 25;
export const MIN_GRAMOS = 50;
export const MAX_GRAMOS = 300;
/** Un extra de menos kcal no vale la pena como línea aparte. */
export const MIN_KCAL_EXTRA = 30;
/** Hasta aquí puede pasarse un extra de cada macro del hueco que tapa (gramos). */
export const TOLERANCIA_G = 3;

const FRUTA_MAS = ['frambuesa', 'arandano', 'arándano', 'granada', 'pomelo', 'paraguayo', 'uvas', 'pasas', 'orejones'];
const FRUTO_SECO_MAS = ['almendra', 'nuez', 'nueces', 'anacardo', 'pistacho', 'avellana', 'cacahuete'];
const LACTEO_MAS = ['kefir', 'kéfir'];
/** Nunca son un extra que proponer solo: bebidas, zumos, cremas de untar, harinas, salsas, aceites. */
const NO_ES_EXTRA = ['zumo', 'bebida', 'crema de', 'harina', 'salsa', 'aceite', 'rallado', 'leche', 'proteina en polvo', 'whey'];

/** A qué familia de extras pertenece un alimento del catálogo; null si no es un extra. */
export function familiaDeExtra(a: AlimentoCatalogo): FamiliaDeExtra | null {
  const n = a.nombre;
  if (a.estado && a.estado !== 'listo') return null;          // crudo, cocido, seco, escurrido: hay que cocinar o no es «de nevera»
  if (labelIncludesAny(n, NO_ES_EXTRA) || labelIncludesAny(n, NUNCA_AUTOMATICO)) return null;
  if (labelIncludesAny(n, [...FRUIT_KEYWORDS, ...FRUTA_MAS])) return 'fruta';
  if (labelIncludesAny(n, [...DAIRY_KEYWORDS, ...LACTEO_MAS])) return 'lacteo';
  if (labelIncludesAny(n, [...NUT_KEYWORDS, ...FRUTO_SECO_MAS])) return 'frutoSeco';
  if (labelIncludesAny(n, READY_HC_KEYWORDS.filter(k => k !== 'frutas deshidratadas'))) return 'pan';
  return null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** kcal y gramos de `gramos` de un alimento del catálogo. */
export function macrosDeAlimento(a: Pick<AlimentoCatalogo, 'porCien'>, gramos: number): Macros {
  const f = gramos / 100;
  return { kcal: Math.round(a.porCien.kcal * f), p: r1(a.porCien.p * f), hc: r1(a.porCien.hc * f), g: r1(a.porCien.g * f) };
}

/** Grupo del banco al que equivale, para lo que todavía lee por grupos. */
export function categoriaDeExtra(a: AlimentoCatalogo): FoodCategory {
  const fam = familiaDeExtra(a);
  if (fam === 'frutoSeco') return 'GRASA';
  if (fam === 'lacteo') return a.porCien.p >= a.porCien.hc ? 'PROT' : 'MIX_HC';
  return 'HC';
}

/** Un extra del catálogo servido en `gramos` (y en piezas si tiene medida casera). */
export function extraDeCatalogo(a: AlimentoCatalogo, gramos: number): MenuComplement {
  const piezas = a.unidad ? Math.round((gramos / a.unidad.gramos) / PASO_PIEZAS) * PASO_PIEZAS : undefined;
  return {
    foodLabel: nombreDeAlimento(a),
    category: categoriaDeExtra(a),
    // 0 a propósito: los binarios viejos cuentan por raciones del banco y este
    // extra no es del banco. Los nuevos leen `macros`.
    quantity: 0,
    alimentoId: a.id,
    gramos: Math.round(gramos),
    ...(piezas && piezas > 0 ? { piezas, unidad: a.unidad!.nombre } : {}),
    macros: macrosDeAlimento(a, gramos),
  };
}

export const esExtraDelCatalogo = (c: MenuComplement): boolean => !!c.alimentoId && !!c.macros;

/** Las cantidades en que se puede servir: piezas de ½ en ½, o gramos de 25 en 25. */
export function gramosPosibles(a: AlimentoCatalogo): number[] {
  if (a.unidad) {
    const out: number[] = [];
    for (let p = PASO_PIEZAS; p <= MAX_PIEZAS + 1e-9; p += PASO_PIEZAS) out.push(Math.round(p * a.unidad.gramos));
    return out;
  }
  const out: number[] = [];
  for (let g = MIN_GRAMOS; g <= MAX_GRAMOS; g += PASO_GRAMOS) out.push(g);
  return out;
}

/** La cantidad siguiente o anterior a `gramos` en esa escala (null si no hay). */
export function gramosVecinos(a: AlimentoCatalogo, gramos: number, delta: 1 | -1): number | null {
  const posibles = gramosPosibles(a);
  const i = posibles.findIndex(g => g >= gramos - 1e-9);
  const j = (i === -1 ? posibles.length - 1 : i) + delta;
  return posibles[j] ?? null;
}

const fmtPiezas = (n: number): string => {
  const entero = Math.floor(n + 1e-9);
  const media = n - entero >= 0.5 - 1e-9;
  return `${entero > 0 ? entero : ''}${media ? '½' : ''}` || String(n);
};

/** «1½ Plátano · 150 g», «2 rebanada Pan · 60 g», «150 g de Fresas». Para los
 *  extras del banco se sigue usando `itemWeightLabel` + `foodNameShort`. */
export function textoDeExtra(c: MenuComplement): string {
  if (!esExtraDelCatalogo(c)) return c.foodLabel;
  if (c.piezas && c.piezas > 0) {
    const medida = c.unidad && c.unidad !== 'unidad' ? `${c.unidad} ` : '';
    return `${fmtPiezas(c.piezas)} ${medida}${c.foodLabel} · ${c.gramos} g`;
  }
  return `${c.gramos} g de ${c.foodLabel}`;
}

export interface OpcionesDeExtras {
  /** Alimentos que le gustan (alta): la fruta favorita sale antes. */
  liked?: readonly string[];
  /** Alimentos «no me gusta» y alergias: nunca. */
  disliked?: readonly string[];
  allergies?: readonly string[];
  conditions?: readonly number[];
  dietType?: DietType;
}

const nombreTiene = (nombre: string, lista: readonly string[] | undefined): boolean => {
  const n = normalizeStr(nombre);
  return !!lista?.some(x => { const q = normalizeStr(x); return !!q && n.includes(q); });
};

export interface CandidatoAExtra { a: AlimentoCatalogo; familia: FamiliaDeExtra; gusta: boolean }

/** Los alimentos del catálogo que pueden ser extra de este atleta, ordenados:
 *  primero los que le gustan, luego por nombre (mismo menú, mismos extras). */
export function alimentosParaExtras(catalogo: readonly AlimentoCatalogo[], o: OpcionesDeExtras = {}): CandidatoAExtra[] {
  const out: CandidatoAExtra[] = [];
  for (const a of catalogo) {
    const familia = familiaDeExtra(a);
    if (!familia) continue;
    if (o.dietType === 'vegano' && familia === 'lacteo' && !/soja|vegetal|coco|almendra|avena/i.test(a.nombre)) continue;
    if (nombreTiene(a.nombre, o.allergies) || nombreTiene(a.nombre, o.disliked)) continue;
    if (nombreVetadoPorCondicion(a.nombre, o.conditions)) continue;
    out.push({ a, familia, gusta: nombreTiene(a.nombre, o.liked) });
  }
  return out.sort((x, y) => Number(y.gusta) - Number(x.gusta) || x.a.nombre.localeCompare(y.a.nombre, 'es'));
}

type Macro = 'p' | 'hc' | 'g';
const FAMILIAS_POR_MACRO: Record<Macro, FamiliaDeExtra[]> = {
  hc: ['fruta', 'pan'],
  p: ['lacteo'],
  g: ['frutoSeco'],
};
const KCAL_G: Record<Macro, number> = { p: 4, hc: 4, g: 9 };
const CASTIGO_MEDIA_PIEZA = 15;
const BONO_GUSTA = 25;

/**
 * Elige hasta `max` extras del catálogo para tapar `hueco`, macro a macro
 * (hidratos → proteína → grasa, como siempre). Para cada macro prueba cada
 * alimento de su familia en todas sus cantidades y se queda con la que más
 * cubre sin pasarse en ningún macro (±3 g), prefiriendo lo que le gusta y las
 * piezas enteras. Si ninguna cantidad cabe, esa macro se deja: el que llama
 * la arrastra a otra comida.
 */
export function elegirExtras(
  hueco: Macros,
  candidatos: readonly CandidatoAExtra[],
  max = 2,
): MenuComplement[] {
  const out: MenuComplement[] = [];
  let resto = sinNegativos(hueco);
  const usados = new Set<string>();
  for (const m of ['hc', 'p', 'g'] as Macro[]) {
    if (out.length >= max) break;
    if (resto[m] * KCAL_G[m] < MIN_KCAL_EXTRA) continue;
    let mejor: { c: MenuComplement; orden: number } | null = null;
    for (const cand of candidatos) {
      if (!FAMILIAS_POR_MACRO[m].includes(cand.familia) || usados.has(cand.a.id)) continue;
      for (const gramos of gramosPosibles(cand.a)) {
        const mac = macrosDeAlimento(cand.a, gramos);
        if (mac.kcal < MIN_KCAL_EXTRA) continue;
        if (mac.p > resto.p + TOLERANCIA_G || mac.hc > resto.hc + TOLERANCIA_G || mac.g > resto.g + TOLERANCIA_G) break; // más gramos, más exceso
        const faltaTras = (resto[m] - mac[m]) * KCAL_G[m];
        const piezas = cand.a.unidad ? gramos / cand.a.unidad.gramos : null;
        const media = piezas != null && Math.abs(piezas - Math.round(piezas)) > 1e-6;
        const orden = faltaTras + (media ? CASTIGO_MEDIA_PIEZA : 0) - (cand.gusta ? BONO_GUSTA : 0);
        if (!mejor || orden < mejor.orden) mejor = { c: extraDeCatalogo(cand.a, gramos), orden };
      }
    }
    if (!mejor) continue;
    out.push(mejor.c);
    usados.add(mejor.c.alimentoId!);
    resto = sinNegativos(restarMacros(resto, mejor.c.macros!));
  }
  return out;
}

/** ¿Cabe este extra del catálogo en el hueco (sin pasarse de ningún macro más de la tolerancia)? */
export function cabeExtra(hueco: Macros, c: MenuComplement): boolean {
  if (!c.macros) return false;
  return c.macros.p <= hueco.p + TOLERANCIA_G && c.macros.hc <= hueco.hc + TOLERANCIA_G && c.macros.g <= hueco.g + TOLERANCIA_G;
}

/** El alimento tal cual lo describe el propio extra (por 100 g y medida casera):
 *  así se puede recortar sin tener el catálogo a mano (capa de escritura). */
export function alimentoDelExtra(c: MenuComplement): AlimentoCatalogo | null {
  if (!esExtraDelCatalogo(c) || !c.gramos || c.gramos <= 0) return null;
  const f = 100 / c.gramos;
  return {
    id: c.alimentoId!, nombre: c.foodLabel, estado: 'listo',
    porCien: { kcal: c.macros!.kcal * f, p: c.macros!.p * f, hc: c.macros!.hc * f, g: c.macros!.g * f },
    ...(c.piezas && c.piezas > 0 ? { unidad: { nombre: c.unidad ?? 'unidad', gramos: c.gramos / c.piezas } } : {}),
  };
}

/** El mismo extra con la mayor cantidad de su escala que cabe en el hueco; null si ni la mínima cabe. */
export function recortarExtra(hueco: Macros, c: MenuComplement): MenuComplement | null {
  if (cabeExtra(hueco, c)) return c;
  const a = alimentoDelExtra(c);
  if (!a) return null;
  const posibles = gramosPosibles(a).filter(g => g < (c.gramos ?? 0)).reverse();
  for (const g of posibles) {
    const candidato = extraDeCatalogo(a, g);
    if (cabeExtra(hueco, candidato)) return candidato;
  }
  return null;
}
