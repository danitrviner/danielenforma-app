import { describe, expect, it } from 'vitest';
import type { Diet, DietItem, DietMeal } from '../types';
import {
  macrosDeIntercambios, kcalDeIntercambio, intercambiosDeMacros, macrosDeLinea, macrosDeLineas,
  esLineaAproximada, objetivoDeDieta, objetivoDelRegistro, objetivoYCupo,
} from './macrosLegado';
import { exchangeToKcal } from './nutritionConstants';
import { kcalDeDieta } from './semanasNutricion';
import { resumenDelDia } from './resumenDelDia';

const cupo = { HC: 11, PROT: 8, GRASA: 5, MIX_HC: 1, MIX_GRASA: 2 };

describe('macrosLegado · paridad con lo de antes', () => {
  it('un cupo viejo da las mismas kcal que la respuesta oficial (kcalDeDieta)', () => {
    expect(objetivoDeDieta({ budget: cupo } as Diet).kcal).toBe(kcalDeDieta({ budget: cupo }));
  });

  it('sin mixtos coincide también con exchangeToKcal', () => {
    const solo = { HC: 12, PROT: 6, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 };
    expect(macrosDeIntercambios(solo).kcal).toBe(exchangeToKcal(solo));
  });

  it('1 intercambio = 25 g HC / 25 g P / 11 g G; los mixtos, medio y medio', () => {
    expect(macrosDeIntercambios({ HC: 1 })).toEqual({ kcal: 100, p: 0, hc: 25, g: 0 });
    expect(macrosDeIntercambios({ PROT: 1 })).toEqual({ kcal: 100, p: 25, hc: 0, g: 0 });
    expect(macrosDeIntercambios({ GRASA: 1 })).toEqual({ kcal: 99, p: 0, hc: 0, g: 11 });
    expect(macrosDeIntercambios({ MIX_HC: 1 })).toEqual({ kcal: 100, p: 12.5, hc: 12.5, g: 0 });
    expect(macrosDeIntercambios({ MIX_GRASA: 1 })).toEqual({ kcal: 100, p: 12.5, hc: 0, g: 5.5 });
    expect(kcalDeIntercambio('GRASA')).toBe(99);
  });

  it('las líneas de un día suman lo mismo que resumenDelDia', () => {
    const items: DietItem[] = [
      { category: 'HC', foodLabel: '30g arroz', quantity: 2.5 },
      { category: 'MIX_GRASA', foodLabel: 'Queso', quantity: 1 },
      { category: 'PROT', foodLabel: 'Yogur proteico', quantity: 1, lineaId: 'l1', nutrientes: { kcal: 120, p: 20, hc: 6, g: 1.5 } },
      { category: 'GRASA', foodLabel: 'Yogur proteico', quantity: 0.25, lineaId: 'l1' },
      { category: 'HC', foodLabel: 'Galletas sin datos', quantity: 1, nutrientes: null },
    ];
    const meal = { id: 'm', name: 'Desayuno', items } as DietMeal;
    const antes = resumenDelDia([meal], items.map((_, i) => `m_${i}`));
    const ahora = macrosDeLineas(items);
    expect(Math.round(ahora.kcal)).toBe(antes.kcal);
    expect(Math.round(ahora.p * 10) / 10).toBe(antes.p);
    expect(Math.round(ahora.hc * 10) / 10).toBe(antes.hc);
    expect(Math.round(ahora.g * 10) / 10).toBe(antes.g);
  });

  it('cada línea sabe si es una estimación', () => {
    expect(esLineaAproximada({ category: 'HC', foodLabel: 'Pan', quantity: 1 })).toBe(true);
    expect(esLineaAproximada({ category: 'HC', foodLabel: 'Pan', quantity: 1, nutrientes: { kcal: 80, p: 3, hc: 15, g: 1 } })).toBe(false);
    expect(macrosDeLinea({ category: 'HC', foodLabel: 'x', quantity: 1, nutrientes: null })).toEqual({ kcal: 0, p: 0, hc: 0, g: 0 });
  });
});

describe('macrosLegado · lo nuevo manda', () => {
  it('una dieta con objetivo en kcal ignora su cupo viejo', () => {
    const objetivo = { kcal: 2230, p: 150, hc: 250, g: 70 };
    expect(objetivoDeDieta({ budget: cupo, objetivo } as Diet)).toEqual(objetivo);
  });

  it('el registro del día: objetivo nuevo, cupo viejo o nada', () => {
    const objetivo = { kcal: 1800, p: 140, hc: 180, g: 60 };
    expect(objetivoDelRegistro({ objetivo, budget: cupo })).toEqual(objetivo);
    expect(objetivoDelRegistro({ budget: cupo })?.kcal).toBe(kcalDeDieta({ budget: cupo }));
    expect(objetivoDelRegistro({})).toBeNull();
    expect(objetivoDelRegistro(null)).toBeNull();
  });

  it('para los binarios viejos se sigue escribiendo un cupo equivalente', () => {
    const m = { kcal: 2230, p: 150, hc: 250, g: 70 };
    const v = intercambiosDeMacros(m);
    expect(v).toEqual({ HC: 10, PROT: 6, GRASA: 6.36, MIX_HC: 0, MIX_GRASA: 0 });
    expect(Math.abs(macrosDeIntercambios(v).kcal - m.kcal)).toBeLessThanOrEqual(1);
  });

  it('objetivoYCupo guarda el objetivo y su cupo, y el objetivo manda al leer', () => {
    const m = { kcal: 2230, p: 150, hc: 250, g: 70 };
    const d = objetivoYCupo(m);
    expect(d.objetivo).toEqual(m);
    expect(d.budget).toEqual(intercambiosDeMacros(m));
    expect(objetivoDeDieta(d)).toEqual(m);
  });
});
