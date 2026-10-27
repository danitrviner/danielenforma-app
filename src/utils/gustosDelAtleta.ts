import type { Recipe, WeeklyMenu } from '../types';
import { dishType, type DishType } from './dishTypes';
import { normalizeStr } from './foodPrefs';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que el atleta ha hecho con sus menús (Dani, 27-10-2026)

   «Si siempre intercambia algún tipo de alimento, tenerlo en cuenta.» Los menús
   guardan dos rastros: `swapHistory` (qué receta quitó con «Intercambiar» y por
   cuál) e `ingredientSwaps` por comida (leche → bebida de avena). De ahí salen
   tres señales para el generador, todas blandas salvo la última:

     · `evitadas`: recetas que ha quitado. Cuantas más veces, menos salen.
     · `elegidas`: recetas que ha puesto él. Salen algo más.
     · `sustituciones`: un alimento que ha cambiado por el mismo otro en dos
       comidas distintas se le sirve ya cambiado en los menús nuevos.

   El gusto por TIPO de plato (`gustoPorTipo`) junta esto con sus favoritas y
   sus «no me gusta»: si le encantan dos batidos, los demás batidos suben; si
   quita siempre las tortillas, bajan todas, no solo esas.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SenalesDeCambios {
  /** recetaId → veces que la ha quitado con «Intercambiar». */
  evitadas: Record<string, number>;
  /** recetaId → veces que la ha elegido al intercambiar. */
  elegidas: Record<string, number>;
  /** Alimento tal cual va en la receta (normalizado) → por cuál lo cambia. */
  sustituciones: Record<string, string>;
}

/** Veces que hay que repetir un cambio de alimento para darlo por costumbre. */
export const MIN_VECES_SUSTITUCION = 2;

export const SIN_SENALES: SenalesDeCambios = { evitadas: {}, elegidas: {}, sustituciones: {} };

const suma = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

/** Las señales de todos los menús del atleta (publicado, borradores y archivados). */
export function senalesDeCambios(menus: readonly WeeklyMenu[]): SenalesDeCambios {
  const evitadas: Record<string, number> = {};
  const elegidas: Record<string, number> = {};
  const pares = new Map<string, Map<string, number>>();
  for (const menu of menus) {
    for (const s of menu.swapHistory ?? []) {
      if (!s.fromRecipeId || !s.toRecipeId || s.fromRecipeId === s.toRecipeId) continue;
      suma(evitadas, s.fromRecipeId);
      suma(elegidas, s.toRecipeId);
    }
    for (const day of menu.days ?? []) {
      for (const meal of day.meals) {
        for (const sw of meal.ingredientSwaps ?? []) {
          if (!sw.from || !sw.to || sw.from === sw.to) continue;
          const de = normalizeStr(sw.from);
          const porDestino = pares.get(de) ?? new Map<string, number>();
          porDestino.set(sw.to, (porDestino.get(sw.to) ?? 0) + 1);
          pares.set(de, porDestino);
        }
      }
    }
  }
  // Volver a elegir una receta que antes quitó la deja en paz: no es que la
  // evite, es que ese día no le apetecía.
  for (const id of Object.keys(evitadas)) {
    if (elegidas[id]) {
      const n = Math.min(evitadas[id], elegidas[id]);
      evitadas[id] -= n; elegidas[id] -= n;
      if (evitadas[id] === 0) delete evitadas[id];
      if (elegidas[id] === 0) delete elegidas[id];
    }
  }
  const sustituciones: Record<string, string> = {};
  for (const [de, porDestino] of pares) {
    const [a, veces] = [...porDestino.entries()].sort((x, y) => y[1] - x[1])[0];
    if (veces >= MIN_VECES_SUSTITUCION) sustituciones[de] = a;
  }
  return { evitadas, elegidas, sustituciones };
}

/** Los cambios de alimento que el atleta hace siempre, aplicados a esta receta. */
export function sustitucionesPara(
  recipe: Pick<Recipe, 'ingredientsText'>,
  sustituciones: Record<string, string> | undefined,
): { from: string; to: string }[] | undefined {
  if (!sustituciones || !recipe.ingredientsText?.length) return undefined;
  const out: { from: string; to: string }[] = [];
  for (const ing of recipe.ingredientsText) {
    const a = sustituciones[normalizeStr(ing.name)];
    if (a && normalizeStr(a) !== normalizeStr(ing.name)) out.push({ from: ing.name, to: a });
  }
  return out.length > 0 ? out : undefined;
}

export interface FuentesDeGusto {
  favoritas?: Iterable<string>;
  noGustan?: Iterable<string>;
  cambios?: SenalesDeCambios;
}

/** Hasta dónde cuenta el gusto por un tipo de plato (en «unidades» de gusto). */
export const TOPE_GUSTO_POR_TIPO = 2;

/**
 * Cuánto le gusta al atleta cada TIPO de plato, de −2 a +2: +1 por favorita,
 * −1 por «no me gusta», +½ por receta elegida al intercambiar, −½ por quitada.
 * Solo cuentan las recetas de `pool`, para que lo que le gusta de desayuno no
 * mueva las cenas. Los tipos sin señal no aparecen.
 */
export function gustoPorTipo(pool: readonly Recipe[], f: FuentesDeGusto): Map<DishType, number> {
  const favoritas = new Set(f.favoritas ?? []);
  const noGustan = new Set(f.noGustan ?? []);
  const evitadas = f.cambios?.evitadas ?? {};
  const elegidas = f.cambios?.elegidas ?? {};
  const puntos = new Map<DishType, number>();
  for (const r of pool) {
    let p = 0;
    if (favoritas.has(r.id)) p += 1;
    if (noGustan.has(r.id)) p -= 1;
    p += 0.5 * Math.min(2, elegidas[r.id] ?? 0);
    p -= 0.5 * Math.min(2, evitadas[r.id] ?? 0);
    if (p === 0) continue;
    const t = dishType(r);
    puntos.set(t, (puntos.get(t) ?? 0) + p);
  }
  for (const [t, p] of puntos) puntos.set(t, Math.max(-TOPE_GUSTO_POR_TIPO, Math.min(TOPE_GUSTO_POR_TIPO, p)));
  return puntos;
}
