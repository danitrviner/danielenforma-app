import { describe, expect, it } from 'vitest';
import type { WorkoutLog, WorkoutSetLog } from '../types';
import {
  cambiarPrerrelleno, cambioDeFuera, cumpleElRir, entradasConFuera, esSesionFuera, kgDeSerie, mensajeDeCierreFuera,
  pistaDePesoFuera, rirCumplido, rirCumplidoDeFilas, serieConFuera, seriesDeFuerza, sinSesionesFuera,
  alternarSesionFuera, fueraAlAbrir, sesionesPendientesDeLaSemana,
} from './sesionFuera';

const log = (id: string, extra: Partial<WorkoutLog> = {}, fueraEnSerie = false): WorkoutLog => ({
  id, athleteId: 'a@b.c', workoutId: 'w', assignmentId: id, date: '2026-11-10', completedAt: '',
  entries: [{ exerciseId: 'press', sets: [{ weight: 40, repsDone: 10, rir: 2, ...(fueraEnSerie ? { fuera: true } : {}) }] }],
  ...extra,
});

describe('la marca «fuera»', () => {
  it('una sesión es fuera por la marca del registro o por la de una serie', () => {
    expect(esSesionFuera(log('a'))).toBe(false);
    expect(esSesionFuera(log('b', { fuera: true }))).toBe(true);
    expect(esSesionFuera(log('c', {}, true))).toBe(true);
    expect(sinSesionesFuera([log('a'), log('b', { fuera: true })]).map(l => l.id)).toEqual(['a']);
  });

  it('las series fuera no cuentan para la fuerza ni suman kilos', () => {
    const sets = [{ weight: 40, repsDone: 10, rir: 2 }, { weight: 40, repsDone: 10, rir: 2, fuera: true }];
    expect(seriesDeFuerza(sets)).toHaveLength(1);
    expect(kgDeSerie(sets[0])).toBe(400);
    expect(kgDeSerie(sets[1])).toBe(0);
  });

  it('poner y quitar la marca: quitarla borra el campo, no lo deja en false', () => {
    const s: WorkoutSetLog = { weight: 40, repsDone: 10, rir: 2 };
    expect(serieConFuera(s, true)).toEqual({ ...s, fuera: true });
    expect(serieConFuera({ ...s, fuera: true }, false)).toEqual(s);
    expect('fuera' in serieConFuera({ ...s, fuera: true }, false)).toBe(false);
    expect(serieConFuera(s, false)).toBe(s);
  });

  it('marcar una sesión ya guardada copia la marca en todas sus series', () => {
    const c = cambioDeFuera(log('a'), true);
    expect(c.fuera).toBe(true);
    expect(c.entries[0].sets.every(s => s.fuera === true)).toBe(true);
    const quitada = cambioDeFuera({ entries: entradasConFuera(c.entries, true) }, false);
    expect(quitada.fuera).toBe(false);
    expect(quitada.entries[0].sets.some(s => 'fuera' in s)).toBe(false);
  });
});

describe('el panel de la semana, en Rutinas', () => {
  const asig = (id: string, date: string, status: 'pending' | 'completed' | 'skipped' | 'perdido' = 'pending') => ({ id, date, status });

  it('salen las pendientes de lunes a domingo, por fecha', () => {
    const lista = [
      asig('jue', '2026-11-19'), asig('lun', '2026-11-16'), asig('dom', '2026-11-22'),
      asig('hecha', '2026-11-17', 'completed'), asig('saltada', '2026-11-18', 'skipped'),
      asig('antes', '2026-11-15'), asig('despues', '2026-11-23'),
    ];
    expect(sesionesPendientesDeLaSemana(lista, '2026-11-16').map(a => a.id)).toEqual(['lun', 'jue', 'dom']);
    expect(sesionesPendientesDeLaSemana([], '2026-11-16')).toEqual([]);
  });

  it('un toque marca la sesión y otro la desmarca, sin repetidas', () => {
    expect(alternarSesionFuera(undefined, 'a')).toEqual(['a']);
    expect(alternarSesionFuera(['a', 'b'], 'a')).toEqual(['b']);
    expect(alternarSesionFuera(['b'], 'a')).toEqual(['b', 'a']);
    const original = ['a'];
    alternarSesionFuera(original, 'b');
    expect(original).toEqual(['a']);
  });

  it('solo es «fuera» con el ajuste de Mi gimnasio activado y la sesión marcada en el panel (18-11)', () => {
    expect(fueraAlAbrir(true, true)).toBe(true);
    expect(fueraAlAbrir(true, false)).toBe(false);
    expect(fueraAlAbrir(false, true)).toBe(false); // lo desactivó: lo marcado no cuenta
    expect(fueraAlAbrir(false, false)).toBe(false);
  });
});

describe('lo que cuenta fuera: el RIR', () => {
  it('se cumple con el pautado ± 1; el fallo, solo con fallo o RIR 0', () => {
    expect(cumpleElRir({ rir: 2 }, '2')).toBe(true);
    expect(cumpleElRir({ rir: 3 }, '2')).toBe(true);
    expect(cumpleElRir({ rir: 0 }, '2')).toBe(false);
    expect(cumpleElRir({ rir: 4 }, '2')).toBe(false);
    expect(cumpleElRir({ rir: 0, alFallo: true }, 'fallo')).toBe(true);
    expect(cumpleElRir({ rir: 2 }, 'fallo')).toBe(false);
  });

  it('cada serie se mide con SU pautado, también si hay huecos sin hacer', () => {
    expect(rirCumplido([{ rir: 2 }, null, { rir: 0, alFallo: true }], ['2', '2', 'fallo'])).toEqual({ aTuRir: 2, hechas: 2, pautadas: 3 });
    const filas = [
      { rir: '2', done: true }, { rir: '4', done: true }, { rir: '2', done: false }, { rir: '0', done: true, segmento: true },
    ];
    expect(rirCumplidoDeFilas(filas, ['2', '2', '2'])).toEqual({ aTuRir: 1, hechas: 2, pautadas: 3 });
  });

  it('la frase de cierre celebra el RIR y las series, no los kilos', () => {
    expect(mensajeDeCierreFuera({ aTuRir: 3, hechas: 3, pautadas: 3 })).toBe('Las 3 series hechas y todas a tu RIR. Fuera de tu gimnasio es justo lo que cuenta.');
    expect(mensajeDeCierreFuera({ aTuRir: 1, hechas: 2, pautadas: 3 })).toContain('2 de 3 series hechas, 1 a tu RIR');
    expect(mensajeDeCierreFuera({ aTuRir: 0, hechas: 0, pautadas: 3 })).not.toMatch(/kg/);
  });

  it('la pista del peso usa el rango y el RIR pautados', () => {
    expect(pistaDePesoFuera('8-10', '2')).toBe('Elige un peso con el que hagas 8-10 repeticiones a RIR 2.');
    expect(pistaDePesoFuera('12', 1)).toBe('Elige un peso con el que hagas 12 repeticiones a RIR 1.');
    expect(pistaDePesoFuera('AMRAP', 'fallo')).toBe('Elige un peso con el que llegues al fallo.');
  });
});

describe('encender o apagar «fuera» a mitad de sesión', () => {
  const normal = [[{ weight: '80', repsDone: '8', done: false }, { weight: '80', repsDone: '8', done: false }, { weight: '80', repsDone: '8', done: false }]];
  const fuera = [[{ weight: '', repsDone: '8', done: false }, { weight: '', repsDone: '8', done: false }, { weight: '', repsDone: '8', done: false }]];

  it('solo cambian las filas sin hacer y sin tocar', () => {
    const filas = [[
      { weight: '80', repsDone: '8', done: true },   // hecha: no se toca
      { weight: '70', repsDone: '8', done: false },  // la tocó él: no se toca
      { weight: '80', repsDone: '8', done: false },  // como llegó: pasa a peso vacío
    ]];
    expect(cambiarPrerrelleno(filas, normal, fuera)[0].map(f => f.weight)).toEqual(['80', '70', '']);
  });

  it('ida y vuelta deja la tabla como estaba; sin cambios devuelve el mismo array', () => {
    const ida = cambiarPrerrelleno(normal, normal, fuera);
    expect(cambiarPrerrelleno(ida, fuera, normal)).toEqual(normal);
    expect(cambiarPrerrelleno(fuera, normal, fuera)).toBe(fuera);
  });
});
