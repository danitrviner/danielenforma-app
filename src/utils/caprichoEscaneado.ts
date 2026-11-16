import type { FoodCategory, MenuComplement } from '../types.js';
import type { OffProducto } from './productoOff.js';
import { macrosDeAlimento } from './extrasDelCatalogo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Un capricho escaneado (11-2026, Dani)

   «Si te comes un helado de estos que vienen con código de barras, lo señalas
   y, si fuera un cono, ya está, te lo has comido. Si fuera una tarrina, pones
   cuánta ración has comido.»

   El producto sale del escáner (Open Food Facts). Aquí se decide en qué
   cantidades se ofrece de un toque —la unidad de un envase de varias, la
   ración declarada, medio envase o el envase entero— y se convierte en el
   extra del menú que entra por la vía de los caprichos.

   Lógica pura: sin Firestore ni React.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EnvaseDeProducto {
  /** Lo que trae el envase entero, en gramos o mililitros. */
  total: number;
  medida: 'g' | 'ml';
  /** Envase de varias unidades («4 x 120 ml»): cuántas y de cuánto cada una. */
  unidades?: number;
  porUnidad?: number;
}

const FACTOR: Record<string, [number, 'g' | 'ml']> = { g: [1, 'g'], kg: [1000, 'g'], ml: [1, 'ml'], cl: [10, 'ml'], l: [1000, 'ml'] };
const NUMERO = String.raw`(\d+(?:[.,]\d+)?)`;
const MEDIDA = String.raw`(kg|g|ml|cl|l)\b`;
const num = (t: string) => parseFloat(t.replace(',', '.'));

/** Lee «500 g», «1,5 l», «33 cl» o «4 x 120 ml» de la cantidad del envase tal
 *  cual la escribe Open Food Facts. null si no se entiende. */
export function envaseDeProducto(q: string | undefined): EnvaseDeProducto | null {
  if (!q) return null;
  const texto = q.toLowerCase();
  const varias = texto.match(new RegExp(String.raw`(\d+)\s*[x×*]\s*${NUMERO}\s*${MEDIDA}`));
  if (varias) {
    const [factor, medida] = FACTOR[varias[3]];
    const unidades = parseInt(varias[1], 10);
    const porUnidad = Math.round(num(varias[2]) * factor);
    if (unidades > 0 && porUnidad > 0) return { total: unidades * porUnidad, medida, unidades, porUnidad };
  }
  const una = texto.match(new RegExp(String.raw`${NUMERO}\s*${MEDIDA}`));
  if (!una) return null;
  const [factor, medida] = FACTOR[una[2]];
  const total = Math.round(num(una[1]) * factor);
  return total > 0 ? { total, medida } : null;
}

export interface AtajoDeCantidad {
  /** «1 unidad», «1 ración», «Medio envase», «Envase entero». */
  titulo: string;
  gramos: number;
  medida: 'g' | 'ml';
}

/** Por encima de esto nadie se come «el envase entero» de un capricho de una vez. */
const MAX_ENVASE_ENTERO = 1000;
const MIN_ATAJO = 10;

/** Las cantidades que se ofrecen de un toque, de la más probable a la menos:
 *  la primera es la que sale ya puesta. Sin repetir cantidades. */
export function atajosDeCantidad(p: Pick<OffProducto, 'q' | 's'>): AtajoDeCantidad[] {
  const env = envaseDeProducto(p.q);
  const medida = env?.medida ?? 'g';
  const out: AtajoDeCantidad[] = [];
  const poner = (titulo: string, gramos: number | undefined) => {
    if (!gramos || !Number.isFinite(gramos)) return;
    const g = Math.round(gramos);
    if (g < MIN_ATAJO || out.some(a => Math.abs(a.gramos - g) <= 1)) return;
    out.push({ titulo, gramos: g, medida });
  };
  // Un envase individual (un cono suelto, una tarrina pequeña): lo normal es
  // comérselo entero, así que va el primero aunque también declare ración.
  const suelto = !!env && !env.porUnidad && env.total <= MAX_ENVASE_ENTERO;
  const individual = suelto && (!p.s || env!.total <= p.s * 1.5);
  if (individual) poner('Envase entero', env!.total);
  poner('1 unidad', env?.porUnidad);
  poner('1 ración', p.s);
  if (suelto) { poner('Medio envase', env!.total / 2); poner('Envase entero', env!.total); }
  return out;
}

/** La cantidad con la que abre la ficha: el primer atajo, o 100 si no hay ninguno. */
export function cantidadInicial(p: Pick<OffProducto, 'q' | 's'>): number {
  return atajosDeCantidad(p)[0]?.gramos ?? 100;
}

const categoriaDe = (p: Pick<OffProducto, 'p' | 'h' | 'g'>): FoodCategory =>
  (p.g * 9 > p.h * 4 && p.g * 9 > p.p * 4 ? 'GRASA' : p.p > p.h ? 'PROT' : 'HC');

/** El producto, en esa cantidad, como extra del menú que eligió el atleta. Si
 *  la cantidad son unidades o raciones justas (enteras o medias) se guarda así
 *  («1 Cono · 120 g»); si no, en gramos. */
export function extraDeProducto(p: OffProducto, gramos: number): MenuComplement {
  const env = envaseDeProducto(p.q);
  const unidad = env?.porUnidad ? { nombre: 'unidad', gramos: env.porUnidad } : p.s ? { nombre: 'ración', gramos: p.s } : null;
  const veces = unidad ? gramos / unidad.gramos : 0;
  const enMedias = Math.round(veces * 2) / 2;
  const justas = !!unidad && enMedias >= 0.5 && Math.abs(veces - enMedias) < 0.02;
  return {
    foodLabel: p.b && !p.n.toLowerCase().includes(p.b.toLowerCase()) ? `${p.n} (${p.b})` : p.n,
    category: categoriaDe(p),
    // 0 a propósito, como los extras del catálogo: lo que cuenta es `macros`.
    quantity: 0,
    alimentoId: `off_${p.c}`,
    gramos: Math.round(gramos),
    ...(justas ? { piezas: enMedias, unidad: unidad!.nombre } : {}),
    macros: macrosDeAlimento({ porCien: { kcal: p.k, p: p.p, hc: p.h, g: p.g } }, gramos),
    delAtleta: true,
  };
}
