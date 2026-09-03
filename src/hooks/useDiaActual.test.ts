import { describe, it, expect, vi, afterEach } from 'vitest';
import { diaSemanaDe } from './useDiaActual';
import { hoyIsoLocal } from '../utils/trainingWeek';

afterEach(() => vi.useRealTimers());

describe('la fecha del día es LOCAL, no UTC', () => {
  it('a la 1 de la madrugada en España el día ya es el nuevo', () => {
    // Este era el fallo: `toISOString()` da la fecha en UTC, así que entre las
    // 00:00 y las 02:00 de España el registro se escribía en el día de ayer y
    // al volver a abrir la app "no había nada guardado".
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 1, 30)); // 2 sep, 01:30 hora local
    expect(hoyIsoLocal()).toBe('2026-09-02');
    expect(new Date().toISOString().split('T')[0]).not.toBe('2026-09-02');
  });

  it('a las 23:30 sigue siendo el mismo día', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 1, 23, 30));
    expect(hoyIsoLocal()).toBe('2026-09-01');
  });
});

describe('diaSemanaDe', () => {
  it('lee la fecha como local, no como medianoche UTC', () => {
    // El 2026-09-01 es martes. Leerla con `new Date('2026-09-01')` la
    // interpretaría como medianoche UTC y en zonas al oeste daría lunes.
    expect(diaSemanaDe('2026-09-01')).toBe('tue');
  });

  it('cubre la semana entera', () => {
    expect([
      diaSemanaDe('2026-08-31'), diaSemanaDe('2026-09-01'), diaSemanaDe('2026-09-02'),
      diaSemanaDe('2026-09-03'), diaSemanaDe('2026-09-04'), diaSemanaDe('2026-09-05'),
      diaSemanaDe('2026-09-06'),
    ]).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });
});
