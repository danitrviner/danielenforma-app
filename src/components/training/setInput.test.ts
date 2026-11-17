import { describe, expect, it } from 'vitest';
import { resumenRangosPautados, tieneReps, seriesHechas } from './setInput';

describe('resumenRangosPautados', () => {
  it('todas las series con el mismo rango: solo el rango, sin conteo', () => {
    expect(resumenRangosPautados([{ reps: '8-12' }, { reps: '8-12' }, { reps: '8-12' }])).toBe('8-12');
  });

  it('rangos distintos: agrupa consecutivas iguales con conteo', () => {
    expect(resumenRangosPautados([
      { reps: '6-7' }, { reps: '6-7' }, { reps: '6-7' }, { reps: '8-9' },
    ])).toBe('3x6-7, 1x8-9');
  });

  it('un solo grupo repetido no lleva conteo aunque sean varias series', () => {
    expect(resumenRangosPautados([{ reps: '12' }, { reps: '12' }])).toBe('12');
  });

  it('sin series pautadas, null', () => {
    expect(resumenRangosPautados([])).toBeNull();
    expect(resumenRangosPautados([{ reps: '' }, { reps: '   ' }])).toBeNull();
  });
});

describe('F23: una serie sin repeticiones no se da por hecha', () => {
  const fila = (weight: string, repsDone: string, done = true) => ({ weight, repsDone, rir: '2', done });

  it('tieneReps: hacen falta repeticiones; el peso no', () => {
    expect(tieneReps(fila('', ''))).toBe(false);
    expect(tieneReps(fila('60', ''))).toBe(false);
    expect(tieneReps(fila('60', '0'))).toBe(false);
    expect(tieneReps(undefined)).toBe(false);
    expect(tieneReps(fila('60', '8'))).toBe(true);
    // Peso corporal: 0 kg (o sin peso) con repeticiones es una serie válida.
    expect(tieneReps(fila('0', '12'))).toBe(true);
    expect(tieneReps(fila('', '12'))).toBe(true);
  });

  it('seriesHechas: solo se guardan las marcadas y con repeticiones', () => {
    const filas = [fila('60', '8'), fila('', ''), fila('60', '8', false), fila('0', '10')];
    expect(seriesHechas(filas)).toEqual([fila('60', '8'), fila('0', '10')]);
    expect(seriesHechas([fila('', ''), fila('40', '0')])).toEqual([]);
  });
});
