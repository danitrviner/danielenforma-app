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

describe('los repartos semanales no amontonan las sesiones', () => {
  /* El caso de la auditoría (§5): eliges «Torso - Pierna - Torso - Pierna» y la
   * app lo coloca en lunes, martes, miércoles y jueves, con los tres días de
   * descanso juntos al final. Nadie entrena así: lo normal es alternar.
   *
   * `semanal()` rellenaba hasta 7 con descansos AL FINAL, así que las sesiones
   * caían siempre en los primeros días. Ahora se reparten por la semana, que es
   * lo que ya hacía `uniforme()` para los ciclos rotativos.
   *
   * Sigue siendo una PROPUESTA: el coach puede mover los días a mano después. */
  const diasDeEntreno = (id: string) => {
    const split = TRAINING_SPLITS.find(s => s.id === id)!;
    return split.dayTypes.map((t, i) => ({ t, i })).filter(x => x.t !== 'Descanso').map(x => x.i);
  };

  it('cuatro sesiones no caen en cuatro días seguidos', () => {
    expect(diasDeEntreno('4-torso-pierna-x2')).not.toEqual([0, 1, 2, 3]);
  });

  it('con cuatro sesiones hay al menos un descanso intercalado', () => {
    const dias = diasDeEntreno('4-torso-pierna-x2');
    const huecos = dias.slice(1).map((d, i) => d - dias[i]);
    expect(huecos.some(h => h > 1)).toBe(true);
  });

  it('tres sesiones quedan repartidas, no de lunes a miércoles', () => {
    expect(diasDeEntreno('3-push-pull-legs')).not.toEqual([0, 1, 2]);
  });

  it('el reparto sigue durando una semana', () => {
    for (const id of ['2-torso-pierna', '3-push-pull-legs', '4-torso-pierna-x2', '5-torso-pierna-x2-brazo']) {
      expect(TRAINING_SPLITS.find(s => s.id === id)!.dayTypes).toHaveLength(7);
    }
  });

  it('no se pierde ni se inventa ninguna sesión', () => {
    const split = TRAINING_SPLITS.find(s => s.id === '4-torso-pierna-x2')!;
    const sesiones = split.dayTypes.filter(t => t !== 'Descanso');
    expect(sesiones).toEqual(['Torso', 'Pierna', 'Torso', 'Pierna']);
  });

  it('con seis sesiones solo cabe un descanso, y no pasa nada', () => {
    expect(diasDeEntreno('6-ppl-x2')).toHaveLength(6);
  });

  it('siete sesiones ocupan la semana entera', () => {
    expect(diasDeEntreno('7-ppl-x2-full')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
