import { describe, expect, it, vi } from 'vitest';
import {
  resumenRangosPautados, tieneReps, seriesHechas,
  apuntarRir, filaASerie, rirDesdeElBloqueo, resumenRirPautado, type SetInput,
} from './setInput';

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

describe('D1: cómo se apunta el RIR', () => {
  const fila = (extra: Partial<SetInput> = {}): SetInput => ({ weight: '80', repsDone: '8', rir: '1', done: false, ...extra });
  it('D1b: elegir el RIR guarda el valor y que lo eligió el atleta', () => {
    const actualizar = vi.fn();
    apuntarRir(actualizar, 2, '0');
    expect(actualizar.mock.calls).toEqual([[2, 'rir', '0'], [2, 'rirApuntado', true]]);
  });

  it('D1b: al guardar, la serie lleva `rirApuntado` solo si el atleta eligió el RIR', () => {
    expect(filaASerie(fila({ done: true, rirApuntado: true }))).toEqual({ weight: 80, repsDone: 8, rir: 1, alFallo: false, rirApuntado: true });
    // Sin tocar = sin marca, nunca `false` (no se le quita el RM a nadie).
    expect(filaASerie(fila({ done: true }))).toEqual({ weight: 80, repsDone: 8, rir: 1, alFallo: false });
    // Marcó fallo en el desplegable: es una elección suya.
    expect(filaASerie(fila({ rir: 'fallo', rirApuntado: true }))).toMatchObject({ rir: 0, alFallo: true, rirApuntado: true });
    // Serie al máximo prerrellenada con «fallo» y sin tocar (D5).
    expect(filaASerie(fila({ rir: 'fallo' }))).toEqual({ weight: 80, repsDone: 8, rir: 0, alFallo: true });
  });

  it('D1b: al corregir una sesión ya guardada se respeta la marca que tuviera', () => {
    expect(filaASerie(fila({ rirApuntado: false }))).toMatchObject({ rirApuntado: false });
    expect(filaASerie(fila({ rirApuntado: true }))).toMatchObject({ rirApuntado: true });
  });

  it('filaASerie conserva bajadas y la hora de la serie', () => {
    expect(filaASerie(fila({ segmento: true, segmentoDe: 2, hechaEn: '2026-11-17T10:00:00.000Z' }))).toEqual({
      weight: 80, repsDone: 8, rir: 1, alFallo: false, segmento: true, segmentoDe: 2,
      hechaEn: '2026-11-17T10:00:00.000Z',
    });
  });

  it('el RIR pautado, resumido para la cabecera de la tarjeta', () => {
    expect(resumenRirPautado(['1', '1', '1'])).toBe('RIR 1');
    expect(resumenRirPautado(['2', '2', 'fallo'])).toBe('RIR 2x2, 1xFALLO');
    expect(resumenRirPautado(['fallo', 'fallo'])).toBe('Al fallo');
    expect(resumenRirPautado([])).toBeNull();
  });

  it('pantalla de bloqueo: un 0 sobre «fallo» no cambia nada; otro número sí, y cuenta como apuntado', () => {
    expect(rirDesdeElBloqueo('fallo', 0)).toBeNull();
    expect(rirDesdeElBloqueo('2', 2)).toEqual({ valor: '2', apuntado: false });
    expect(rirDesdeElBloqueo('2', 1)).toEqual({ valor: '1', apuntado: true });
    expect(rirDesdeElBloqueo('fallo', 1)).toEqual({ valor: '1', apuntado: true });
    expect(rirDesdeElBloqueo('2', Number.NaN)).toBeNull();
  });
});
