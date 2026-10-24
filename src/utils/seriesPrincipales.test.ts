import { describe, it, expect } from 'vitest';
import { WorkoutLog } from '../types';
import { seriesPrincipales } from './seriesPrincipales.js';
import { aggregate } from './trainingReport';

describe('seriesPrincipales', () => {
  it('quita bajadas y miniseries, conserva las series', () => {
    const sets: { n: number; segmento?: boolean }[] = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4, segmento: true }, { n: 5, segmento: true }];
    expect(seriesPrincipales(sets)).toHaveLength(3);
  });
  it('un registro antiguo sin la marca se cuenta entero', () => {
    expect(seriesPrincipales<{ n: number; segmento?: boolean }>([{ n: 1 }, { n: 2 }])).toHaveLength(2);
  });
});

// 3 series normales + una bajada tras la última (drop set solo en la 3ª).
const logConDrop: WorkoutLog = {
  id: 'l1', athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date: '2026-06-02', completedAt: '2026-06-02T10:00:00.000Z',
  entries: [{ exerciseId: 'pec', sets: [
    { weight: 70, repsDone: 12, rir: 1 }, { weight: 70, repsDone: 11, rir: 1 }, { weight: 70, repsDone: 10, rir: 0 },
    { weight: 56, repsDone: 8, rir: 0, segmento: true },
  ] }],
};

describe('el drop set se suma a la serie, no la sustituye', () => {
  it('el informe cuenta 3 series pero el tonelaje incluye la bajada', () => {
    const { tonnage, perExercise } = aggregate([logConDrop]);
    expect(perExercise.get('pec')!.sets).toBe(3);
    expect(tonnage).toBe(70 * 12 + 70 * 11 + 70 * 10 + 56 * 8);
  });
});
