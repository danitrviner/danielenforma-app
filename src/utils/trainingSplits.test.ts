import { describe, expect, it } from 'vitest';
import {
  TRAINING_SPLITS, DAY_TYPE_MUSCLES, getSplitsForDays, DESCANSO,
  cicloDeSplit, sesionesDeSplit, tiposDeEntrenamiento, offsetsDeSplit,
} from './trainingSplits';

describe('TRAINING_SPLITS', () => {
  it('no repite ids', () => {
    const ids = TRAINING_SPLITS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo día de entrenamiento tiene grupos musculares declarados', () => {
    // Un tipo de día ausente de DAY_TYPE_MUSCLES no bloquea al grupo, pero cae
    // por el fallback de la distribución — es decir, el reparto deja de repartir.
    const tipos = new Set(TRAINING_SPLITS.flatMap(s => tiposDeEntrenamiento(s)));
    for (const t of tipos) {
      expect(DAY_TYPE_MUSCLES[t], `falta "${t}" en DAY_TYPE_MUSCLES`).toBeDefined();
      expect(DAY_TYPE_MUSCLES[t].length).toBeGreaterThan(0);
    }
  });

  it('el descanso no es un tipo de día con grupos', () => {
    expect(DAY_TYPE_MUSCLES[DESCANSO]).toBeUndefined();
  });

  it('los offsets caben en el ciclo y no se repiten', () => {
    for (const split of TRAINING_SPLITS) {
      const offsets = offsetsDeSplit(split);
      expect(offsets).toHaveLength(sesionesDeSplit(split));
      expect(new Set(offsets).size).toBe(offsets.length);
      expect(Math.max(...offsets)).toBeLessThan(cicloDeSplit(split));
    }
  });

  it('hay repartos para cada número de sesiones de 2 a 10', () => {
    for (const sesiones of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(getSplitsForDays(sesiones).length, `sin repartos de ${sesiones} sesiones`).toBeGreaterThan(0);
    }
  });

  it('getSplitsForDays filtra por SESIONES, no por días del ciclo', () => {
    for (const sesiones of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(getSplitsForDays(sesiones).every(s => sesionesDeSplit(s) === sesiones)).toBe(true);
    }
    // El rotativo quincenal de 3 días/semana son 6 sesiones repartidas en 14 días.
    const seis = getSplitsForDays(6).map(s => s.id);
    expect(seis).toContain('rot14-torso-pierna-3d');
    expect(cicloDeSplit(TRAINING_SPLITS.find(s => s.id === 'rot14-torso-pierna-3d')!)).toBe(14);
  });

  it('un reparto semanal ocupa siempre un ciclo de 7 días', () => {
    const semanales = TRAINING_SPLITS.filter(s => !s.id.startsWith('rot-') && !s.id.startsWith('rot14-'));
    for (const s of semanales) expect(cicloDeSplit(s)).toBe(7);
  });
});
