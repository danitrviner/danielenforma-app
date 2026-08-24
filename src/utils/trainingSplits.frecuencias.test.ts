import { describe, expect, it } from 'vitest';
import { MuscleGroup } from '../types';
import {
  TRAINING_SPLITS, cicloDeSplit, sesionesDeSplit, offsetsDeSplit, frecuenciaSemanalDeSplit,
} from './trainingSplits';

const porId = (id: string) => TRAINING_SPLITS.find(s => s.id === id)!;

describe('repartos rotativos de 14 días · las frecuencias «y media»', () => {
  it('Torso-Pierna alternos a 3 días deja los dos grupos a 1,5 por semana', () => {
    const split = porId('rot14-torso-pierna-3d');
    expect(cicloDeSplit(split)).toBe(14);
    expect(sesionesDeSplit(split)).toBe(6);
    expect(frecuenciaSemanalDeSplit(split, 'pecho')).toBe(1.5);
    expect(frecuenciaSemanalDeSplit(split, 'cuadriceps')).toBe(1.5);
  });

  it('Torso-Pierna alternos a 5 días deja los dos grupos a 2,5 por semana', () => {
    const split = porId('rot14-torso-pierna-5d');
    expect(sesionesDeSplit(split)).toBe(10);
    expect(frecuenciaSemanalDeSplit(split, 'pecho')).toBe(2.5);
  });

  it('las sesiones se reparten uniformes por los 14 días, no clavadas siempre en la misma semana', () => {
    // Nada agrupa las 6 sesiones en "primeros 7 días llenos, últimos 7 vacíos":
    // el hueco más grande entre dos sesiones consecutivas (incluido el salto de
    // vuelta) no puede ser mayor que el que dejaría un reparto uniforme.
    for (const id of ['rot14-torso-pierna-3d', 'rot14-push-pull-3d', 'rot14-torso-pierna-5d', 'rot14-ppl-4d', 'rot14-ppl-5d']) {
      const split = porId(id);
      const offsets = offsetsDeSplit(split);
      const cicloDias = cicloDeSplit(split);
      expect(new Set(offsets).size).toBe(offsets.length);
      const huecos = offsets.map((o, i) => (i === 0 ? o + (cicloDias - offsets[offsets.length - 1]) : o - offsets[i - 1]));
      const huecoMax = Math.max(...huecos);
      // Con reparto clavado a la semana, el hueco de "fin de la 1ª semana llena
      // a inicio de la 2ª" llegaba a valer 8-9 días. Repartido uniforme, ningún
      // hueco pasa de ceil(cicloDias / sesiones) + 1.
      expect(huecoMax).toBeLessThanOrEqual(Math.ceil(cicloDias / offsets.length) + 1);
    }
  });

  it('el ejemplo de Dani (9 días, Torso-Pierna-Full-Descanso-Brazo-Torso-Descanso-Pierna-Descanso) da la frecuencia que toca', () => {
    const split = porId('rot-9-torso-pierna-full-brazo');
    expect(cicloDeSplit(split)).toBe(9);
    expect(split.dayTypes).toEqual([
      'Torso', 'Pierna', 'Full body', 'Descanso', 'Brazo/Hombro', 'Torso', 'Descanso', 'Pierna', 'Descanso',
    ]);
    // frecuenciaSemanalDeSplit cuenta cualquier tipo de día compatible con el
    // grupo — para pecho eso es Torso (días 0 y 5) Y Full body (día 2), que
    // por definición cubre los 17 grupos: 3 apariciones en 9 días → 2,33/sem.
    // Cuádriceps, en cambio, solo lo cubren Pierna y Full body: también 3.
    expect(frecuenciaSemanalDeSplit(split, 'pecho')).toBe(2.33);
    expect(frecuenciaSemanalDeSplit(split, 'cuadriceps')).toBe(2.33);
    // Un grupo que SOLO cubre Torso (sin Full body de por medio) sí da la
    // frecuencia «pura» de 2 apariciones en 9 días: 1,56/sem.
    const soloTorso = frecuenciaSemanalDeSplit(
      { ...split, dayTypes: split.dayTypes.map(t => t === 'Full body' ? 'Descanso' : t) },
      'pecho',
    );
    expect(soloTorso).toBe(1.56);
  });
});

describe('repartos rotativos cortos · frecuencias por días entre sesiones', () => {
  it('entrenar un grupo cada 4 días son 1,75 por semana', () => {
    const split = porId('rot-4-ppl');
    expect(cicloDeSplit(split)).toBe(4);
    expect(frecuenciaSemanalDeSplit(split, 'pecho')).toBe(1.75);
  });

  it('entrenar un grupo cada 5 días son 1,4 por semana', () => {
    const split = porId('rot-5-ppl');
    expect(cicloDeSplit(split)).toBe(5);
    expect(frecuenciaSemanalDeSplit(split, 'pecho')).toBe(1.4);
  });

  it('los semanales siguen dando frecuencias enteras', () => {
    expect(frecuenciaSemanalDeSplit(porId('6-ppl-x2'), 'pecho')).toBe(2);
    expect(frecuenciaSemanalDeSplit(porId('3-push-pull-legs'), 'pecho')).toBe(1);
  });
});
