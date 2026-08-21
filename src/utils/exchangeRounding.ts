import type { BudgetVec } from '../types';

// Redondeo de los intercambios de una receta a valores "limpios" (enteros),
// manteniendo el TOTAL prácticamente intacto.
//
// El porqué: el recetario importado guarda los intercambios en cuartos
// (importRecetas.mjs divide los gramos entre GRAMS_PER_EXCHANGE y redondea a
// 0,25). Eso da 44 totales distintos repartidos en 1.210 desgloses HC/PROT/GRASA
// diferentes: dos recetas de 3,5 intercambios pueden ser 1/0,75/1,75 y
// 1,25/0,75/1,5, así que el buscador de alternativas las trata como distintas y
// 371 recetas se quedaban sin ninguna equivalente en todo el catálogo.
//
// La clave que hace esto barato: en este sistema 1 intercambio ≈ 100 kcal en los
// TRES macros (HC 25g×4, PROT 25g×4, GRASA 11g×9 ≈ 99) — ver nutritionConstants.
// Mover intercambios entre macros no cambia las calorías; solo importa el total.
// Por eso el reparto HC/PROT/GRASA es flexible y el total no lo es.

/** Desviación máxima tolerada en el TOTAL de intercambios (≈ 25 kcal). */
export const MAX_TOTAL_DRIFT = 0.25;

/** Unidad mínima del sistema de intercambios. */
const QUARTER = 0.25;

const MACROS = ['HC', 'PROT', 'GRASA'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const total = (v: BudgetVec) => round2(v.HC + v.PROT + v.GRASA);

// Valores candidatos para un macro, de más limpio a menos: los dos enteros que
// lo rodean, los dos medios, y el valor original como último recurso. El
// original SIEMPRE entra en la lista, lo que garantiza que la búsqueda de abajo
// encuentre solución (el vector original tiene desviación 0 por definición).
function candidates(value: number): number[] {
  const out = [
    Math.floor(value),
    Math.ceil(value),
    Math.floor(value * 2) / 2,
    Math.ceil(value * 2) / 2,
    value,
  ].filter(v => v >= 0);
  return [...new Set(out.map(round2))];
}

// Cuánto "ensucia" un valor: 0 si es entero, 1 si es medio, 2 en cualquier otro
// caso. Minimizar esto es literalmente el objetivo — agrupar recetas en pocos
// desgloses distintos para que sean intercambiables entre sí.
function messiness(v: number): number {
  if (Number.isInteger(v)) return 0;
  if (Number.isInteger(v * 2)) return 1;
  return 2;
}

/**
 * Redondea los intercambios de una receta a los valores más limpios posibles
 * sin que el TOTAL se desvíe más de `MAX_TOTAL_DRIFT` del original.
 *
 * Busca de forma exhaustiva sobre los candidatos de cada macro (≤5³ = 125
 * combinaciones) y se queda con la más limpia; a igual limpieza, la que menos
 * distorsiona el reparto original; a igual distorsión, la que menos desvía el
 * total. Es determinista y siempre devuelve algo dentro de tolerancia.
 *
 * Ejemplo: {HC: 1.25, PROT: 0.75, GRASA: 1.5} (total 3,5)
 *       → {HC: 1, PROT: 1, GRASA: 1.5} (total 3,5) — dos enteros, total exacto.
 */
export function snapExchanges(raw: BudgetVec): BudgetVec {
  const origTotal = total(raw);

  let best: BudgetVec | null = null;
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity];

  for (const HC of candidates(raw.HC)) {
    for (const PROT of candidates(raw.PROT)) {
      for (const GRASA of candidates(raw.GRASA)) {
        const drift = Math.abs(round2(HC + PROT + GRASA) - origTotal);
        // El margen manda: fuera de tolerancia no se considera, por limpio que sea.
        if (drift > MAX_TOTAL_DRIFT + 1e-9) continue;

        const key: [number, number, number] = [
          messiness(HC) + messiness(PROT) + messiness(GRASA),
          Math.abs(HC - raw.HC) + Math.abs(PROT - raw.PROT) + Math.abs(GRASA - raw.GRASA),
          drift,
        ];
        if (key[0] < bestKey[0] ||
           (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
           (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])) {
          best = { HC, PROT, GRASA };
          bestKey = key;
        }
      }
    }
  }

  // Inalcanzable en la práctica —el vector original siempre es candidato—, pero
  // devolver el original es la única salida correcta si algo lo fuera.
  return best ?? { HC: raw.HC, PROT: raw.PROT, GRASA: raw.GRASA };
}

/** Total de intercambios de un vector, redondeado a 2 decimales. */
export function totalExchanges(v: BudgetVec): number {
  return total(v);
}

/**
 * Convierte macros en gramos a intercambios ya redondeados. Es la conversión
 * que aplica el importador del recetario; vive aquí para que la app y el script
 * de migración compartan exactamente la misma regla.
 */
export function exchangesFromMacros(
  macros: { carb: number; prot: number; fat: number } | null | undefined,
  gramsPerExchange: Record<'HC' | 'PROT' | 'GRASA', number>,
): BudgetVec {
  if (!macros) return { HC: 0, PROT: 0, GRASA: 0 };
  const quarter = (n: number) => Math.round(n / QUARTER) * QUARTER;
  return snapExchanges({
    HC:    quarter((macros.carb ?? 0) / gramsPerExchange.HC),
    PROT:  quarter((macros.prot ?? 0) / gramsPerExchange.PROT),
    GRASA: quarter((macros.fat  ?? 0) / gramsPerExchange.GRASA),
  });
}

export { MACROS };
