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

describe('tonelajeMaximoAntesDe', () => {
  it('solo cuenta sesiones anteriores a la fecha', () => {
    const log = (date: string, sets: { weight: number; repsDone: number }[]) =>
      ({ date, entries: [{ exerciseId: 'e1', sets }] }) as unknown as WorkoutLog;
    const m = tonelajeMaximoAntesDe([log('2026-10-01', [s(50, 10)]), log('2026-10-20', [s(60, 10)]), log('2026-10-28', [s(90, 10)])], '2026-10-28');
    expect(m.get('e1')).toBe(600);
  });
});
