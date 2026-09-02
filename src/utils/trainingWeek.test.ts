import { describe, it, expect } from 'vitest';
import { esFechaIso, addDays } from './trainingWeek';

describe('esFechaIso', () => {
  it('acepta una fecha de calendario real', () => {
    expect(esFechaIso('2026-09-02')).toBe(true);
    expect(esFechaIso('2024-02-29')).toBe(true); // bisiesto
  });

  it('rechaza lo que tumbaba la pantalla al crear un mesociclo', () => {
    expect(esFechaIso('')).toBe(false);            // campo a medio teclear
    expect(esFechaIso('2026-09')).toBe(false);     // incompleto
    expect(esFechaIso('20026-09-02')).toBe(false); // año de 5 cifras
    expect(esFechaIso('2026-13-01')).toBe(false);  // mes inexistente
    expect(esFechaIso('2026-02-30')).toBe(false);  // día inexistente
    expect(esFechaIso(undefined)).toBe(false);
    expect(esFechaIso(null)).toBe(false);
    expect(esFechaIso(20260902)).toBe(false);
  });

  it('una fecha que pasa el filtro nunca revienta al convertirse en Date', () => {
    for (const f of ['2026-09-02', '2024-02-29', '2030-12-31']) {
      expect(esFechaIso(f)).toBe(true);
      expect(() => new Date(f + 'T00:00:00').toISOString()).not.toThrow();
    }
  });
});

describe('addDays', () => {
  it('suma en local sin pasar por UTC', () => {
    expect(addDays('2026-09-02', 7)).toBe('2026-09-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
