/**
 * Redondeo de intercambios para los scripts de Node (importador y migración).
 *
 * Es un GEMELO EXACTO de src/utils/exchangeRounding.ts. Existen dos copias
 * porque los scripts son .mjs sueltos y la app es TypeScript compilado por Vite:
 * ninguno de los dos puede importar el módulo del otro sin arrastrar un paso de
 * build. Para que no se separen en silencio, src/utils/exchangeRounding.test.ts
 * importa ESTE archivo y comprueba que ambas implementaciones coinciden sobre
 * todos los vectores posibles. Si tocas uno, toca el otro o el test se pone rojo.
 *
 * Ver el TS para la explicación completa del algoritmo y del porqué.
 */

export const MAX_TOTAL_DRIFT = 0.25;

const round2 = n => Math.round(n * 100) / 100;

function candidates(value) {
  const out = [
    Math.floor(value),
    Math.ceil(value),
    Math.floor(value * 2) / 2,
    Math.ceil(value * 2) / 2,
    value,
  ].filter(v => v >= 0);
  return [...new Set(out.map(round2))];
}

function messiness(v) {
  if (Number.isInteger(v)) return 0;
  if (Number.isInteger(v * 2)) return 1;
  return 2;
}

/** Redondea {HC, PROT, GRASA} a valores limpios sin mover el total más de ±0,25. */
export function snapExchanges(raw) {
  const origTotal = round2(raw.HC + raw.PROT + raw.GRASA);

  let best = null;
  let bestKey = [Infinity, Infinity, Infinity];

  for (const HC of candidates(raw.HC)) {
    for (const PROT of candidates(raw.PROT)) {
      for (const GRASA of candidates(raw.GRASA)) {
        const drift = Math.abs(round2(HC + PROT + GRASA) - origTotal);
        if (drift > MAX_TOTAL_DRIFT + 1e-9) continue;

        const key = [
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

  return best ?? { HC: raw.HC, PROT: raw.PROT, GRASA: raw.GRASA };
}

/** Gramos por intercambio — espejo de src/utils/nutritionConstants.ts. */
export const GRAMS_PER_EXCHANGE = { HC: 25, PROT: 25, GRASA: 11 };

/** Convierte macros en gramos a intercambios ya redondeados. */
export function exchangesFromMacros(macros) {
  if (!macros) return { HC: 0, PROT: 0, GRASA: 0 };
  const quarter = n => Math.round(n / 0.25) * 0.25;
  return snapExchanges({
    HC:    quarter((macros.carb ?? 0) / GRAMS_PER_EXCHANGE.HC),
    PROT:  quarter((macros.prot ?? 0) / GRAMS_PER_EXCHANGE.PROT),
    GRASA: quarter((macros.fat  ?? 0) / GRAMS_PER_EXCHANGE.GRASA),
  });
}

export const totalExchanges = v => round2(v.HC + v.PROT + v.GRASA);
