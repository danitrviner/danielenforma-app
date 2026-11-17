import { describe, expect, it } from 'vitest';
import { WorkoutExercise, WorkoutEntryLog } from '../types';
import { sugerirCarga, consejoEnVivo, rangoDeReps, saltoReal, repsExtraAntesDeSubir, veredictoDeSerie, serieDeReferencia, repsAlRirPautado } from './cargaSugerida';

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

  it('F7a: en descarga, puente y vuelta de parón no se sugiere subir aunque tocara', () => {
    const previa = log([[60, 12, 2], [60, 12, 2], [60, 12, 3]]);
    expect(sugerirCarga(we, previa).series[0]).toEqual({ peso: 62.5, reps: 8 });
    for (const semana of ['descarga', 'puente', 'paron'] as const) {
      const r = sugerirCarga(we, previa, undefined, semana);
      expect(r.series).toEqual([null, null, null]);
      expect(r.resumen).toBeNull();
    }
    // Una semana normal (null) se comporta como siempre.
    expect(sugerirCarga(we, previa, undefined, null).series[0]).toEqual({ peso: 62.5, reps: 8 });
  });

  it('F19: con menos series la última vez, las de más se comparan con la última serie con repeticiones', () => {
    // Venía de una descarga (2 series) y hoy tocan 3: la tercera sigue a la segunda.
    const r = sugerirCarga(we, log([[60, 11, 2], [60, 12, 2]]));
    expect(r.series).toEqual([null, { peso: 62.5, reps: 8 }, { peso: 62.5, reps: 8 }]);
    expect(sugerirCarga(we, log([[60, 12, 2], [60, 10, 2]])).series).toEqual([{ peso: 62.5, reps: 8 }, null, null]);
  });
});

describe('veredictoDeSerie — el criterio único de «toca subir»', () => {
  const pauta = { reps: '8-12', rir: 2 };
  const serie = (weight: number, repsDone: number, rir: number, alFallo = false) => ({ weight, repsDone, rir, alFallo });

  it('sube solo en el tope, con el RIR pautado o más y sin fallo', () => {
    expect(veredictoDeSerie(serie(60, 12, 2), pauta)).toEqual({ que: 'subir', peso: 62.5, reps: 8 });
    expect(veredictoDeSerie(serie(60, 11, 3), pauta)).toBeNull();          // no llegó al tope
    expect(veredictoDeSerie(serie(60, 12, 1), pauta)).toBeNull();          // más justo de lo pautado
    expect(veredictoDeSerie(serie(60, 13, 2, true), pauta)).toBeNull();    // al fallo
    expect(veredictoDeSerie(serie(0, 12, 2), pauta)).toBeNull();           // peso corporal: no hay carga que subir
    expect(veredictoDeSerie(undefined, pauta)).toBeNull();
    expect(veredictoDeSerie(serie(60, 12, 2), { reps: 'AMRAP', rir: 2 })).toBeNull();
  });

  it('con un salto grande, en el tope toca esperar y dice hasta cuántas repeticiones', () => {
    expect(veredictoDeSerie(serie(8, 15, 2), { reps: '12-15', rir: 2 }, 2)).toEqual({ que: 'esperar', peso: 8, reps: 20, paso: 2 });
    expect(veredictoDeSerie(serie(8, 20, 2), { reps: '12-15', rir: 2 }, 2)).toEqual({ que: 'subir', peso: 10, reps: 12 });
  });
});

describe('serieDeReferencia (F19)', () => {
  const s = (weight: number, repsDone: number) => ({ weight, repsDone });

  it('la misma serie de la última vez, si tiene repeticiones', () => {
    expect(serieDeReferencia([s(60, 10), s(62.5, 8)], 0)).toEqual(s(60, 10));
  });

  it('las filas de más, y las guardadas sin repeticiones, toman la última serie con repeticiones', () => {
    expect(serieDeReferencia([s(60, 10), s(62.5, 8)], 3)).toEqual(s(62.5, 8));
    expect(serieDeReferencia([s(60, 10), s(60, 0), s(60, 9), s(0, 0)], 1)).toEqual(s(60, 9));
    expect(serieDeReferencia([s(60, 10), s(60, 0)], 2)).toEqual(s(60, 10));
  });

  it('sin ninguna serie con repeticiones, lo que hubiera en esa posición', () => {
    expect(serieDeReferencia([], 0)).toBeUndefined();
    expect(serieDeReferencia([s(60, 0)], 0)).toEqual(s(60, 0));
    expect(serieDeReferencia([s(60, 0)], 1)).toBeUndefined();
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

  it('F20b: no afirma que le sobraba (el RIR llega prerrellenado)', () => {
    const c = consejoEnVivo(we, [fila('80', '12', '2', true), fila('80', '', '2', false)]);
    expect(c!.texto).toContain('Si te sobraba, sube a 82,5 kg');
    expect(c!.texto).not.toContain('aún te sobraba');
  });

  it('F7a: en descarga, puente y vuelta de parón no pide más peso a mitad de sesión', () => {
    const sets = [fila('80', '12', '2', true), fila('80', '', '2', false)];
    for (const semana of ['descarga', 'puente', 'paron'] as const) {
      expect(consejoEnVivo(we, sets, undefined, semana)).toBeNull();
    }
    expect(consejoEnVivo(we, sets, undefined, null)).not.toBeNull();
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

describe('D1a: la referencia al RIR pautado', () => {
  const hecha = (repsDone: number, rir: number, extra: { alFallo?: boolean; rirApuntado?: boolean } = { rirApuntado: true }) =>
    ({ weight: 80, repsDone, rir, ...extra });

  it('el ejemplo de Dani: 10 a RIR 0 con RIR 1 pautado son 9', () => {
    expect(repsAlRirPautado(hecha(10, 0), 1)).toBe(9);
  });

  it('10 a RIR 3 con RIR 1 pautado son 12', () => {
    expect(repsAlRirPautado(hecha(10, 3), 1)).toBe(12);
  });

  it('8 a RIR 1 con RIR 1 pautado se quedan en 8', () => {
    expect(repsAlRirPautado(hecha(8, 1), 1)).toBe(8);
  });

  it('al fallo cuenta como RIR 0, ponga lo que ponga el número', () => {
    expect(repsAlRirPautado(hecha(10, 2, { alFallo: true, rirApuntado: true }), 1)).toBe(9);
  });

  it('nunca baja de 1 repetición', () => {
    expect(repsAlRirPautado(hecha(2, 0), 4)).toBe(1);
  });

  it('sin el RIR apuntado por el atleta no se normaliza: lo hecho tal cual', () => {
    expect(repsAlRirPautado(hecha(10, 0, { rirApuntado: false }), 1)).toBe(10);
    // Registro antiguo, sin la marca.
    expect(repsAlRirPautado(hecha(10, 0, {}), 1)).toBe(10);
    expect(repsAlRirPautado(hecha(10, 0, { alFallo: true }), 1)).toBe(10);
  });

  it('una serie sin repeticiones no se inventa ninguna', () => {
    expect(repsAlRirPautado(hecha(0, 3), 1)).toBe(0);
  });

  describe('«toca subir» se decide a RIR pautado', () => {
    const pauta = { reps: '8-10', rir: 1 };

    it('10 a RIR 3 (pautado 1) son 12: supera el tope del rango y toca subir carga', () => {
      expect(veredictoDeSerie(hecha(10, 3), pauta)).toEqual({ que: 'subir', peso: 82.5, reps: 8 });
    });

    it('9 a RIR 2 (pautado 1) son 10: llega al tope sin haberlo hecho, y sube', () => {
      expect(veredictoDeSerie(hecha(9, 2), pauta)).toEqual({ que: 'subir', peso: 82.5, reps: 8 });
    });

    it('10 a RIR 0 (pautado 1) son 9: en el tope, pero apretando de más — no sube', () => {
      expect(veredictoDeSerie(hecha(10, 0), pauta)).toBeNull();
    });

    it('10 al fallo son 9, no sube; 11 al fallo son 10 a RIR 1, sí', () => {
      expect(veredictoDeSerie(hecha(10, 0, { alFallo: true, rirApuntado: true }), pauta)).toBeNull();
      expect(veredictoDeSerie(hecha(11, 0, { alFallo: true, rirApuntado: true }), pauta)).toEqual({ que: 'subir', peso: 82.5, reps: 8 });
    });

    it('8 a RIR 1 (pautado 1) son 8: se repite la carga', () => {
      expect(veredictoDeSerie(hecha(8, 1), pauta)).toBeNull();
    });

    it('sin apuntar, el criterio de siempre: tope hecho, RIR pautado o más y sin fallo', () => {
      expect(veredictoDeSerie(hecha(10, 1, { rirApuntado: false }), pauta)).toEqual({ que: 'subir', peso: 82.5, reps: 8 });
      // 9 a RIR 3 sin apuntar NO se convierte en 11: se queda en 9, por debajo del tope.
      expect(veredictoDeSerie(hecha(9, 3, { rirApuntado: false }), pauta)).toBeNull();
      expect(veredictoDeSerie(hecha(9, 3, {}), pauta)).toBeNull();
      expect(veredictoDeSerie(hecha(10, 0, {}), pauta)).toBeNull();
      expect(veredictoDeSerie(hecha(12, 0, { alFallo: true }), pauta)).toBeNull();
    });

    it('con un salto de carga grande, las repeticiones de margen también se cuentan a RIR pautado', () => {
      // 10 kg con saltos de 2 kg (20 %): pide 8 de margen; el rango 8-10 abre 2, faltan 6 → 16.
      const ligera = (repsDone: number, rir: number) => ({ weight: 10, repsDone, rir, rirApuntado: true });
      expect(veredictoDeSerie(ligera(13, 2), pauta, 2)).toEqual({ que: 'esperar', peso: 10, reps: 16, paso: 2 });
      expect(veredictoDeSerie(ligera(13, 4), pauta, 2)).toEqual({ que: 'subir', peso: 12, reps: 8 });
    });

    it('la tarjeta lo aplica serie a serie', () => {
      const ej: WorkoutExercise = { exerciseId: 'press', order: 0, sets: 2, reps: '8-10', rir: 1, restSeconds: 120 };
      const previa: WorkoutEntryLog = { exerciseId: 'press', sets: [
        { weight: 80, repsDone: 10, rir: 3, rirApuntado: true },
        { weight: 80, repsDone: 10, rir: 0, rirApuntado: true },
      ] };
      expect(sugerirCarga(ej, previa).series).toEqual([{ peso: 82.5, reps: 8 }, null]);
    });
  });
});
