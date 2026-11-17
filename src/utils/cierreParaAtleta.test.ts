import { describe, it, expect } from 'vitest';
import { bloqueCerradoRecientemente, finDePlan, diasHastaFinDePlan } from './cierreParaAtleta';
import type { Mesocycle } from '../types';

const HOY = '2026-10-29';
const meso = (id: string, startDate: string, weeks: number, name?: string): Mesocycle => ({ id, athleteId: 'a', startDate, weeks, name } as Mesocycle);

describe('bloqueCerradoRecientemente', () => {
  it('el que acabó hace menos de dos semanas; el más reciente si hay varios', () => {
    const m = bloqueCerradoRecientemente([meso('viejo', '2026-07-01', 6), meso('reciente', '2026-09-07', 6, 'Hipertrofia 1'), meso('enCurso', '2026-10-19', 8)], HOY);
    expect(m?.id).toBe('reciente');
  });
  it('nada si acabó hace más de 14 días o no ha acabado', () => {
    expect(bloqueCerradoRecientemente([meso('viejo', '2026-07-01', 6), meso('enCurso', '2026-10-19', 8)], HOY)).toBeNull();
  });
});

describe('bloqueCerradoRecientemente con ciclo distinto de 7 (F5)', () => {
  // 4 semanas con ciclo de 10 días son 3 vueltas = 30 días: del 1 al 30 de junio.
  const deDiez = { id: 'diez', athleteId: 'a', startDate: '2026-06-01', weeks: 4, daysPerWeek: 4, cycleDays: 10 } as Mesocycle;
  it('no lo da por cerrado mientras le quedan días de la última vuelta', () => {
    expect(bloqueCerradoRecientemente([deDiez], '2026-06-29')).toBeNull(); // con weeks × 7 ya había «acabado» el 28
    expect(bloqueCerradoRecientemente([deDiez], '2026-06-30')).toBeNull(); // su último día
    expect(bloqueCerradoRecientemente([deDiez], '2026-07-01')?.id).toBe('diez');
  });
  it('los 14 días del aviso cuentan desde su fin real', () => {
    expect(bloqueCerradoRecientemente([deDiez], '2026-07-14')?.id).toBe('diez');
    expect(bloqueCerradoRecientemente([deDiez], '2026-07-15')).toBeNull();
  });
});

describe('fin del plan', () => {
  it('tres meses desde el inicio', () => {
    expect(finDePlan({ planStartDate: '2026-09-04', planDurationMonths: 3 })).toBe('2026-12-04');
    expect(diasHastaFinDePlan({ planStartDate: '2026-08-19', planDurationMonths: 3 }, HOY)).toBe(21);
    expect(diasHastaFinDePlan({}, HOY)).toBeNull();
  });
});
