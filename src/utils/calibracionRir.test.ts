import { describe, expect, it } from 'vitest';
import type { WorkoutLog, WorkoutSetLog } from '../types';
import { calibracionPorEjercicio } from './calibracionRir';

const l = (date: string, sets: WorkoutSetLog[], fuera = false): WorkoutLog => ({
  id: date, athleteId: 'a', workoutId: 'w', assignmentId: date, date, completedAt: '',
  ...(fuera ? { fuera: true } : {}),
  entries: [{ exerciseId: 'ex1', sets: sets.map(s => (fuera ? { ...s, fuera: true } : s)) }],
});

// La estimación: 8 a RIR 2 apuntado con 80 kg; la comprobación, la serie al fallo con los mismos 80 kg.
const estimacion: WorkoutSetLog = { weight: 80, repsDone: 8, rir: 2, rirApuntado: true };
const alFallo: WorkoutSetLog = { weight: 80, repsDone: 13, rir: 0, alFallo: true };

describe('calibración del RIR y sesiones fuera (17-11-2026)', () => {
  it('entre dos sesiones de su gimnasio, los mismos kilos se comparan', () => {
    expect(calibracionPorEjercicio([l('2026-11-03', [estimacion]), l('2026-11-10', [alFallo])])).toHaveLength(1);
  });

  it('si una de las dos es fuera, los mismos kilos no son la misma carga: no se compara', () => {
    expect(calibracionPorEjercicio([l('2026-11-03', [estimacion], true), l('2026-11-10', [alFallo])])).toEqual([]);
    expect(calibracionPorEjercicio([l('2026-11-03', [estimacion]), l('2026-11-10', [alFallo], true)])).toEqual([]);
  });
});
