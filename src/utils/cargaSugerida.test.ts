import { describe, expect, it } from 'vitest';
import { WorkoutExercise, WorkoutEntryLog } from '../types';
import { sugerirCarga, consejoEnVivo, rangoDeReps, saltoReal, repsExtraAntesDeSubir } from './cargaSugerida';

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

  it('las bajadas de la última vez no se cuentan como series', () => {
    const previa: WorkoutEntryLog = { exerciseId: 'press', sets: [
      { weight: 60, repsDone: 12, rir: 2 },
      { weight: 48, repsDone: 12, rir: 2, segmento: true, segmentoDe: 1 },
      { weight: 60, repsDone: 10, rir: 2 },
      { weight: 60, repsDone: 12, rir: 2 },
    ] };
    expect(sugerirCarga(we, previa).series).toEqual([{ peso: 62.5, reps: 8 }, null, { peso: 62.5, reps: 8 }]);
  });
});

describe('consejoEnVivo', () => {
  const we = { sets: 3, reps: '8-10', rir: 2 } as Parameters<typeof consejoEnVivo>[0];
  const fila = (weight: string, repsDone: string, rir: string, done: boolean) => ({ weight, repsDone, rir, done });

  it('pasarse del rango con margen pide más peso en la siguiente', () => {
    const c = consejoEnVivo(we, [fila('80', '12', '2', true), fila('80', '', '2', false), fila('80', '', '2', false)]);
    expect(c).toMatchObject({ serie: 1, peso: 82.5 });
    expect(c!.texto).toContain('12 reps en 8-10');
  });

  it('dentro del rango, al fallo o con menos margen del pautado: nada', () => {
    expect(consejoEnVivo(we, [fila('80', '10', '2', true), fila('80', '', '2', false)])).toBeNull();
    expect(consejoEnVivo(we, [fila('80', '12', 'fallo', true), fila('80', '', '2', false)])).toBeNull();
    expect(consejoEnVivo(we, [fila('80', '12', '1', true), fila('80', '', '2', false)])).toBeNull();
  });

  it('si la siguiente ya lleva el peso, no insiste', () => {
    expect(consejoEnVivo(we, [fila('80', '12', '2', true), fila('82.5', '', '2', false)])).toBeNull();
  });
});

describe('salto real de carga (P12)', () => {
  const sesion = (pesos: number[]) => ({ entries: [{ exerciseId: 'lat', sets: pesos.map(weight => ({ weight, repsDone: 12, rir: 2 })) }] });

  it('sale de los pesos que ha ido usando; con uno solo no se sabe', () => {
    expect(saltoReal([sesion([8, 8]), sesion([10, 10]), sesion([12])], 'lat')).toBe(2);
    expect(saltoReal([sesion([8, 8])], 'lat')).toBeNull();
    expect(saltoReal([sesion([20]), sesion([25]), sesion([30]), sesion([32.5])], 'lat')).toBe(5);
  });

  it('el margen de reps sigue la doctrina: salto pequeño no pide nada con un rango normal', () => {
    expect(repsExtraAntesDeSubir(100, 2.5, { min: 8, max: 10 })).toBe(0);
    expect(repsExtraAntesDeSubir(30, 2.5, { min: 8, max: 12 })).toBe(0);
    expect(repsExtraAntesDeSubir(30, 2.5, { min: 10, max: 12 })).toBe(2);
    expect(repsExtraAntesDeSubir(8, 2, { min: 12, max: 15 })).toBe(5);
  });

  it('con un salto grande no sube al llegar al tope: pide abrir el rango y lo explica', () => {
    const we = { exerciseId: 'lat', order: 0, sets: 2, reps: '12-15', rir: 2, restSeconds: 60 };
    const previa = (reps: number) => ({ exerciseId: 'lat', sets: [{ weight: 8, repsDone: reps, rir: 2 }, { weight: 8, repsDone: reps, rir: 2 }] });
    const justo = sugerirCarga(we, previa(15), 2);
    expect(justo.series).toEqual([null, null]);
    expect(justo.resumen).toContain('llega a 20 repeticiones con 8 kg');
    expect(sugerirCarga(we, previa(20), 2).series[0]).toEqual({ peso: 10, reps: 12 });
  });
});
