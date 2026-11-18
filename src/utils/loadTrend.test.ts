import { describe, expect, it } from 'vitest';
import { WorkoutLog } from '../types';
import { ewmaDeSeriePorSesion } from './loadTrend';
import { rmDeSerie } from './oneRepMax';

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number; rir?: number }[]): WorkoutLog => ({
  id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series.map(s => ({ rir: 2, ...s })) }],
});

describe('ewmaDeSeriePorSesion', () => {
  // Series de 5 repeticiones a RIR 2: válidas para estimar el RM (D2).
  const rm = (kg: number) => rmDeSerie({ weight: kg, repsDone: 5, rir: 2 });

  it('toma la marca de cada día (su mejor serie válida) y suaviza con EWMA', () => {
    const logs = [
      log('2026-08-01', 'press', [{ weight: 100, repsDone: 5 }]),
      log('2026-08-08', 'press', [{ weight: 100, repsDone: 5 }]),
      log('2026-08-15', 'press', [{ weight: 50, repsDone: 5 }]),  // mal día: la mitad
    ];
    const ewma = ewmaDeSeriePorSesion(logs, 'press', 0.3);
    expect(ewma.map(p => p.date)).toEqual(['2026-08-01', '2026-08-08', '2026-08-15']);
    expect(ewma[0].value).toBe(rm(100));
    expect(ewma[2].value).toBeCloseTo(0.3 * rm(50) + 0.7 * rm(100), 5);
  });

  it('ignora entries de otros ejercicios', () => {
    const logs = [log('2026-08-01', 'sentadilla', [{ weight: 100, repsDone: 1 }])];
    expect(ewmaDeSeriePorSesion(logs, 'press')).toEqual([]);
  });

  it('con dos sets el mismo día, se queda con el mejor, no los suma', () => {
    const logs = [log('2026-08-01', 'press', [{ weight: 100, repsDone: 5 }, { weight: 120, repsDone: 5 }])];
    expect(ewmaDeSeriePorSesion(logs, 'press')[0].value).toBe(rm(120));
  });

  // ── D2: la curva solo se dibuja con marcas de verdad ──────────────────────
  it('una serie que no vale para el RM no dobla la curva', () => {
    const logs = [
      log('2026-08-01', 'press', [{ weight: 100, repsDone: 5 }]),
      // 20 repeticiones a RIR 4 daría un «RM» más alto que el de la serie buena.
      log('2026-08-08', 'press', [{ weight: 100, repsDone: 5 }, { weight: 90, repsDone: 20, rir: 4 }]),
    ];
    const ewma = ewmaDeSeriePorSesion(logs, 'press', 0.3);
    expect(ewma.map(p => p.value)).toEqual([rm(100), rm(100)]);
  });

  it('una sesión sin ninguna serie válida no tiene punto (ni es un 0)', () => {
    const logs = [
      log('2026-08-01', 'press', [{ weight: 100, repsDone: 5 }]),
      log('2026-08-08', 'press', [{ weight: 100, repsDone: 5, rir: 5 }, { weight: 60, repsDone: 18 }]),
      log('2026-08-15', 'press', [{ weight: 100, repsDone: 5 }]),
    ];
    const ewma = ewmaDeSeriePorSesion(logs, 'press', 0.3);
    expect(ewma.map(p => p.date)).toEqual(['2026-08-01', '2026-08-15']);
    expect(ewma[1].value).toBe(rm(100));
  });
});
