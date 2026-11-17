import { describe, it, expect } from 'vitest';
import { Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER, WorkoutLog, WorkoutSetLog } from '../types';
import { aggregate, allTimeBestBefore, buildTrainingReport, resolveWindows } from './trainingReport';
import { rmDeSerie } from './oneRepMax';

/* Los tres modos de comparación de `resolveWindows`. El tercero ('offset') se
   añadió para la pestaña de Revisión del coach; los dos primeros llevaban sin
   test desde que se escribieron, así que se cubren de paso. */

function meso(id: string, number: number, startDate: string, weeks: number): Mesocycle {
  const groups = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) groups[g] = { series: 0, priority: 'media' };
  return { id, athleteId: 'a@b.com', number, startDate, weeks, objective: '', daysPerWeek: 4, groups } as Mesocycle;
}

describe('resolveWindows · modo weeks', () => {
  it('desplaza la ventana entera n semanas hacia atrás', () => {
    const w = resolveWindows('2026-09-08', '2026-09-14', { mode: 'weeks', n: 1 }, []);
    expect(w).toMatchObject({
      curStart: '2026-09-08', curEnd: '2026-09-14',
      prevStart: '2026-09-01', prevEnd: '2026-09-07',
      comparisonLabel: 'vs la semana anterior',
    });
  });

  it('pluraliza a partir de 2', () => {
    expect(resolveWindows('2026-09-01', '2026-09-14', { mode: 'weeks', n: 2 }, []).comparisonLabel)
      .toBe('vs 2 semanas antes');
  });
});

describe('resolveWindows · modo mesocycle', () => {
  const m1 = meso('m1', 1, '2026-08-03', 5);
  const m2 = meso('m2', 2, '2026-09-07', 5);

  it('coge los dos bloques ENTEROS, ignorando el periodo que se le pase', () => {
    const w = resolveWindows('2026-09-07', '2026-09-14', { mode: 'mesocycle', currentId: 'm2', previousId: 'm1' }, [m1, m2]);
    expect(w).toMatchObject({
      curStart: '2026-09-07', curEnd: '2026-10-11',   // las 5 semanas, no hasta el 14
      prevStart: '2026-08-03', prevEnd: '2026-09-06',
      comparisonLabel: 'vs Macrociclo 1',
    });
  });

  it('sin bloque previo lo dice en vez de comparar contra nada', () => {
    const w = resolveWindows('2026-08-03', '2026-09-06', { mode: 'mesocycle', currentId: 'm1', previousId: null }, [m1]);
    expect(w.prevStart).toBeNull();
    expect(w.prevEnd).toBeNull();
    expect(w.comparisonLabel).toBe('sin macrociclo previo');
  });
});

describe('resolveWindows · modo offset', () => {
  it('respeta el periodo que se le pasa y desplaza los dos extremos los mismos días', () => {
    // Los 8 primeros días del bloque nuevo contra los 8 primeros del anterior,
    // que empezó 35 días antes. Es lo que impide el falso −45 % de tonelaje al
    // comparar un bloque a medias contra uno terminado.
    const w = resolveWindows(
      '2026-09-07', '2026-09-14',
      { mode: 'offset', dias: 35, label: 'vs el mismo tramo de Meso #1' },
      [],
    );
    expect(w).toEqual({
      curStart: '2026-09-07', curEnd: '2026-09-14',
      prevStart: '2026-08-03', prevEnd: '2026-08-10',
      comparisonLabel: 'vs el mismo tramo de Meso #1',
    });
    // Las dos ventanas miden lo mismo: ese es el punto entero del modo.
    const dias = (a: string, b: string) =>
      (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000;
    expect(dias(w.curStart, w.curEnd)).toBe(dias(w.prevStart!, w.prevEnd!));
  });

  it('no necesita la lista de mesociclos', () => {
    const w = resolveWindows('2026-09-01', '2026-09-07', { mode: 'offset', dias: 7, label: 'x' }, []);
    expect(w.prevStart).toBe('2026-08-25');
  });
});

// ── D2 (17-11-2026): el 1RM solo sale de las series válidas ─────────────────

describe('1RM del informe con series válidas (D2)', () => {
  const s = (weight: number, repsDone: number, rir = 2, extra: Partial<WorkoutSetLog> = {}): WorkoutSetLog => ({ weight, repsDone, rir, ...extra });
  const log = (date: string, sets: WorkoutSetLog[], exerciseId = 'press'): WorkoutLog => ({
    id: `l-${date}-${exerciseId}`, athleteId: 'a@b.com', workoutId: 'w', assignmentId: 'as', date, completedAt: `${date}T10:00:00.000Z`,
    entries: [{ exerciseId, sets }],
  });
  const EJ: Exercise[] = [
    { id: 'press', ownerId: 'c', name: 'Press banca', primaryFocus: '', muscleGroup: 'pecho', type: 'fuerza', isCustom: false },
    { id: 'remo', ownerId: 'c', name: 'Remo', primaryFocus: '', muscleGroup: 'dorsal', type: 'fuerza', isCustom: false },
  ];
  const informe = (logs: WorkoutLog[]) => buildTrainingReport({
    logs, exercises: EJ, mesocycles: [], periodStart: '2026-09-08', periodEnd: '2026-09-14', comparison: { mode: 'weeks', n: 1 },
  });

  it('el mejor 1RM es el de la mejor serie válida: ni la de 20 repeticiones, ni la de RIR 4, ni la bajada, ni la del RIR sin apuntar', () => {
    const sets = [
      s(80, 8),                               // la buena
      s(70, 20, 2),                           // demasiadas repeticiones
      s(95, 8, 4),                            // lejos del fallo
      s(100, 8, 0, { segmento: true }),       // bajada
      s(90, 8, 2, { rirApuntado: false }),    // RIR pautado sin tocar
    ];
    const row = aggregate([log('2026-09-08', sets)]).perExercise.get('press')!;
    expect(row.bestOrm).toBe(rmDeSerie(s(80, 8)));
    // El trabajo sí cuenta entero: series (sin la bajada), repeticiones y kilos.
    expect(row).toMatchObject({ sets: 4, reps: 52, tonnage: 80 * 8 + 70 * 20 + 95 * 8 + 100 * 8 + 90 * 8 });
  });

  it('el récord a batir también es una marca de verdad', () => {
    const logs = [log('2026-09-01', [s(80, 8), s(70, 20, 4)]), log('2026-09-08', [s(82.5, 8)])];
    expect(allTimeBestBefore(logs, '2026-09-08').get('press')).toBe(rmDeSerie(s(80, 8)));
    // Antes la de 20 a RIR 4 era «el récord» y el 82,5 × 8 no lo batía.
    expect(informe(logs).perExercise[0]).toMatchObject({ isPR: true, bestOrm: rmDeSerie(s(82.5, 8)) });
  });

  it('una ventana sin series válidas no tiene marca: ni −100 % ni récord', () => {
    // La semana pasada, 80 × 8 a RIR 2; esta, todo a RIR 4.
    const sinMarcaAhora = informe([log('2026-09-01', [s(80, 8)]), log('2026-09-08', [s(80, 8, 4), s(80, 8, 4)])]).perExercise[0];
    expect(sinMarcaAhora).toMatchObject({ bestOrm: 0, deltaOrmPct: null, isPR: false, sets: 2 });
    // Y al revés: sin marca la semana pasada, no hay con qué comparar.
    const sinMarcaAntes = informe([log('2026-09-01', [s(80, 15)]), log('2026-09-08', [s(80, 8)])]).perExercise[0];
    expect(sinMarcaAntes).toMatchObject({ prevBestOrm: null, deltaOrmPct: null, isPR: false });
  });

  it('el 1RM medio del grupo solo junta ejercicios con marca', () => {
    const r = informe([
      log('2026-09-08', [s(80, 8)]),
      log('2026-09-08', [s(60, 20, 4)], 'remo'),
    ]);
    expect(r.muscleGroups.find(g => g.group === 'pecho')!.meanOrm).toBe(rmDeSerie(s(80, 8)));
    expect(r.muscleGroups.find(g => g.group === 'dorsal')!.meanOrm).toBeNull();
  });
});
