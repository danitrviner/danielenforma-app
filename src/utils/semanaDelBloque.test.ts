import { describe, expect, it } from 'vitest';
import { diasDeSemanaDelBloque, semanaDelBloque, totalDeSemanasDelBloque } from './semanaDelBloque';

describe('semanaDelBloque (F5)', () => {
  const semanal = { startDate: '2026-10-05', weeks: 10, daysPerWeek: 4 };
  const de14 = { startDate: '2026-10-05', weeks: 8, daysPerWeek: 6, cycleDays: 14 };

  it('con ciclo semanal es la semana de calendario del bloque', () => {
    expect(diasDeSemanaDelBloque(semanal)).toBe(7);
    expect(semanaDelBloque(semanal, '2026-10-05')).toBe(1);
    expect(semanaDelBloque(semanal, '2026-10-11')).toBe(1);
    expect(semanaDelBloque(semanal, '2026-10-12')).toBe(2);
    expect(semanaDelBloque(semanal, '2026-10-19')).toBe(3);
    expect(totalDeSemanasDelBloque(semanal)).toBe(10);
  });

  it('con un ciclo de 14 días la semana es la vuelta: 8 semanas son 4', () => {
    expect(diasDeSemanaDelBloque(de14)).toBe(14);
    expect(semanaDelBloque(de14, '2026-10-18')).toBe(1);
    expect(semanaDelBloque(de14, '2026-10-19')).toBe(2);
    expect(totalDeSemanasDelBloque(de14)).toBe(4);
  });

  it('nunca menos de 1 ni más que las semanas del bloque', () => {
    expect(semanaDelBloque(semanal, '2026-09-01')).toBe(1);
    expect(semanaDelBloque(semanal, '2027-03-01')).toBe(10);
    expect(semanaDelBloque(de14, '2027-03-01')).toBe(4);
  });

  it('sin datos del ciclo la vuelta dura una semana, y sin duración no hay tope', () => {
    const soloInicio = { startDate: '2026-10-05' };
    expect(diasDeSemanaDelBloque(soloInicio)).toBe(7);
    expect(totalDeSemanasDelBloque(soloInicio)).toBeNull();
    expect(semanaDelBloque(soloInicio, '2026-12-14')).toBe(11);
    // Quien no tiene el mesociclo delante pasa los días del ciclo a mano.
    expect(semanaDelBloque(soloInicio, '2026-10-19', 14)).toBe(2);
  });
});
