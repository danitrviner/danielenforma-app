import { describe, it, expect } from 'vitest';
import { consejoDeDiaMalo, diasMalosSeguidos, esPeorQueLaUltimaVez } from './diaMalo';
import type { WorkoutLog, WorkoutSetLog } from '../types';

const serie = (weight: number, repsDone: number, rir = 2): WorkoutSetLog => ({ weight, repsDone, rir });
const fila = (weight: string, repsDone: string, done: boolean, rir = '2') => ({ weight, repsDone, rir, done });
const PREVIA = { sets: [serie(80, 10), serie(80, 9), serie(80, 8)] };

describe('esPeorQueLaUltimaVez', () => {
  it('2 reps menos con el mismo peso y RIR: sí', () => {
    expect(esPeorQueLaUltimaVez(serie(80, 8), serie(80, 10))).toBe(true);
  });
  it('1 rep menos es variabilidad normal', () => {
    expect(esPeorQueLaUltimaVez(serie(80, 9), serie(80, 10))).toBe(false);
  });
  it('con otro peso no se compara', () => {
    expect(esPeorQueLaUltimaVez(serie(85, 7), serie(80, 10))).toBe(false);
  });
  it('si hoy ha parado con más margen, hacer menos reps no es rendir peor', () => {
    expect(esPeorQueLaUltimaVez(serie(80, 8, 4), serie(80, 10, 2))).toBe(false);
  });
});

describe('consejoDeDiaMalo', () => {
  it('tras una primera serie claramente peor, propone bajar el peso y quitar la última', () => {
    const c = consejoDeDiaMalo([fila('80', '8', true), fila('80', '', false), fila('80', '', false)], PREVIA)!;
    expect(c.peso).toBe(75);
    expect(c.seriesPendientes).toEqual([1, 2]);
    expect(c.texto).toContain('75 kg');
    expect(c.texto).toContain('te quitas la última serie');
  });
  it('con cargas pequeñas redondea al kilo', () => {
    const c = consejoDeDiaMalo([fila('12', '8', true), fila('12', '', false)], { sets: [serie(12, 11)] })!;
    expect(c.peso).toBe(11);
    expect(c.texto).not.toContain('te quitas la última serie');
  });
  it('no dice nada si la primera serie va como siempre', () => {
    expect(consejoDeDiaMalo([fila('80', '10', true), fila('80', '', false)], PREVIA)).toBeNull();
  });
  it('no dice nada sin sesión anterior ni cuando ya van dos series', () => {
    expect(consejoDeDiaMalo([fila('80', '8', true), fila('80', '', false)], undefined)).toBeNull();
    expect(consejoDeDiaMalo([fila('80', '8', true), fila('80', '7', true), fila('80', '', false)], PREVIA)).toBeNull();
  });
  it('no dice nada si no queda ninguna serie por hacer', () => {
    expect(consejoDeDiaMalo([fila('80', '8', true)], PREVIA)).toBeNull();
  });
  it('una serie al fallo cuenta como RIR 0', () => {
    const c = consejoDeDiaMalo([fila('80', '8', true, 'fallo'), fila('80', '', false)], PREVIA);
    expect(c).not.toBeNull();
  });
});

describe('diasMalosSeguidos', () => {
  const log = (date: string, reps: number): WorkoutLog => ({
    id: date, athleteId: 'a@a.com', workoutId: 'w', assignmentId: 'as', date, completedAt: '',
    entries: [{ exerciseId: 'press', sets: [serie(80, reps)] }],
  });
  it('cuenta las sesiones recientes seguidas empezando peor', () => {
    expect(diasMalosSeguidos([log('2026-11-01', 10), log('2026-11-04', 8), log('2026-11-08', 6)], 'press')).toBe(2);
  });
  it('una sola sesión mala es 1; si la última va bien, 0', () => {
    expect(diasMalosSeguidos([log('2026-11-01', 10), log('2026-11-04', 10), log('2026-11-08', 8)], 'press')).toBe(1);
    expect(diasMalosSeguidos([log('2026-11-01', 10), log('2026-11-04', 8), log('2026-11-08', 10)], 'press')).toBe(0);
  });
  it('un ejercicio que no aparece no tiene días malos', () => {
    expect(diasMalosSeguidos([log('2026-11-01', 10)], 'remo')).toBe(0);
  });
});
