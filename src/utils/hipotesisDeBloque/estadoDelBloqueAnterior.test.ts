import { describe, expect, it } from 'vitest';
import type { WorkoutLog } from '../../types';
import type { IemSemanal } from '../cdg/iemSemanal';
import { addDays } from '../trainingWeek';
import {
  estadoDeLosEjercicios, estadoDelBloqueAnterior, iniciosDeSemanaDelBloque, semanasFueraDelBloque, type MesoParaEstado,
} from './estadoDelBloqueAnterior';

const INICIO = '2026-01-05';
const meso = (extra: Partial<MesoParaEstado> = {}): MesoParaEstado => ({ id: 'm1', startDate: INICIO, weeks: 8, daysPerWeek: 4, ...extra });

/** Un `IemSemanal` a mano: una fila por zona con el IEM de cada semana. */
function iem(porZona: Record<string, number[]>, o: { semanas?: number; enCurso?: number | null } = {}): IemSemanal {
  const n = o.semanas ?? Object.values(porZona)[0].length;
  const semanas = Array.from({ length: n }, (_, i) => addDays(INICIO, i * 7));
  const filas = Object.entries(porZona).map(([clave, valores]) => ({
    clave, nombre: clave, sensible: false, valores, total: valores.reduce((a, b) => a + b, 0), variacionPct: null,
  })) as IemSemanal['filas'];
  return {
    semanas, filas,
    totalPorSemana: semanas.map((_, i) => filas.reduce((a, f) => a + (f.valores[i] ?? 0), 0)),
    enCurso: o.enCurso ?? null, sinVinculo: [],
  };
}

describe('estadoDelBloqueAnterior', () => {
  it('media de todo el bloque y final = mediana de las 2 últimas semanas', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [12, 13, 14, 14, 15, 16, 15, 17] }), meso: meso() });
    expect(e.semanasQueCuentan).toBe(8);
    expect(e.porZona.pectoral).toMatchObject({ zona: 'pectoral', iemMedio: 14.5, iemFinal: 16 });
    expect(e.porZona.dorsal).toBeUndefined();
  });

  it('no cuentan descargas, puentes ni semanas de test', () => {
    const e = estadoDelBloqueAnterior({
      iem: iem({ pectoral: [14, 15, 16, 8, 16, 9, 16, 5] }),
      meso: meso({ semanasDescarga: [4], semanasPivot: [6], semanasTest: [8] }),
    });
    expect(e.semanas.filter(s => !s.cuenta).map(s => [s.semana, s.motivo])).toEqual([[4, 'descarga'], [6, 'puente'], [8, 'test']]);
    expect(e.porZona.pectoral?.porSemana).toEqual([14, 15, 16, 16, 16]);
    expect(e.porZona.pectoral?.iemMedio).toBe(15.4);
    expect(e.porZona.pectoral?.iemFinal).toBe(16); // S5 y S7, no la de test
  });

  it('la semana en curso a medias no cuenta', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [16, 16, 16, 6] }, { enCurso: 3 }), meso: meso() });
    expect(e.semanas[3]).toMatchObject({ cuenta: false, motivo: 'en_curso' });
    expect(e.porZona.pectoral).toMatchObject({ iemMedio: 16, iemFinal: 16 });
  });

  it('la semana 1 de la vuelta de un parón tampoco (va a RIR 3 o más a propósito)', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [9, 15, 15, 15] }), meso: meso({ vuelveDeParon: true }) });
    expect(e.semanas[0].motivo).toBe('vuelta_de_paron');
    expect(e.porZona.pectoral?.iemMedio).toBe(15);
  });

  it('una semana normal sin entrenar cuenta como 0 en la media, pero no decide el final', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [16, 16, 0, 16], dorsal: [20, 20, 0, 20] }), meso: meso() });
    expect(e.semanasSinEntrenar).toBe(1);
    expect(e.porZona.pectoral?.iemMedio).toBe(12);
    expect(e.porZona.pectoral?.iemFinal).toBe(16);
  });

  it('…y si entrenó pero no tocó la zona, ese 0 sí es su final', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [16, 16, 0, 0], dorsal: [20, 20, 20, 20] }), meso: meso() });
    expect(e.semanasSinEntrenar).toBe(0);
    expect(e.porZona.pectoral?.iemFinal).toBe(0);
  });

  it('con una sola semana que cuenta, el final es esa', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [15, 7] }), meso: meso({ semanasDescarga: [2] }) });
    expect(e.porZona.pectoral).toMatchObject({ iemMedio: 15, iemFinal: 15 });
  });

  it('las semanas fuera del bloque no entran', () => {
    const e = estadoDelBloqueAnterior({ iem: iem({ pectoral: [16, 16, 16] }), meso: meso({ weeks: 2 }) });
    expect(e.semanas[2]).toMatchObject({ semana: 3, motivo: 'fuera_del_bloque' });
    expect(e.semanasQueCuentan).toBe(2);
  });

  it('con ciclo de 14 días, una vuelta de descarga son dos semanas de calendario', () => {
    const fuera = semanasFueraDelBloque(meso({ daysPerWeek: 6, cycleDays: 14, semanasDescarga: [2] }));
    expect([...fuera.entries()]).toEqual([[3, 'descarga'], [4, 'descarga']]);
  });

  it('si coinciden, manda la descarga sobre el puente y el test', () => {
    const fuera = semanasFueraDelBloque(meso({ semanasDescarga: [4], semanasPivot: [4], semanasTest: [4] }));
    expect(fuera.get(4)).toBe('descarga');
  });

  it('los inicios de semana del bloque, hasta hoy si se pasa', () => {
    expect(iniciosDeSemanaDelBloque({ startDate: INICIO, weeks: 3 })).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
    expect(iniciosDeSemanaDelBloque({ startDate: INICIO, weeks: 8 }, '2026-01-14')).toEqual(['2026-01-05', '2026-01-12']);
  });
});

describe('estadoDeLosEjercicios', () => {
  const serie = (weight: number, repsDone: number, rir = 1) => ({ weight, repsDone, rir, rirApuntado: true });
  const log = (date: string, entries: Array<{ exerciseId: string; kg: number; reps?: number; molestia?: number; queParo?: string }>, mesocycleId = 'm1'): WorkoutLog => ({
    id: `l-${date}`, athleteId: 'a', workoutId: 'w', assignmentId: 'as', mesocycleId, date, completedAt: `${date}T18:00:00.000Z`,
    entries: entries.map(e => ({
      exerciseId: e.exerciseId, sets: [serie(e.kg, e.reps ?? 8), serie(e.kg, e.reps ?? 8)],
      ...(e.molestia != null ? { molestia: e.molestia } : {}), ...(e.queParo ? { queParo: e.queParo } : {}),
    })),
  }) as unknown as WorkoutLog;
  const bloque = { id: 'm1', startDate: INICIO, weeks: 8 };

  it('un ejercicio con 7 semanas iguales está parado; uno que sube, no', () => {
    // Una sesión por semana: siete sesiones son seis semanas de la primera a la
    // última (desde el 17-11-2026 el parón se cuenta en semanas, no en sesiones).
    const logs = Array.from({ length: 7 }, (_, i) => log(addDays(INICIO, i * 7), [
      { exerciseId: 'press', kg: 80 },
      { exerciseId: 'remo', kg: 60 + i * 5 },
    ]));
    const estado = estadoDeLosEjercicios({ logs, meso: bloque });
    const press = estado.find(e => e.exerciseId === 'press')!;
    expect(press.sesiones).toBe(7);
    expect(press.estancamiento).toMatchObject({ semanas: 6, sesiones: 7 });
    expect(press.molestia).toBeNull();
    expect(estado.find(e => e.exerciseId === 'remo')!.estancamiento).toBeNull();
  });

  it('las molestias se cuentan solo dentro del bloque: veces, la más alta y la última', () => {
    const logs = [
      log('2025-12-20', [{ exerciseId: 'press', kg: 80, molestia: 9 }], 'm0'), // bloque anterior
      log('2026-01-06', [{ exerciseId: 'press', kg: 80, molestia: 3 }]),
      log('2026-01-13', [{ exerciseId: 'press', kg: 80 }]),
      log('2026-01-20', [{ exerciseId: 'press', kg: 80, molestia: 6 }]),
      log('2026-01-27', [{ exerciseId: 'curl', kg: 20, queParo: 'molestia' }]),
    ];
    const estado = estadoDeLosEjercicios({ logs, meso: bloque });
    expect(estado.find(e => e.exerciseId === 'press')).toMatchObject({ sesiones: 3, molestia: { veces: 2, maxima: 6, ultima: '2026-01-20' } });
    // Dijo que le paró una molestia, sin nota: cuenta, sin cifra.
    expect(estado.find(e => e.exerciseId === 'curl')!.molestia).toEqual({ veces: 1, maxima: null, ultima: '2026-01-27' });
  });

  it('con `ejercicios`, devuelve esos y en ese orden, aunque no se hayan hecho', () => {
    const estado = estadoDeLosEjercicios({ logs: [log('2026-01-06', [{ exerciseId: 'press', kg: 80 }])], meso: bloque, ejercicios: ['zzz', 'press'] });
    expect(estado.map(e => [e.exerciseId, e.sesiones])).toEqual([['zzz', 0], ['press', 1]]);
  });

  it('lo registrado después del final del bloque no entra', () => {
    const logs = [log('2026-01-06', [{ exerciseId: 'press', kg: 80 }]), log('2026-06-01', [{ exerciseId: 'press', kg: 80, molestia: 7 }])];
    expect(estadoDeLosEjercicios({ logs, meso: bloque })[0]).toMatchObject({ sesiones: 1, molestia: null });
  });
});
