import { describe, expect, it } from 'vitest';
import { WorkoutExercise, WorkoutEntryLog } from '../types';
import { sugerirCarga, rangoDeReps } from './cargaSugerida';

const we: WorkoutExercise = { exerciseId: 'press', order: 0, sets: 3, reps: '8-12', rir: 2, restSeconds: 120 };
const log = (sets: [number, number, number][]): WorkoutEntryLog => ({
  exerciseId: 'press', sets: sets.map(([weight, repsDone, rir]) => ({ weight, repsDone, rir })),
});

describe('carga sugerida (doble progresión)', () => {
  it('lee rangos de repeticiones', () => {
    expect(rangoDeReps('8-12')).toEqual({ min: 8, max: 12 });
    expect(rangoDeReps('10')).toEqual({ min: 10, max: 10 });
    expect(rangoDeReps('AMRAP')).toBeNull();
  });

  it('sube 2,5 kg en las series que llegaron al tope con el RIR pautado', () => {
    const r = sugerirCarga(we, log([[60, 12, 2], [60, 12, 2], [60, 12, 3]]));
    expect(r.series).toEqual([{ peso: 62.5, reps: 8 }, { peso: 62.5, reps: 8 }, { peso: 62.5, reps: 8 }]);
    expect(r.resumen).toContain('62,5 kg');
  });

  it('no sube si no llegó al tope o si fue más duro de lo pautado', () => {
    const r = sugerirCarga(we, log([[60, 11, 2], [60, 12, 1], [60, 12, 2]]));
    expect(r.series).toEqual([null, null, { peso: 62.5, reps: 8 }]);
    expect(r.resumen).toContain('1 de 3');
  });

  it('+1 kg con cargas ligeras', () => {
    expect(sugerirCarga(we, log([[12, 12, 2], [12, 12, 2], [12, 12, 2]])).series[0]).toEqual({ peso: 13, reps: 8 });
  });

  it('nunca sube una serie hecha al fallo, ni sin sesión previa', () => {
    const fallo: WorkoutEntryLog = { exerciseId: 'press', sets: [{ weight: 60, repsDone: 12, rir: 2, alFallo: true }] };
    expect(sugerirCarga({ ...we, sets: 1 }, fallo).series).toEqual([null]);
    expect(sugerirCarga(we, undefined).resumen).toBeNull();
  });
});
