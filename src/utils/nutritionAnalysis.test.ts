import { describe, it, expect } from 'vitest';
import {
  computeAdherenceRate, computeStepCompletionRate, computeWeightTrend, computeMacroDeviation,
  DEFAULT_THRESHOLDS,
} from './nutritionAnalysis';
import { hoyIsoLocal, addDays } from './trainingWeek';
import type { Diet, DietCompletionLog, StepLog, BodyweightLog, OnboardingData, NutritionPhase } from '../types';

const CUPO = { HC: 4, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };

/** Un día con 4 intercambios de hidratos puestos y `marcados` de ellos hechos. */
function dia(date: string, marcados: number): DietCompletionLog {
  return {
    id: `l_${date}`, athleteId: 'ana@x.com', date, dietId: 'd1', budget: CUPO,
    doneItemIds: Array.from({ length: marcados }, (_, i) => `m1_${i}`),
    meals: [{
      id: 'm1', name: 'Comida',
      items: Array.from({ length: 4 }, () => ({ category: 'HC' as const, foodLabel: '30g arroz', quantity: 1 })),
    }],
  };
}

const DIETAS: Diet[] = [];

describe('ventana explícita del análisis nutricional', () => {
  it('sin ventana mira los últimos windowDays hasta hoy', () => {
    const hoy = hoyIsoLocal();
    const r = computeAdherenceRate(
      [dia(hoy, 4), dia(addDays(hoy, -20), 0)],
      DIETAS,
    );
    // El de hace 20 días queda fuera de los 14 por defecto.
    expect(r.daysLogged).toBe(1);
    expect(r.windowDays).toBe(DEFAULT_THRESHOLDS.windowDays);
    expect(r.avgPct).toBe(100);
  });

  it('con ventana explícita solo cuenta los días de esa ventana', () => {
    const r = computeAdherenceRate(
      [dia('2026-09-01', 4), dia('2026-09-05', 2), dia('2026-09-20', 0)],
      DIETAS,
      { ...DEFAULT_THRESHOLDS, ventana: { desde: '2026-09-01', hasta: '2026-09-07' } },
    );
    expect(r.daysLogged).toBe(2);
    expect(r.windowDays).toBe(7);     // 1 a 7 inclusive
    expect(r.avgPct).toBe(75);        // (100 + 50) / 2
  });

  it('los dos extremos de la ventana entran', () => {
    const r = computeAdherenceRate(
      [dia('2026-09-01', 4), dia('2026-09-07', 4)],
      DIETAS,
      { ...DEFAULT_THRESHOLDS, ventana: { desde: '2026-09-01', hasta: '2026-09-07' } },
    );
    expect(r.daysLogged).toBe(2);
  });

  it('la ventana explícita manda también en pasos y en peso', () => {
    const paso = (id: string, date: string, steps: number): StepLog =>
      ({ id, athleteId: 'ana@x.com', date, steps, source: 'manual', createdAt: `${date}T20:00:00.000Z` });
    const pasos: StepLog[] = [paso('s1', '2026-09-02', 8000), paso('s2', '2026-09-25', 2000)];
    const ventana = { desde: '2026-09-01', hasta: '2026-09-07' };
    const p = computeStepCompletionRate(pasos, 8000, { ...DEFAULT_THRESHOLDS, ventana });
    expect(p.daysLogged).toBe(1);
    expect(p.avgPct).toBe(100);

    const peso = (id: string, date: string, weight: number): BodyweightLog =>
      ({ id, athleteId: 'ana@x.com', date, weight, createdAt: `${date}T07:00:00.000Z` });
    const pesos: BodyweightLog[] = [peso('b1', '2026-09-02', 80), peso('b2', '2026-09-06', 79), peso('b3', '2026-09-25', 77)];
    const w = computeWeightTrend(pesos, 75, { ...DEFAULT_THRESHOLDS, ventana });
    expect(w.latestWeight).toBe(79);
    expect(w.deltaFromFirst).toBe(-1);
  });

  it('una ventana sin registros no inventa adherencia', () => {
    const r = computeAdherenceRate(
      [dia('2026-08-01', 4)],
      DIETAS,
      { ...DEFAULT_THRESHOLDS, ventana: { desde: '2026-09-01', hasta: '2026-09-07' } },
    );
    expect(r.daysLogged).toBe(0);
    expect(r.avgPct).toBe(0);
  });
});

describe('computeMacroDeviation con altas incompletas', () => {
  const dieta: Diet = {
    id: 'd1', athleteId: 'ana@x.com', name: 'Déficit',
    budget: { HC: 10, PROT: 7, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [],
  };

  it('un alta sin macroGrams no revienta: devuelve vacío', () => {
    const alta = { targetCalories: 2050 } as unknown as OnboardingData;
    expect(computeMacroDeviation(dieta, alta)).toEqual([]);
  });

  it('salta la categoría cuyo objetivo no es un número', () => {
    const alta = { macroGrams: { hc: 250, prot: undefined, grasa: 60 } } as unknown as OnboardingData;
    const r = computeMacroDeviation(dieta, alta);
    expect(r.map(m => m.category)).toEqual(['HC', 'GRASA']);
  });

  it('con el alta completa calcula la desviación de las tres', () => {
    const alta = { macroGrams: { hc: 250, prot: 175, grasa: 44 } } as unknown as OnboardingData;
    const r = computeMacroDeviation(dieta, alta);
    // 10 int. × 25 g = 250 g de HC: clavado.
    expect(r[0]).toEqual({ category: 'HC', targetGrams: 250, planGrams: 250, deviationPct: 0 });
    expect(r[1].planGrams).toBe(175);
    expect(r[2].planGrams).toBe(44);
  });
});

describe('computeMacroDeviation · contra qué objetivo se compara', () => {
  const dieta: Diet = {
    id: 'd1', athleteId: 'ana@x.com', name: 'Déficit',
    // 10/7/4 intercambios = 250 g HC, 175 g PROT, 44 g GRASA ≈ 2.096 kcal.
    budget: { HC: 10, PROT: 7, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [],
  } as unknown as Diet;

  // Alta calculada para MANTENER: 2.450 kcal.
  const alta = {
    macroSplit: { hc: 45, prot: 30, grasa: 25 },
    macroGrams: { hc: 276, prot: 184, grasa: 68 },
  } as unknown as OnboardingData;

  const fase = (targetKcal: number) =>
    ({ id: 'f1', name: 'Déficit', weeks: 4, dietId: 'd1', targetKcal } as unknown as NutritionPhase);

  it('sin periodización compara contra el alta, como siempre', () => {
    const r = computeMacroDeviation(dieta, alta);
    expect(r.find(m => m.category === 'GRASA')!.targetGrams).toBe(68);
  });

  it('con fase activa compara contra las kcal de LA FASE, no contra el alta', () => {
    // 2.050 kcal al 25 % de grasa = 512,5 kcal ÷ 9 ≈ 56,9 g.
    const r = computeMacroDeviation(dieta, alta, fase(2050));
    const grasa = r.find(m => m.category === 'GRASA')!;
    expect(grasa.targetGrams).toBeCloseTo(56.9, 1);
    expect(grasa.targetGrams).toBeLessThan(68);
  });

  it('la alerta falsa desaparece: la dieta del déficit deja de estar «mal»', () => {
    const contraElAlta = computeMacroDeviation(dieta, alta);
    const contraLaFase = computeMacroDeviation(dieta, alta, fase(2050));
    const desvioAlta = Math.abs(contraElAlta.find(m => m.category === 'HC')!.deviationPct);
    const desvioFase = Math.abs(contraLaFase.find(m => m.category === 'HC')!.deviationPct);
    // Contra la fase, los hidratos están casi clavados; contra el alta, cortos.
    expect(desvioFase).toBeLessThan(desvioAlta);
    expect(desvioFase).toBeLessThan(DEFAULT_THRESHOLDS.macroDeviationOkPct);
  });

  it('el reparto de macros sale del alta: cambian las kcal, no los porcentajes', () => {
    const r = computeMacroDeviation(dieta, alta, fase(2000));
    const total = r.reduce((s, m) => s + m.targetGrams * (m.category === 'GRASA' ? 9 : 4), 0);
    expect(total).toBeCloseTo(2000, 0);
  });

  it('una fase sin kcal declaradas cae al alta en vez de inventar', () => {
    const sinKcal = { id: 'f1', name: 'X', weeks: 4, dietId: 'd1' } as unknown as NutritionPhase;
    expect(computeMacroDeviation(dieta, alta, sinKcal).find(m => m.category === 'GRASA')!.targetGrams).toBe(68);
  });
});
