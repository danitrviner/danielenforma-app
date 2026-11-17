import { describe, it, expect } from 'vitest';
import { ultimaReferenciaPorEjercicio, esAnteriorALaReferencia } from './referenciaDeEjercicio';
import { allTimeBestBefore, aggregate, buildTrainingReport } from './trainingReport';
import { ewmaDeSeriePorSesion } from './loadTrend';
import type { WorkoutLog } from '../types';

function log(date: string, kg: number, reps: number, nuevaReferencia = false, exerciseId = 'prensa'): WorkoutLog {
  return {
    id: `l_${date}_${exerciseId}`, athleteId: 'a@a.com', workoutId: 'w', assignmentId: 'as', date, completedAt: `${date}T10:00:00Z`,
    entries: [{ exerciseId, sets: [{ weight: kg, repsDone: reps, rir: 2 }], ...(nuevaReferencia ? { nuevaReferencia: true } : {}) }],
  };
}

// La prensa con recorrido corto a 70 kg; el día 15 baja más hondo y pasa a 55 kg.
const HISTORIA = [
  log('2026-10-01', 70, 10),
  log('2026-10-08', 72.5, 10),
  log('2026-10-15', 55, 10, true),
  log('2026-10-22', 57.5, 10),
];

describe('referencia nueva de un ejercicio', () => {
  it('guarda la última fecha marcada, por ejercicio', () => {
    const refs = ultimaReferenciaPorEjercicio([...HISTORIA, log('2026-10-05', 40, 8, true, 'curl')]);
    expect(refs.get('prensa')).toBe('2026-10-15');
    expect(refs.get('curl')).toBe('2026-10-05');
    expect(refs.get('remo')).toBeUndefined();
  });

  it('solo es «anterior» lo de antes de esa fecha; el propio día ya es la referencia', () => {
    const refs = ultimaReferenciaPorEjercicio(HISTORIA);
    expect(esAnteriorALaReferencia(refs, 'prensa', '2026-10-08')).toBe(true);
    expect(esAnteriorALaReferencia(refs, 'prensa', '2026-10-15')).toBe(false);
    expect(esAnteriorALaReferencia(refs, 'curl', '2026-10-08')).toBe(false);
    expect(esAnteriorALaReferencia(undefined, 'prensa', '2026-10-08')).toBe(false);
  });
});

describe('lo que mide fuerza deja de mirar atrás', () => {
  it('récords: el mejor histórico solo cuenta desde la referencia', () => {
    const conRef = allTimeBestBefore(HISTORIA, '2026-10-22').get('prensa')!;
    const sinRef = allTimeBestBefore(HISTORIA.map(l => ({ ...l, entries: l.entries.map(e => ({ ...e, nuevaReferencia: undefined })) })), '2026-10-22').get('prensa')!;
    expect(conRef).toBeLessThan(sinRef);
  });

  it('récords: el día que se marca la referencia no hay historial, así que no hay récord posible', () => {
    expect(allTimeBestBefore(HISTORIA, '2026-10-15').has('prensa')).toBe(false);
  });

  it('1RM: las series de antes no cuentan, pero el trabajo sí', () => {
    const refs = ultimaReferenciaPorEjercicio(HISTORIA);
    const antes = aggregate(HISTORIA.slice(0, 2), null, refs).perExercise.get('prensa')!;
    expect(antes.bestOrm).toBe(0);
    expect(antes.sets).toBe(2);
    expect(antes.tonnage).toBe(70 * 10 + 72.5 * 10);
  });

  it('informe: no enseña una caída falsa frente a la ventana anterior', () => {
    const informe = buildTrainingReport({
      logs: HISTORIA, exercises: [], mesocycles: [],
      periodStart: '2026-10-15', periodEnd: '2026-10-28', comparison: { mode: 'weeks', n: 2 },
    });
    const prensa = informe.perExercise.find(e => e.exerciseId === 'prensa')!;
    // La ventana anterior (1-14 oct) es la prensa con recorrido corto: no se compara.
    expect(prensa.prevBestOrm).toBeNull();
    expect(prensa.deltaOrmPct).toBeNull();
    // Y sin historial de la tarea nueva antes de la ventana, tampoco hay récord.
    expect(prensa.isPR).toBe(false);
    // El trabajo de la ventana sí está entero.
    expect(prensa.sets).toBe(2);
  });

  it('informe: sin la marca, la misma historia sí daría una caída (es lo que se evita)', () => {
    const sin = HISTORIA.map(l => ({ ...l, entries: l.entries.map(({ nuevaReferencia: _n, ...e }) => e) }));
    const informe = buildTrainingReport({
      logs: sin, exercises: [], mesocycles: [],
      periodStart: '2026-10-15', periodEnd: '2026-10-28', comparison: { mode: 'weeks', n: 2 },
    });
    const prensa = informe.perExercise.find(e => e.exerciseId === 'prensa')!;
    expect(prensa.deltaOrmPct).toBeLessThan(-15);
  });

  it('tendencia: la curva empieza en la referencia', () => {
    expect(ewmaDeSeriePorSesion(HISTORIA, 'prensa').map(p => p.date)).toEqual(['2026-10-15', '2026-10-22']);
  });

  it('sin ninguna referencia marcada, todo sigue igual que antes', () => {
    const sin = HISTORIA.map(l => ({ ...l, entries: l.entries.map(({ nuevaReferencia: _n, ...e }) => e) }));
    expect(ewmaDeSeriePorSesion(sin, 'prensa')).toHaveLength(4);
    expect(allTimeBestBefore(sin, '2026-10-15').has('prensa')).toBe(true);
  });
});
