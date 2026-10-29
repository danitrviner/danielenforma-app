import { describe, it, expect } from 'vitest';
import { bloqueCerradoRecientemente, textoCierre, finDePlan, diasHastaFinDePlan } from './cierreParaAtleta';
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

describe('textoCierre', () => {
  it('tres cifras y las frases del motor', () => {
    const t = textoCierre({
      numero: 2,
      sesiones: { registradas: 20, programadas: 24, completadas: 20, adherenciaPct: 83 },
      volumen: { filas: [], totalProgramadas: 300, totalRealizadas: 270, pct: 90 },
      informe: { perExercise: [{ isPR: true }, { isPR: false }, { isPR: true }] } as never,
      resumenParaCliente: 'Has subido en press y en remo.',
    }, 'Hipertrofia 1');
    expect(t).toBe('Bloque «Hipertrofia 1» terminado: 20 de 24 sesiones, 90 % del trabajo programado, 2 récords. Has subido en press y en remo.');
  });
});

describe('fin del plan', () => {
  it('tres meses desde el inicio', () => {
    expect(finDePlan({ planStartDate: '2026-09-04', planDurationMonths: 3 })).toBe('2026-12-04');
    expect(diasHastaFinDePlan({ planStartDate: '2026-08-19', planDurationMonths: 3 }, HOY)).toBe(21);
    expect(diasHastaFinDePlan({}, HOY)).toBeNull();
  });
});
