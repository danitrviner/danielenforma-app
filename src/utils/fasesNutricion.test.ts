import { describe, it, expect } from 'vitest';
import { computeActivePhase, computePhaseStartDate } from './fasesNutricion';
import type { NutritionProgram, NutritionPhase } from '../types';

function fase(name: string, weeks: number): NutritionPhase {
  return { id: name, name, weeks, kind: 'deficit', targetKcal: 2000, dietId: 'd1' } as unknown as NutritionPhase;
}

const PROGRAMA: NutritionProgram = {
  athleteId: 'ana@x.com',
  startDate: '2026-09-01',
  phases: [fase('Déficit 1', 4), fase('Mantenimiento', 2), fase('Déficit 2', 4)],
} as NutritionProgram;

describe('computePhaseStartDate', () => {
  it('la primera fase empieza el día que dice el programa, ni un día antes', () => {
    // El fallo que arregla: con `toISOString()` sobre una fecha construida en
    // hora local, en España salía siempre '2026-08-31'.
    expect(computePhaseStartDate(PROGRAMA, 0)).toBe('2026-09-01');
  });

  it('cada fase empieza justo donde acaba la anterior', () => {
    expect(computePhaseStartDate(PROGRAMA, 1)).toBe('2026-09-29');   // +4 semanas
    expect(computePhaseStartDate(PROGRAMA, 2)).toBe('2026-10-13');   // +2 más
  });

  it('cruza el cambio de hora de octubre sin perder ni ganar un día', () => {
    // En 2026 el horario de verano acaba en España el 25 de octubre.
    const p = { ...PROGRAMA, startDate: '2026-10-19', phases: [fase('A', 2), fase('B', 2)] };
    expect(computePhaseStartDate(p, 1)).toBe('2026-11-02');
  });

  it('un índice más allá de las fases da el día siguiente al fin del programa', () => {
    // 1 sep + 4 + 2 + 4 semanas. No se sale del array ni devuelve NaN: es
    // donde empezaría la fase que vendría después, que es lo que usa el panel
    // al añadir una.
    expect(computePhaseStartDate(PROGRAMA, 99)).toBe('2026-11-10');
  });

  it('una fecha de inicio inválida se devuelve tal cual, sin inventar', () => {
    const roto = { ...PROGRAMA, startDate: '' };
    expect(computePhaseStartDate(roto, 1)).toBe('');
  });
});

describe('computeActivePhase', () => {
  it('devuelve la fase que le toca a esa fecha', () => {
    expect(computeActivePhase(PROGRAMA, '2026-09-01')?.name).toBe('Déficit 1');
    expect(computeActivePhase(PROGRAMA, '2026-09-28')?.name).toBe('Déficit 1');
    expect(computeActivePhase(PROGRAMA, '2026-09-29')?.name).toBe('Mantenimiento');
    expect(computeActivePhase(PROGRAMA, '2026-10-13')?.name).toBe('Déficit 2');
  });

  it('el primer día de una fase pertenece a esa fase, no a la anterior', () => {
    const inicio = computePhaseStartDate(PROGRAMA, 1);
    expect(computeActivePhase(PROGRAMA, inicio)?.name).toBe('Mantenimiento');
  });

  it('fuera del programa no hay fase activa', () => {
    expect(computeActivePhase(PROGRAMA, '2026-08-31')).toBeNull();
    expect(computeActivePhase(PROGRAMA, '2026-11-11')).toBeNull();
  });
});
