import { describe, it, expect } from 'vitest';
import type { IngredienteVinculado, Recipe } from '../types';
import { ajustarReceta, sePuedeAjustar, recetaAjustada, fraseDeCambio, toleranciaDe } from './ajusteDeReceta';

const ARROZ = { kcal: 354, p: 7, hc: 78, g: 0.9 };
const POLLO = { kcal: 110, p: 23, hc: 0, g: 1.5 };
const TOMATE = { kcal: 80, p: 1.5, hc: 9, g: 4 };
const ACEITE = { kcal: 900, p: 0, hc: 0, g: 100 };

// Arroz con pollo y tomate: 90 g arroz, 150 g pollo, 80 g tomate (fijo), aceite 5 g, sal.
const ings = (): IngredienteVinculado[] => [
  { n: 0, alimentoId: 'arroz', gramos: 90, min: 45, max: 180, palanca: 'hc', porCien: ARROZ },
  { n: 1, alimentoId: 'pollo', gramos: 150, min: 75, max: 300, palanca: 'proteina', porCien: POLLO },
  { n: 2, alimentoId: 'tomate', gramos: 80, min: 80, max: 80, fijo: true, porCien: TOMATE },
  { n: 3, alimentoId: 'aceite', gramos: 5, min: 0, max: 15, palanca: 'grasa', porCien: ACEITE },
  { n: 4, alimentoId: null, gramos: 1, min: 1, max: 1, fijo: true },
];
const NOMBRES = ['Arroz', 'Pechuga de pollo', 'Tomate frito', 'Aceite', 'Sal'];

describe('ajustarReceta', () => {
  it('si ya encaja no toca nada', () => {
    // La receta tal cual: P 42 · HC 77,4 · G 11,3 aprox.
    const r = ajustarReceta(ings(), { p: 42, hc: 77, g: 11 }, NOMBRES);
    expect(r.cambios).toEqual([]);
    expect(r.encaja).toBe(true);
    expect(r.gramos.map(g => g.gramos)).toEqual([90, 150, 80, 5, 1]);
  });

  it('un aceite de 3 g con el objetivo de la receta se queda en 3 g (26-10-2026)', () => {
    const conPocoAceite = ings().map(i => i.n === 3 ? { ...i, gramos: 3, min: 3, max: 5 } : i);
    const r = ajustarReceta(conPocoAceite, { p: 42, hc: 77, g: 9.4 }, NOMBRES);
    expect(r.cambios).toEqual([]);
    expect(r.gramos.find(g => g.n === 3)!.gramos).toBe(3);
  });

  it('sube arroz y pollo para una comida más grande, redondeando a 5 g', () => {
    const r = ajustarReceta(ings(), { p: 55, hc: 100, g: 12 }, NOMBRES);
    expect(r.encaja).toBe(true);
    const arroz = r.gramos.find(g => g.n === 0)!.gramos;
    const pollo = r.gramos.find(g => g.n === 1)!.gramos;
    expect(arroz).toBeGreaterThan(90);
    expect(pollo).toBeGreaterThan(150);
    expect(arroz % 5).toBe(0);
    expect(pollo % 5).toBe(0);
    expect(r.gramos.find(g => g.n === 2)!.gramos).toBe(80); // fijo
    expect(Math.abs(r.desvio.p)).toBeLessThanOrEqual(toleranciaDe(55));
    expect(Math.abs(r.desvio.hc)).toBeLessThanOrEqual(toleranciaDe(100));
    expect(fraseDeCambio(r.cambios.find(c => c.n === 0)!)).toMatch(/^Arroz 90 → \d+ g \(faltaban hidratos\)$/);
  });

  it('el aceite se redondea de 1 en 1 g y baja si sobra grasa', () => {
    const r = ajustarReceta(ings(), { p: 42, hc: 77, g: 8 }, NOMBRES);
    const aceite = r.gramos.find(g => g.n === 3)!.gramos;
    expect(aceite).toBeLessThan(5);
    expect(Number.isInteger(aceite)).toBe(true);
    expect(r.cambios.find(c => c.n === 3)?.motivo).toBe('sobraba grasa');
  });

  it('nunca se sale del rango y, si no llega, dice que no encaja', () => {
    const r = ajustarReceta(ings(), { p: 120, hc: 250, g: 12 }, NOMBRES);
    expect(r.gramos.find(g => g.n === 0)!.gramos).toBe(180);
    expect(r.gramos.find(g => g.n === 1)!.gramos).toBe(300);
    expect(r.encaja).toBe(false);
    expect(r.desvio.hc).toBeLessThan(0);
  });

  it('es reproducible: misma entrada, misma salida', () => {
    const a = ajustarReceta(ings(), { p: 50, hc: 60, g: 10 }, NOMBRES);
    const b = ajustarReceta(ings(), { p: 50, hc: 60, g: 10 }, NOMBRES);
    expect(a).toEqual(b);
  });

  it('dos palancas del mismo macro se reparten el cambio según sus gramos', () => {
    const dos: IngredienteVinculado[] = [
      { n: 0, alimentoId: 'arroz', gramos: 60, min: 0, max: 300, palanca: 'hc', porCien: ARROZ },
      { n: 1, alimentoId: 'arroz2', gramos: 30, min: 0, max: 300, palanca: 'hc', porCien: ARROZ },
    ];
    const r = ajustarReceta(dos, { p: 12, hc: 140, g: 1.5 });
    const [a, b] = r.gramos.map(g => g.gramos);
    expect(a / b).toBeCloseTo(2, 0);
  });
});

describe('sePuedeAjustar', () => {
  it('pide al menos una palanca y los valores por 100 g', () => {
    expect(sePuedeAjustar(ings())).toBe(true);
    expect(sePuedeAjustar(undefined)).toBe(false);
    expect(sePuedeAjustar(ings().map(i => ({ ...i, palanca: undefined })))).toBe(false);
    expect(sePuedeAjustar(ings().map((i, k) => (k === 0 ? { ...i, porCien: undefined } : i)))).toBe(false);
  });
});

describe('recetaAjustada', () => {
  it('cambia las cantidades por posición y recalcula macros, kcal y peso', () => {
    const receta = {
      id: 'r', name: 'Arroz con pollo', ownerId: 'x', categories: [], ingredients: [], extras: [], steps: [],
      ingredientsText: NOMBRES.map((name, n) => ({ name, quantity: ings()[n].gramos })),
      vinculo: { ingredientes: ings(), calculadoEn: 't' },
    } as Recipe;
    const r = recetaAjustada(receta, [{ n: 0, gramos: 120 }, { n: 1, gramos: 150 }, { n: 2, gramos: 80 }, { n: 3, gramos: 5 }, { n: 4, gramos: 1 }]);
    expect(r.ingredientsText?.[0]).toEqual({ name: 'Arroz', quantity: 120 });
    expect(r.weight).toBe(356);
    expect(r.kcal).toBe(Math.round(354 * 1.2 + 110 * 1.5 + 80 * 0.8 + 900 * 0.05));
    expect(recetaAjustada({ ...receta, vinculo: undefined }, [{ n: 0, gramos: 1 }])).toEqual({ ...receta, vinculo: undefined });
  });
});
