import { describe, it, expect } from 'vitest';
import { cambiosDeMesociclo, cambiosDeDieta, cambiosDePeriodizacion } from './cambiosPropuesta';
import type { Diet, Mesocycle, MuscleGroup, MuscleGroupConfig, NutritionProgram } from '../types';
import { MUSCLE_ORDER } from '../types';

function meso(series: Partial<Record<MuscleGroup, number>>, extra: Partial<Mesocycle> = {}): Mesocycle {
  const groups = Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;
  return { id: 'm', athleteId: 'a@b.c', number: 1, weeks: 4, startDate: '2026-09-01', objective: 'Hipertrofia', daysPerWeek: 4, groups, ...extra };
}

describe('cambiosDeMesociclo', () => {
  it('sin mesociclo anterior no hay nada que comparar', () => {
    expect(cambiosDeMesociclo(undefined, meso({ pecho: 12 }))).toEqual([]);
  });

  it('cuenta lo que sube, baja, entra y sale, y el total', () => {
    const antes = meso({ pecho: 10, dorsal: 12, biceps: 6 }, { deloadWeek: 4 });
    const ahora = meso({ pecho: 12, dorsal: 10, gluteo: 8 }, { weeks: 5 });
    const cambios = cambiosDeMesociclo(antes, ahora);
    expect(cambios).toContain('Semanas: 4 → 5');
    expect(cambios).toContain('Descarga: fuera (antes en la semana 4)');
    expect(cambios).toContain('Series totales: 28 → 30');
    expect(cambios).toContain('Suben: Pecho 10 → 12');
    expect(cambios).toContain('Bajan: Dorsal 12 → 10');
    expect(cambios).toContain('Entran: Glúteo 8');
    expect(cambios).toContain('Salen: Bíceps (tenía 6)');
  });

  it('un mesociclo idéntico no produce líneas', () => {
    expect(cambiosDeMesociclo(meso({ pecho: 10 }), meso({ pecho: 10 }))).toEqual([]);
  });
});

describe('cambiosDeDieta', () => {
  const dieta = (budget: { HC: number; PROT: number; GRASA: number }, alimentos: string[]): Diet => ({
    id: 'd', athleteId: 'a@b.c', name: 'Base', budget: { MIX_HC: 0, MIX_GRASA: 0, ...budget },
    meals: [{ id: 'm1', name: 'Comida', items: alimentos.map(foodLabel => ({ category: 'HC', foodLabel, quantity: 1 })) }],
  } as Diet);

  it('compara kcal, intercambios y alimentos que entran y salen', () => {
    const base = dieta({ HC: 8, PROT: 6, GRASA: 4 }, ['Arroz', 'Pollo']);
    const nueva = dieta({ HC: 6, PROT: 6, GRASA: 4 }, ['Patata', 'Pollo']);
    const cambios = cambiosDeDieta(base, nueva);
    expect(cambios[0]).toMatch(/^Kcal: \d+ → \d+ \(-\d+\)$/);
    expect(cambios).toContain('HC: 8 → 6 intercambios');
    expect(cambios).toContain('Entran: Patata');
    expect(cambios).toContain('Salen: Arroz');
  });

  it('sin dieta base (primera dieta) no compara', () => {
    expect(cambiosDeDieta(undefined, dieta({ HC: 8, PROT: 6, GRASA: 4 }, []))).toEqual([]);
  });
});

describe('cambiosDePeriodizacion', () => {
  it('compara fases, kcal por fase y recargas', () => {
    const actual = { startDate: '2026-09-01', phases: [{ id: '1', name: 'Déficit', weeks: 4, targetKcal: 1900 }] } as unknown as NutritionProgram;
    const cambios = cambiosDePeriodizacion(actual, {
      startDate: '2026-10-01',
      phases: [{ name: 'Déficit', weeks: 3, targetKcal: 1800 }, { name: 'Mantenimiento', weeks: 1, targetKcal: 2200 }],
      refeedDays: [{ date: '2026-10-15' }],
    });
    expect(cambios).toContain('Fases: 1 (4 sem) → 2 (4 sem)');
    expect(cambios).toContain('Kcal por fase: Déficit 1900 → Déficit 1800 · Mantenimiento 2200');
    expect(cambios).toContain('Recargas: 0 → 1');
  });

  it('sin periodización en marcha no compara', () => {
    expect(cambiosDePeriodizacion(null, { startDate: '2026-10-01', phases: [] })).toEqual([]);
  });
});
