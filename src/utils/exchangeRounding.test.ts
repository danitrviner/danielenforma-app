import { describe, it, expect } from 'vitest';
import { snapExchanges, totalExchanges, MAX_TOTAL_DRIFT, exchangesFromMacros } from './exchangeRounding';
import { GRAMS_PER_EXCHANGE, exchangeToKcal } from './nutritionConstants';
import type { BudgetVec } from '../types';

const drift = (a: BudgetVec, b: BudgetVec) => Math.abs(totalExchanges(a) - totalExchanges(b));

// Todos los cuartos posibles hasta 5 intercambios por macro — el rango real del
// recetario (el máximo observado son 11 intercambios totales).
function everyQuarterVector(): BudgetVec[] {
  const steps = Array.from({ length: 21 }, (_, i) => i * 0.25);
  const out: BudgetVec[] = [];
  for (const HC of steps) for (const PROT of steps) for (const GRASA of steps) out.push({ HC, PROT, GRASA });
  return out;
}

describe('snapExchanges', () => {
  it('deja intactos los vectores que ya son enteros', () => {
    const v = { HC: 2, PROT: 1, GRASA: 1 };
    expect(snapExchanges(v)).toEqual(v);
  });

  it('elimina una grasa residual absorbiéndola en el total', () => {
    // El caso que motivó todo: 0,25 de grasa suelta que no aporta nada.
    const out = snapExchanges({ HC: 2, PROT: 1, GRASA: 0.25 });
    expect(out.GRASA).toBe(0);
    expect(totalExchanges(out)).toBe(3);
  });

  it('redondea al entero más cercano cuando el total lo permite', () => {
    // 1,25/0,75/1,5 = 3,5 → busca enteros sin salirse de ±0,25.
    const out = snapExchanges({ HC: 1.25, PROT: 0.75, GRASA: 1.5 });
    expect(drift(out, { HC: 1.25, PROT: 0.75, GRASA: 1.5 })).toBeLessThanOrEqual(MAX_TOTAL_DRIFT);
  });

  it('nunca produce valores negativos', () => {
    for (const v of everyQuarterVector()) {
      const out = snapExchanges(v);
      expect(out.HC).toBeGreaterThanOrEqual(0);
      expect(out.PROT).toBeGreaterThanOrEqual(0);
      expect(out.GRASA).toBeGreaterThanOrEqual(0);
    }
  });

  it('RESPETA SIEMPRE el margen de ±0,25 en el total — la regla que no se negocia', () => {
    for (const v of everyQuarterVector()) {
      expect(drift(snapExchanges(v), v)).toBeLessThanOrEqual(MAX_TOTAL_DRIFT + 1e-9);
    }
  });

  it('mantiene las calorías dentro de ±25 kcal', () => {
    // Corolario del anterior: 1 intercambio ≈ 100 kcal en los tres macros.
    for (const v of everyQuarterVector()) {
      expect(Math.abs(exchangeToKcal(snapExchanges(v)) - exchangeToKcal(v))).toBeLessThanOrEqual(26);
    }
  });

  it('es idempotente: volver a redondear no mueve nada', () => {
    for (const v of everyQuarterVector()) {
      const once = snapExchanges(v);
      expect(snapExchanges(once)).toEqual(once);
    }
  });

  it('es determinista', () => {
    const v = { HC: 1.75, PROT: 0.5, GRASA: 1.25 };
    expect(snapExchanges(v)).toEqual(snapExchanges(v));
  });

  it('reduce drásticamente el número de desgloses distintos', () => {
    const all = everyQuarterVector();
    const antes = new Set(all.map(v => `${v.HC}/${v.PROT}/${v.GRASA}`)).size;
    const despues = new Set(all.map(v => { const s = snapExchanges(v); return `${s.HC}/${s.PROT}/${s.GRASA}`; })).size;
    expect(despues).toBeLessThan(antes / 2);
  });

  it('no inventa intercambios donde no había nada', () => {
    expect(snapExchanges({ HC: 0, PROT: 0, GRASA: 0 })).toEqual({ HC: 0, PROT: 0, GRASA: 0 });
  });
});

describe('paridad con la copia de los scripts de Node', () => {
  it('scripts/lib/redondeoIntercambios.mjs da EXACTAMENTE lo mismo', async () => {
    // El importador y el script de migración son .mjs y no pueden importar el TS.
    // Este test es lo único que impide que las dos copias se separen en silencio.
    const mjs = await import('../../scripts/lib/redondeoIntercambios.mjs');
    for (const v of everyQuarterVector()) {
      expect(mjs.snapExchanges(v)).toEqual(snapExchanges(v));
    }
  });

  it('los gramos por intercambio coinciden en ambas copias', async () => {
    const mjs = await import('../../scripts/lib/redondeoIntercambios.mjs');
    expect(mjs.GRAMS_PER_EXCHANGE).toEqual(GRAMS_PER_EXCHANGE);
  });
});

describe('exchangesFromMacros', () => {
  it('convierte gramos a intercambios ya redondeados', () => {
    // Bocadillo de lomo embuchado del recetario: 26g HC, 13g PROT, 5g GRASA.
    const out = exchangesFromMacros({ carb: 26, prot: 13, fat: 5 }, GRAMS_PER_EXCHANGE);
    expect(out.HC % 1 === 0 || out.HC % 0.5 === 0).toBe(true);
    expect(totalExchanges(out)).toBeGreaterThan(0);
  });

  it('devuelve el vector cero si no hay macros', () => {
    expect(exchangesFromMacros(null, GRAMS_PER_EXCHANGE)).toEqual({ HC: 0, PROT: 0, GRASA: 0 });
  });
});
