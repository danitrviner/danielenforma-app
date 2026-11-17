import { describe, expect, it, vi } from 'vitest';
import {
  resumenRangosPautados, tieneReps, seriesHechas,
  apuntarRir, filaASerie, opcionRapidaDe, pasoAlMarcar, rirApuntadoAlGuardar, rirDesdeElBloqueo, rirEnPantalla,
  textoDePautado, resumenRirPautado, RIR_RAPIDO, VARIANTES_RIR, VARIANTE_RIR_POR_DEFECTO, type SetInput, type VarianteRir,
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
  const TODAS: VarianteRir[] = ['actual', 'selector', 'vacio', 'ultima'];

  it('en producción queda la de hoy, y el banco ofrece las cuatro', () => {
    expect(VARIANTE_RIR_POR_DEFECTO).toBe('actual');
    expect(VARIANTES_RIR.map(v => v.clave)).toEqual(TODAS);
  });

  it('D1b: elegir el RIR guarda el valor y que lo eligió el atleta', () => {
    const actualizar = vi.fn();
    apuntarRir(actualizar, 2, '0');
    expect(actualizar.mock.calls).toEqual([[2, 'rir', '0'], [2, 'rirApuntado', true]]);
  });

  it('D1b: al guardar, `rirApuntado` es true si lo eligió y false si se quedó el prerrelleno', () => {
    expect(rirApuntadoAlGuardar(fila({ rirApuntado: true }))).toBe(true);
    // En la variante de producción, sin tocar = sin marca (no se le quita el RM a nadie).
    expect(rirApuntadoAlGuardar(fila())).toBeUndefined();
    expect(rirApuntadoAlGuardar(fila(), false, 'ultima')).toBe(false);
    expect(filaASerie(fila({ done: true, rirApuntado: true }))).toEqual({ weight: 80, repsDone: 8, rir: 1, alFallo: false, rirApuntado: true });
    expect(filaASerie(fila({ done: true }))).toEqual({ weight: 80, repsDone: 8, rir: 1, alFallo: false });
    expect(filaASerie(fila({ done: true }), false, 'ultima')).toEqual({ weight: 80, repsDone: 8, rir: 1, alFallo: false, rirApuntado: false });
    // Marcó fallo en el desplegable: es una elección suya.
    expect(filaASerie(fila({ rir: 'fallo', rirApuntado: true }))).toMatchObject({ rir: 0, alFallo: true, rirApuntado: true });
    // Serie al máximo prerrellenada con «fallo» y sin tocar (D5).
    expect(filaASerie(fila({ rir: 'fallo' }), false, 'ultima')).toMatchObject({ rir: 0, alFallo: true, rirApuntado: false });
  });

  it('D1b: al corregir una sesión ya guardada se respeta la marca que tuviera', () => {
    expect(rirApuntadoAlGuardar(fila(), true)).toBeUndefined();
    expect(filaASerie(fila(), true)).toEqual({ weight: 80, repsDone: 8, rir: 1, alFallo: false });
    expect(rirApuntadoAlGuardar(fila({ rirApuntado: false }), true)).toBe(false);
    expect(rirApuntadoAlGuardar(fila({ rirApuntado: true }), true)).toBe(true);
  });

  it('filaASerie conserva bajadas y la hora de la serie', () => {
    expect(filaASerie(fila({ segmento: true, segmentoDe: 2, hechaEn: '2026-11-17T10:00:00.000Z' }))).toEqual({
      weight: 80, repsDone: 8, rir: 1, alFallo: false, segmento: true, segmentoDe: 2,
      hechaEn: '2026-11-17T10:00:00.000Z',
    });
  });

  describe('qué pasa al tocar «Hecha»', () => {
    it('sin repeticiones no se marca en ninguna variante (F23)', () => {
      for (const v of TODAS) expect(pasoAlMarcar(fila({ repsDone: '' }), v)).toBe('sin_reps');
      expect(pasoAlMarcar(undefined, 'actual')).toBe('sin_reps');
    });

    it('actual y última: se marca tal cual, con el pautado', () => {
      expect(pasoAlMarcar(fila(), 'actual')).toBe('marcar');
      expect(pasoAlMarcar(fila(), 'ultima')).toBe('marcar');
    });

    it('selector: primero se abre el selector rápido', () => {
      expect(pasoAlMarcar(fila(), 'selector')).toBe('elegir_rir');
    });

    it('vacío: no se puede marcar sin elegir el RIR', () => {
      expect(pasoAlMarcar(fila(), 'vacio')).toBe('falta_rir');
    });

    it('si ya lo eligió, no se le vuelve a preguntar', () => {
      for (const v of TODAS) expect(pasoAlMarcar(fila({ rirApuntado: true }), v)).toBe('marcar');
    });

    it('las bajadas y miniseries nunca piden RIR', () => {
      for (const v of TODAS) expect(pasoAlMarcar(fila({ segmento: true }), v)).toBe('marcar');
    });
  });

  it('vacío: la celda se ve vacía hasta que elige; en las demás se ve el pautado', () => {
    expect(rirEnPantalla(fila(), 'vacio')).toBe('');
    expect(rirEnPantalla(fila({ rirApuntado: true, rir: '0' }), 'vacio')).toBe('0');
    // Una serie ya marcada enseña lo que se va a guardar.
    expect(rirEnPantalla(fila({ done: true }), 'vacio')).toBe('1');
    for (const v of ['actual', 'selector', 'ultima'] as const) expect(rirEnPantalla(fila(), v)).toBe('1');
  });

  it('selector rápido: FALLO · 0 · 1 · 2 · 3 · 4+, y «4+» recoge el 4 y el 5', () => {
    expect(RIR_RAPIDO.map(o => o.texto)).toEqual(['FALLO', '0', '1', '2', '3', '4+']);
    expect(opcionRapidaDe('fallo')).toBe('fallo');
    expect(opcionRapidaDe('0')).toBe('0');
    expect(opcionRapidaDe('3')).toBe('3');
    expect(opcionRapidaDe('4')).toBe('4');
    expect(opcionRapidaDe('5')).toBe('4');
    expect(opcionRapidaDe('')).toBeNull();
    expect(opcionRapidaDe(undefined)).toBeNull();
  });

  it('la pista del pautado', () => {
    expect(textoDePautado('1')).toBe('pautado: 1');
    expect(textoDePautado('fallo')).toBe('pautado: fallo');
    expect(textoDePautado(undefined)).toBeNull();
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
