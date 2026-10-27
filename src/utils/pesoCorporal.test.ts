import { describe, it, expect } from 'vitest';
import type { Exercise, WorkoutLog } from '../types';
import { esEjercicioDePesoCorporal, pesoDeSerie, contextoPesoCorporal } from './pesoCorporal';
import { aggregate, allTimeBestBefore } from './trainingReport';
import { seriesRealizadas } from './cdg/adaptadores';

/* CR5 (26-10-2026): un atleta de dominadas y fondos tenía 0 tonelaje, 0 IEM y
 * ningún récord porque sus series van a 0 kg. Ahora, cuando se conoce su peso,
 * las series de los ejercicios de peso corporal lo suman al lastre. */

const ej = (id: string, name: string, extra: Partial<Exercise> = {}): Exercise =>
  ({ id, ownerId: 'coach', name, primaryFocus: '', muscleGroup: 'dorsal', type: 'fuerza', isCustom: false, ...extra });

describe('esEjercicioDePesoCorporal', () => {
  it('lo dice el campo y, si no lo trae, el nombre', () => {
    expect(esEjercicioDePesoCorporal(ej('d', 'Dominadas pronas'))).toBe(true);
    expect(esEjercicioDePesoCorporal(ej('f', 'Fondos en paralelas'))).toBe(true);
    expect(esEjercicioDePesoCorporal(ej('p', 'Press banca'))).toBe(false);
    expect(esEjercicioDePesoCorporal(ej('x', 'Press banca', { pesoCorporal: true }))).toBe(true);
    expect(esEjercicioDePesoCorporal(ej('y', 'Dominadas', { pesoCorporal: false }))).toBe(false);
    expect(esEjercicioDePesoCorporal(undefined)).toBe(false);
  });
});

describe('pesoDeSerie', () => {
  const ctx = contextoPesoCorporal([ej('d', 'Dominadas'), ej('p', 'Press banca')], 80);
  it('suma el peso corporal al lastre solo en los ejercicios que lo son', () => {
    expect(pesoDeSerie(0, 'd', ctx)).toBe(80);
    expect(pesoDeSerie(10, 'd', ctx)).toBe(90);
    expect(pesoDeSerie(100, 'p', ctx)).toBe(100);
  });
  it('sin peso conocido o sin contexto, lo apuntado', () => {
    expect(pesoDeSerie(0, 'd', contextoPesoCorporal([ej('d', 'Dominadas')], null))).toBe(0);
    expect(pesoDeSerie(12, 'd')).toBe(12);
  });
});

describe('informes y CDG con peso corporal', () => {
  const ejercicios = [ej('d', 'Dominadas'), ej('p', 'Press banca', { muscleGroup: 'pecho' })];
  const log: WorkoutLog = {
    id: 'l1', athleteId: 'a', workoutId: 'w', assignmentId: 'as', date: '2026-10-20', completedAt: '2026-10-20T10:00:00.000Z',
    entries: [
      { exerciseId: 'd', sets: [{ weight: 0, repsDone: 8, rir: 2 }, { weight: 10, repsDone: 6, rir: 1 }] },
      { exerciseId: 'p', sets: [{ weight: 80, repsDone: 8, rir: 2 }] },
    ],
  };

  it('el tonelaje y el 1RM de las dominadas cuentan el peso del atleta', () => {
    const sin = aggregate([log]);
    expect(sin.perExercise.get('d')!.tonnage).toBe(60); // 0×8 + 10×6: solo el lastre
    const con = aggregate([log], contextoPesoCorporal(ejercicios, 80));
    expect(con.perExercise.get('d')!.tonnage).toBe(80 * 8 + 90 * 6);
    expect(con.perExercise.get('d')!.bestOrm).toBeGreaterThan(90);
    expect(con.perExercise.get('d')!.bestOrm).toBeGreaterThan(sin.perExercise.get('d')!.bestOrm);
    expect(con.perExercise.get('p')).toEqual(sin.perExercise.get('p'));
    expect(allTimeBestBefore([log], '2026-10-21', contextoPesoCorporal(ejercicios, 80)).get('d')).toBeGreaterThan(90);
  });

  it('el CDG ya no descarta las series de dominadas a 0 kg cuando conoce el peso', () => {
    const nombreCdgDe = (id: string) => (id === 'd' ? 'Dominadas' : undefined);
    expect(seriesRealizadas(log.entries[0], nombreCdgDe)).toHaveLength(1);
    const con = seriesRealizadas(log.entries[0], nombreCdgDe, { pesoCorporal: contextoPesoCorporal(ejercicios, 80) });
    expect(con).toHaveLength(2);
    expect(con.map(s => s.weight)).toEqual([80, 90]);
  });
});
