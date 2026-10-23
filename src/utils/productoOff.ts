import type { DietItem } from '../types';
import { normalizarTexto } from './busqueda';

/* ═══════════════════════════════════════════════════════════════════════════
   Productos de Open Food Facts en local (D-04)

   Lógica pura del buscador por nombre y de las raciones. La descarga de los
   archivos vive en `services/openFoodFacts.ts`. Datos de Open Food Facts (ODbL):
   hay que citarlos donde se enseñen.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un producto con kcal y los tres macros, tal y como lo escribe `scripts/generarOpenFoodFacts.mjs`. */
export interface OffProducto {
  c: string; n: string; b: string;
  /** Cantidad del envase tal cual ("500 g"). */
  q?: string;
  /** Gramos de una ración declarada. */
  s?: number;
  /** Por 100 g. */
  k: number; p: number; h: number; g: number;
  f?: number; az?: number; sat?: number; sal?: number;
  /** Micronutrientes por 100 g, con las claves y unidades de `MICRO_META`. */
  m?: Record<string, number>;
  ns?: string;
}

/** Un producto que Open Food Facts conoce pero sin datos utilizables: no se
 *  cuenta en el diario, solo se enseña para pedir que se complete desde la
 *  etiqueta. `i` 1 = faltan nutrientes (`fal`), 2 = no cuadran las kcal con los macros. */
export interface OffIncompleto {
  c: string; n: string; b: string; q?: string;
  i: 1 | 2;
  /** Qué falta, con las claves k (calorías), p, h y g. */
  fal?: Array<'k' | 'p' | 'h' | 'g'>;
}

export type OffRegistro = OffProducto | OffIncompleto;

export function esIncompleto(r: OffRegistro): r is OffIncompleto {
  return 'i' in r;
}

const NOMBRE_DE_NUTRIENTE = { k: 'calorías', p: 'proteína', h: 'hidratos', g: 'grasa' } as const;

/** Frase para el atleta: qué le pasa a este producto. */
export function motivoDeIncompleto(r: OffIncompleto): string {
  if (r.i === 2) return 'Sus calorías no cuadran con sus macros, así que no nos fiamos de los datos.';
  const faltan = (r.fal ?? []).map(k => NOMBRE_DE_NUTRIENTE[k]);
  return faltan.length ? `Falta: ${faltan.join(', ')}.` : 'No trae sus nutrientes completos.';
}

/** Entrada del índice de nombres (`indice.json`: [código, nombre, marca]). */
export interface EntradaIndiceOff { c: string; n: string; b: string; t: string }

export const MIN_LETRAS_BUSQUEDA_OFF = 3;

export function prepararIndiceOff(items: Array<[string, string, string]>): EntradaIndiceOff[] {
  return items.map(([c, n, b]) => ({ c, n, b, t: normalizarTexto(`${n} ${b}`) }));
}

/**
 * Busca por nombre y marca, sin tildes y en cualquier orden. El índice llega
 * ordenado por popularidad, así que a igualdad de criterio sale antes el más
 * escaneado; los que EMPIEZAN por lo buscado van delante.
 */
export function buscarEnIndiceOff(indice: EntradaIndiceOff[], termino: string, limite = 15): EntradaIndiceOff[] {
  const t = normalizarTexto(termino);
  if (t.length < MIN_LETRAS_BUSQUEDA_OFF) return [];
  const palabras = t.split(' ');
  const empiezan: EntradaIndiceOff[] = [];
  const contienen: EntradaIndiceOff[] = [];
  for (const e of indice) {
    if (!palabras.every(p => e.t.includes(p))) continue;
    (e.t.startsWith(palabras[0]) ? empiezan : contienen).push(e);
    if (empiezan.length >= limite) break;
  }
  return [...empiezan, ...contienen].slice(0, limite);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const cifra = (n: number) => Number(n.toPrecision(3));

/** Fibra, azúcares, saturada, sal y micros de la RACIÓN (no de 100 g), o undefined si no hay nada. */
export function extrasDeRacion(p: OffProducto, gramos: number): DietItem['extras'] | undefined {
  const f = gramos / 100;
  const out: NonNullable<DietItem['extras']> = {};
  if (p.f !== undefined) out.f = r1(p.f * f);
  if (p.az !== undefined) out.az = r1(p.az * f);
  if (p.sat !== undefined) out.sat = r1(p.sat * f);
  if (p.sal !== undefined) out.sal = Math.round(p.sal * f * 100) / 100;
  if (p.m && Object.keys(p.m).length > 0) {
    out.m = Object.fromEntries(Object.entries(p.m).map(([k, v]) => [k, cifra(v * f)]));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
