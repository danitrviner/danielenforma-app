import { describe, it, expect } from 'vitest';
import { rendimientoConservado, avisosDeDescanso } from './reglaDel80';
import type { WorkoutLog, WorkoutSetLog } from '../types';

const s = (weight: number, repsDone: number, rir = 2, extra: Partial<WorkoutSetLog> = {}): WorkoutSetLog => ({ weight, repsDone, rir, ...extra });
const log = (date: string, exerciseId: string, sets: WorkoutSetLog[]): WorkoutLog => ({
  id: `${date}_${exerciseId}`, athleteId: 'a@a.com', workoutId: 'w', assignmentId: 'as', date, completedAt: '',
  entries: [{ exerciseId, sets }],
});

describe('rendimientoConservado (2.ª serie frente a la 1.ª)', () => {
  it('10 → 8 con el mismo peso y RIR es el 80 %', () => {
    expect(rendimientoConservado([s(100, 10), s(100, 8)])).toBe(0.8);
  });
  it('no compara pesos distintos (top set y back-off)', () => {
    expect(rendimientoConservado([s(100, 6), s(85, 10)])).toBeNull();
  });
  it('no compara una serie con margen contra otra al fallo', () => {
    expect(rendimientoConservado([s(100, 10, 2), s(100, 9, 0, { alFallo: true })])).toBeNull();
    expect(rendimientoConservado([s(100, 10, 3), s(100, 9, 0)])).toBeNull();
  });
  it('dos series al fallo sí son comparables', () => {
    expect(rendimientoConservado([s(40, 12, 0, { alFallo: true }), s(40, 9, 0, { alFallo: true })])).toBe(0.75);
  });
  it('con menos de 5 repeticiones en la primera no opina', () => {
    expect(rendimientoConservado([s(140, 4), s(140, 3)])).toBeNull();
  });
  it('las bajadas del drop set no son la 2.ª serie', () => {
    expect(rendimientoConservado([s(50, 12), s(40, 6, 0, { segmento: true }), s(50, 10)])).toBeCloseTo(10 / 12);
  });
  it('con una sola serie no hay nada que comparar', () => {
    expect(rendimientoConservado([s(100, 10)])).toBeNull();
  });
});

describe('avisosDeDescanso', () => {
  it('avisa de descanso corto cuando se repite en 2 de las últimas 3 sesiones', () => {
    const logs = [
      log('2026-11-01', 'press', [s(80, 10), s(80, 7)]),
      log('2026-11-04', 'press', [s(80, 10), s(80, 9)]),
      log('2026-11-08', 'press', [s(80, 10), s(80, 7)]),
    ];
    const [a] = avisosDeDescanso(logs);
    expect(a).toMatchObject({ exerciseId: 'press', tipo: 'corto', sesiones: 3, coinciden: 2 });
    expect(a.conservadoPct).toBe(77);
  });
  it('una sola sesión mala no dispara nada', () => {
    const logs = [
      log('2026-11-01', 'press', [s(80, 10), s(80, 9)]),
      log('2026-11-04', 'press', [s(80, 10), s(80, 9)]),
      log('2026-11-08', 'press', [s(80, 10), s(80, 6)]),
    ];
    expect(avisosDeDescanso(logs)).toEqual([]);
  });
  it('solo mira las 3 sesiones más recientes: lo que pasaba hace un mes ya no cuenta', () => {
    const logs = [
      log('2026-10-01', 'press', [s(80, 10), s(80, 6)]),
      log('2026-10-05', 'press', [s(80, 10), s(80, 6)]),
      log('2026-11-01', 'press', [s(80, 10), s(80, 9)]),
      log('2026-11-04', 'press', [s(80, 10), s(80, 8)]),
      log('2026-11-08', 'press', [s(80, 10), s(80, 8)]),
    ];
    expect(avisosDeDescanso(logs)).toEqual([]);
  });
  it('avisa de que sobra descanso solo si lo conserva en TODAS las sesiones miradas', () => {
    const sobrado = [log('2026-11-01', 'curl', [s(15, 12), s(15, 12)]), log('2026-11-05', 'curl', [s(15, 12), s(15, 11)])];
    expect(avisosDeDescanso(sobrado)[0]).toMatchObject({ exerciseId: 'curl', tipo: 'sobrado', coinciden: 2 });
    const mixto = [...sobrado, log('2026-11-09', 'curl', [s(15, 12), s(15, 10)])];
    expect(avisosDeDescanso(mixto)).toEqual([]);
  });
  it('con una sola sesión comparable no avisa', () => {
    expect(avisosDeDescanso([log('2026-11-08', 'press', [s(80, 10), s(80, 6)])])).toEqual([]);
  });
  it('trae el descanso real cuando las series llevan hora', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 10, 8, 18, m)).toISOString();
    const logs = [
      log('2026-11-04', 'press', [s(80, 10, 2, { hechaEn: t(0) }), s(80, 7, 2, { hechaEn: t(2) })]),
      log('2026-11-08', 'press', [s(80, 10, 2, { hechaEn: t(0) }), s(80, 7, 2, { hechaEn: t(2) })]),
    ];
    expect(avisosDeDescanso(logs)[0].descansoRealSeg).toBe(75);
  });
  it('se puede limitar a los ejercicios de la ventana, y ordena lo que más pierde primero', () => {
    const logs = [
      log('2026-11-01', 'press', [s(80, 10), s(80, 7)]), log('2026-11-05', 'press', [s(80, 10), s(80, 7)]),
      log('2026-11-01', 'remo', [s(60, 10), s(60, 6)]), log('2026-11-05', 'remo', [s(60, 10), s(60, 6)]),
    ];
    expect(avisosDeDescanso(logs).map(a => a.exerciseId)).toEqual(['remo', 'press']);
    expect(avisosDeDescanso(logs, ['press']).map(a => a.exerciseId)).toEqual(['press']);
  });
});
