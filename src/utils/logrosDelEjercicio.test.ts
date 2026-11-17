import { describe, it, expect } from 'vitest';
import type { WorkoutLog } from '../types';
import { logrosDelEjercicio, tonelajeMaximoAntesDe } from './logrosDelEjercicio';
import { rmDeSerie } from './oneRepMax';

const s = (weight: number, repsDone: number) => ({ weight, repsDone, rir: 2 });
const base = { nombre: 'Press banca', tonelajeMaxAntes: undefined, ultimaVez: undefined };

describe('logrosDelEjercicio', () => {
  it('sin historial no hay nada que celebrar', () => {
    expect(logrosDelEjercicio({ ...base, hechas: [s(100, 8)], mejorRmAntes: undefined })).toEqual([]);
  });

  it('récord cuando el mejor 1RM supera al histórico', () => {
    const antes = rmDeSerie(s(100, 6));
    const l = logrosDelEjercicio({ ...base, hechas: [s(100, 8)], mejorRmAntes: antes });
    expect(l[0]).toMatchObject({ tipo: 'record', titulo: '¡Récord personal!' });
    expect(l[0].detalle).toContain('100 kg × 8');
  });

  it('tonelaje máximo aunque no haya récord de fuerza', () => {
    const l = logrosDelEjercicio({ ...base, hechas: [s(80, 10), s(80, 10), s(80, 10)], mejorRmAntes: 999, tonelajeMaxAntes: 2000 });
    expect(l.map(x => x.tipo)).toEqual(['tonelaje']);
    expect(l[0].detalle).toContain('2.400');
  });

  it('progreso frente a la última vez: más peso o más reps', () => {
    const masPeso = logrosDelEjercicio({ ...base, hechas: [s(82.5, 8)], mejorRmAntes: 999, ultimaVez: [s(80, 8)] });
    expect(masPeso[0]).toMatchObject({ tipo: 'progreso' });
    expect(masPeso[0].detalle).toContain('+2,5 kg');
    const masReps = logrosDelEjercicio({ ...base, hechas: [s(80, 10)], mejorRmAntes: 999, ultimaVez: [s(80, 8)] });
    expect(masReps[0].detalle).toContain('+2 reps con 80 kg');
  });

  it('peor que la última vez: nada', () => {
    expect(logrosDelEjercicio({ ...base, hechas: [s(70, 8)], mejorRmAntes: 999, ultimaVez: [s(80, 8)] })).toEqual([]);
  });
});

// ── D2 (17-11-2026): la marca que se celebra es la de una serie válida ─────
describe('logros con series válidas (D2)', () => {
  it('una serie de 20 repeticiones o a RIR 4 no es «tu mejor marca»', () => {
    const antes = rmDeSerie(s(100, 8));
    // Sin filtro, 90 × 20 a RIR 2 daba más RM que el récord y se celebraba.
    expect(rmDeSerie({ weight: 90, repsDone: 20, rir: 2 })).toBeGreaterThan(antes);
    expect(logrosDelEjercicio({ ...base, hechas: [{ weight: 90, repsDone: 20, rir: 2 }], mejorRmAntes: antes })).toEqual([]);
    expect(logrosDelEjercicio({ ...base, hechas: [{ weight: 110, repsDone: 8, rir: 4 }], mejorRmAntes: antes })).toEqual([]);
  });

  it('ni una bajada, ni una serie con el RIR pautado sin tocar', () => {
    const antes = rmDeSerie(s(100, 8));
    const bajada = { weight: 120, repsDone: 8, rir: 0, segmento: true };
    const sinApuntar = { weight: 120, repsDone: 8, rir: 2, rirApuntado: false };
    expect(logrosDelEjercicio({ ...base, hechas: [s(100, 8), bajada, sinApuntar], mejorRmAntes: antes })).toEqual([]);
    // La misma serie, con el RIR apuntado, sí es récord.
    expect(logrosDelEjercicio({ ...base, hechas: [{ ...sinApuntar, rirApuntado: true }], mejorRmAntes: antes })[0]).toMatchObject({ tipo: 'record' });
  });

  it('lee las filas de la sesión en curso, que vienen como texto', () => {
    const l = logrosDelEjercicio({ ...base, hechas: [{ weight: '100', repsDone: '9', rir: '2' }], mejorRmAntes: rmDeSerie(s(100, 8)) });
    expect(l[0]).toMatchObject({ tipo: 'record' });
    expect(l[0].detalle).toMatch(/^100\skg × 9/); // el espacio es de no separación
  });

  it('el tonelaje se celebra aunque la sesión no tenga marca', () => {
    const l = logrosDelEjercicio({ ...base, hechas: [s(60, 15), s(60, 15), s(60, 15)], mejorRmAntes: 50, tonelajeMaxAntes: 2000 });
    expect(l.map(x => x.tipo)).toEqual(['tonelaje']);
  });

  it('«sigues progresando» compara marcas válidas de las dos sesiones', () => {
    // La última vez la mejor serie válida fue 80 × 8; la de 20 repeticiones no cuenta.
    const ultimaVez = [s(80, 8), { weight: 75, repsDone: 20, rir: 2 }];
    const l = logrosDelEjercicio({ ...base, hechas: [s(82.5, 8)], mejorRmAntes: 999, ultimaVez });
    expect(l[0]).toMatchObject({ tipo: 'progreso' });
    expect(l[0].detalle).toMatch(/^\+2,5\skg/);
  });
});

describe('tonelajeMaximoAntesDe', () => {
  it('solo cuenta sesiones anteriores a la fecha', () => {
    const log = (date: string, sets: { weight: number; repsDone: number }[]) =>
      ({ date, entries: [{ exerciseId: 'e1', sets }] }) as unknown as WorkoutLog;
    const m = tonelajeMaximoAntesDe([log('2026-10-01', [s(50, 10)]), log('2026-10-20', [s(60, 10)]), log('2026-10-28', [s(90, 10)])], '2026-10-28');
    expect(m.get('e1')).toBe(600);
  });
});

describe('fuera de su gimnasio (17-11-2026)', () => {
  it('el tonelaje máximo de antes no cuenta las sesiones fuera', () => {
    const l = (date: string, weight: number, fuera = false): WorkoutLog => ({
      id: date, athleteId: 'a', workoutId: 'w', assignmentId: date, date, completedAt: '',
      entries: [{ exerciseId: 'press', sets: [{ weight, repsDone: 10, rir: 2, ...(fuera ? { fuera: true } : {}) }] }],
    });
    expect(tonelajeMaximoAntesDe([l('2026-11-01', 60), l('2026-11-08', 100, true)], '2026-11-17').get('press')).toBe(600);
  });
});
